import fs from "fs";
import path from "path";
import crypto from "crypto";
import { google } from "googleapis";
import { SalesRawRow, ImportMetadata } from "../src/shared/types.js";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_FILE = path.join(DATA_DIR, "system_metadata.json");

// In-memory fallbacks for serverless read-only platforms (Vercel)
const inMemoryHistory: ImportMetadata[] = [];
const inMemoryWorksheets: Record<string, SalesRawRow[]> = {};

// Helper to make sure directory exists
function ensureDirectories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("[Vercel/ReadOnly Fallback] Failed to create data directory.", e);
  }
}

// Generate unique hash for file
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

// Check if file is duplicate
export async function checkDuplicateFile(fileHash: string): Promise<ImportMetadata | null> {
  const metadataList = await getImportHistory();
  return metadataList.find((m) => m.fileHash === fileHash && m.importStatus === "success") || null;
}

// Get import history (The _System worksheet)
export async function getImportHistory(): Promise<ImportMetadata[]> {
  ensureDirectories();
  let fileHistory: ImportMetadata[] = [];
  if (fs.existsSync(METADATA_FILE)) {
    try {
      const content = fs.readFileSync(METADATA_FILE, "utf-8");
      fileHistory = JSON.parse(content) as ImportMetadata[];
    } catch (error) {
      console.error("Error reading metadata history from file:", error);
    }
  }

  // Fetch from Google Sheets and merge newly discovered worksheets or imports
  try {
    const googleHistory = await fetchHistoryFromGoogleSheets();
    if (googleHistory.length > 0) {
      let modified = false;
      googleHistory.forEach((googleItem) => {
        const localIdx = fileHistory.findIndex((lh) => lh.importId === googleItem.importId);
        if (localIdx === -1) {
          fileHistory.push(googleItem);
          modified = true;
        } else {
          const localItem = fileHistory[localIdx];
          if (localItem.importStatus !== googleItem.importStatus || localItem.importVersion < googleItem.importVersion) {
            fileHistory[localIdx] = { ...localItem, ...googleItem };
            modified = true;
          }
        }
      });

      if (modified) {
        try {
          fs.writeFileSync(METADATA_FILE, JSON.stringify(fileHistory, null, 2), "utf-8");
        } catch (err) {
          console.warn("Failed to write merged history to file:", err);
        }
      }
    }
  } catch (err) {
    console.error("[Google Sheets API] Error during background merge:", err);
  }
  
  // Combine file history with in-memory additions
  const combined = [...fileHistory];
  inMemoryHistory.forEach((item) => {
    if (!combined.some((h) => h.importId === item.importId)) {
      combined.push(item);
    }
  });
  
  // Apply any in-memory replacements / status changes
  combined.forEach((item, idx) => {
    const memMatch = inMemoryHistory.find((h) => h.importId === item.importId);
    if (memMatch) {
      combined[idx] = memMatch;
    }
  });

  return combined;
}

// Save import history item
export async function saveImportMetadata(meta: ImportMetadata): Promise<void> {
  ensureDirectories();
  const history = await getImportHistory();
  // If this replaces an existing import, update its status or keep it as replaced
  if (meta.replacedImportId) {
    const idx = history.findIndex((h) => h.importId === meta.replacedImportId);
    if (idx !== -1) {
      history[idx].importStatus = "failed";
      history[idx].errorMessage = `Replaced by Import ${meta.importId}`;
    }
  }
  history.push(meta);
  
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (error) {
    console.warn("[Vercel/ReadOnly Fallback] Failed to write metadata to filesystem. Saving in-memory.", error);
    // Sync with in-memory store
    const memIdx = inMemoryHistory.findIndex((h) => h.importId === meta.importId);
    if (memIdx === -1) {
      inMemoryHistory.push(meta);
    } else {
      inMemoryHistory[memIdx] = meta;
    }
    
    if (meta.replacedImportId) {
      const idx = inMemoryHistory.findIndex((h) => h.importId === meta.replacedImportId);
      if (idx !== -1) {
        inMemoryHistory[idx].importStatus = "failed";
        inMemoryHistory[idx].errorMessage = `Replaced by Import ${meta.importId}`;
      }
    }
  }
}

// Get worksheet data
export async function getWorksheetData(worksheetName: string): Promise<SalesRawRow[]> {
  if (inMemoryWorksheets[worksheetName]) {
    return inMemoryWorksheets[worksheetName];
  }
  ensureDirectories();

  // Search import history to resolve actual worksheet name (e.g. DD-MM-YYYY worksheet name for normalized YYYY-MM-DD key)
  const history = await getImportHistory();
  const matchedMeta = history.find(
    (h) => (h.businessDate === worksheetName || h.worksheetName === worksheetName) && h.importStatus === "success"
  );
  const actualWorksheetName = matchedMeta ? matchedMeta.worksheetName : worksheetName;

  const filePath = path.join(DATA_DIR, `ws_${actualWorksheetName}.json`);
  if (!fs.existsSync(filePath)) {
    // Let's try to fetch from Google Sheets!
    const googleRows = await fetchWorksheetFromGoogleSheets(actualWorksheetName);
    if (googleRows.length > 0) {
      inMemoryWorksheets[actualWorksheetName] = googleRows;
      try {
        fs.writeFileSync(filePath, JSON.stringify(googleRows, null, 2), "utf-8");
      } catch (err) {
        console.warn(`Failed to write fetched worksheet ${actualWorksheetName} to file:`, err);
      }
      return googleRows;
    }
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as SalesRawRow[];
  } catch (error) {
    console.error(`Error reading worksheet ${worksheetName}:`, error);
    return [];
  }
}

// Save worksheet data
export async function saveWorksheetData(worksheetName: string, rows: SalesRawRow[]): Promise<void> {
  inMemoryWorksheets[worksheetName] = rows;
  ensureDirectories();
  const filePath = path.join(DATA_DIR, `ws_${worksheetName}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
  } catch (error) {
    console.warn(`[Vercel/ReadOnly Fallback] Failed to write worksheet ${worksheetName} to filesystem. Saving in memory.`, error);
  }
}

// Convert SalesRawRow array to 2D array for Google Sheets
function convertRowsToValues(rows: SalesRawRow[]): any[][] {
  const headers = [
    "Posting Date",
    "Entry Type",
    "Document Type",
    "Document Number",
    "Item Number",
    "Description",
    "Location Code",
    "Quantity",
    "Invoiced Quantity",
    "Remaining Quantity",
    "Sales Amount",
    "Cost Amount",
    "Source Type",
    "Customer Number",
    "Customer Name",
    "Department Code",
    "Employee Name"
  ];
  
  const values: any[][] = [headers];
  
  rows.forEach((row) => {
    values.push([
      row.postingDate || "",
      row.entryType || "",
      row.documentType || "",
      row.documentNumber || "",
      row.itemNumber || "",
      row.description || "",
      row.locationCode || "",
      row.quantity !== undefined ? row.quantity : 0,
      row.invoicedQuantity !== undefined ? row.invoicedQuantity : 0,
      row.remainingQuantity !== undefined ? row.remainingQuantity : 0,
      row.salesAmount !== undefined ? row.salesAmount : 0,
      row.costAmount !== undefined ? row.costAmount : 0,
      row.sourceType || "",
      row.customerNumber || "",
      row.customerName || "",
      row.departmentCode || "",
      row.employeeName || ""
    ]);
  });
  
  return values;
}

// Google Sheets Write Proxy
// In case of true Google connection, this function will append/write to the actual sheets.
export async function saveToGoogleSheets(worksheetName: string, rows: SalesRawRow[], metadata: ImportMetadata): Promise<boolean> {
  // Save locally first (local cache / file-system sheet simulation)
  await saveWorksheetData(worksheetName, rows);
  await saveImportMetadata(metadata);

  const hasGoogleCreds = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SALES_SPREADSHEET_ID);
  if (!hasGoogleCreds) {
    console.log(`[Database Simulator] Saved worksheet ${worksheetName} and system metadata successfully (Local/Mock Mode).`);
    return true;
  }

  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    // Replace escape sequences in the private key if needed
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SALES_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      console.warn("[Google Sheets API] Missing Google credentials. Running in simulated local mode.");
      return true;
    }

    console.log(`[Google Sheets API] Connecting to spreadsheet ${spreadsheetId} as service account ${clientEmail}...`);
    
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    // 1. Fetch spreadsheet sheets to see if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === worksheetName
    );

    // 2. Create the worksheet sheet/tab if it doesn't exist
    if (!sheetExists) {
      console.log(`[Google Sheets API] Sheet tab "${worksheetName}" does not exist, creating it...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: worksheetName,
                },
              },
            },
          ],
        },
      });
    }

    // 3. Clear existing contents to prevent leftover rows from previous versions
    console.log(`[Google Sheets API] Clearing old data in range "${worksheetName}!A1:Q50000"...`);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${worksheetName}!A1:Q50000`,
    });

    // 4. Write new row values
    console.log(`[Google Sheets API] Writing ${rows.length} rows of data...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${worksheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: convertRowsToValues(rows),
      },
    });

    // 5. Sync metadata history into the _System worksheet
    const systemSheetExists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === "_System"
    );

    if (!systemSheetExists) {
      console.log(`[Google Sheets API] System log tab "_System" does not exist, creating it...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: "_System",
                },
              },
            },
          ],
        },
      });

      const systemHeaders = [
        "Import ID",
        "Business Module",
        "Business Date",
        "Worksheet Name",
        "Uploaded File Name",
        "Original File Size",
        "Imported Row Count",
        "Imported Column Count",
        "Imported At",
        "Uploaded By",
        "Import Status",
        "Import Version",
        "File Hash"
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `_System!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [systemHeaders],
        },
      });
    }

    // Append metadata
    const metaValue = [
      metadata.importId || "",
      metadata.businessModule || "",
      metadata.businessDate || "",
      metadata.worksheetName || "",
      metadata.uploadedFileName || "",
      metadata.originalFileSize || 0,
      metadata.importedRowCount || 0,
      metadata.importedColumnCount || 0,
      metadata.importedAt || "",
      metadata.uploadedBy || "",
      metadata.importStatus || "",
      metadata.importVersion || 1,
      metadata.fileHash || ""
    ];

    console.log(`[Google Sheets API] Logging metadata row to "_System"...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `_System!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [metaValue],
      },
    });

    console.log(`[Google Sheets API] Successfully synchronized worksheet ${worksheetName} to Google Sheet.`);
    return true;
  } catch (e: any) {
    console.error("[Google Sheets API] Error syncing to Google Sheets:", e);
    // Since Google Sheets integration is active and failed, update metadata status to 'failed' and propagate the error.
    metadata.importStatus = "failed";
    metadata.errorMessage = `Google Sheets Sync failed: ${e.message || e}`;
    await saveImportMetadata(metadata); // Overwrite / re-save with failed status
    throw new Error(`Google Sheets synkroniseringsfejl: ${e.message || e}`);
  }
}

// Seed Mock Data if Database is empty
export function seedMockDataIfEmpty() {
  // Empty - mock data seeding is disabled to allow only user-uploaded data to persist.
  console.log("Mock seeding is disabled. Waiting for user Excel imports.");
}

function getImportHistorySync(): ImportMetadata[] {
  if (!fs.existsSync(METADATA_FILE)) {
    return [];
  }
  try {
    const content = fs.readFileSync(METADATA_FILE, "utf-8");
    return JSON.parse(content) as ImportMetadata[];
  } catch {
    return [];
  }
}

// Google Sheets Lazy Loader Helpers

// Helper to normalize dates of format DD-MM-YYYY (or similar) to YYYY-MM-DD
function normalizeDateToYYYYMMDD(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  // Check if matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  // Check if matches DD-MM-YYYY
  const dmYMatch = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmYMatch) {
    const [, d, m, y] = dmYMatch;
    return `${y}-${m}-${d}`;
  }
  // Check if matches D-M-YYYY or similar
  const dmYMatch2 = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmYMatch2) {
    const [, d, m, y] = dmYMatch2;
    const padD = d.padStart(2, "0");
    const padM = m.padStart(2, "0");
    return `${y}-${padM}-${padD}`;
  }
  return null;
}

// Parses string-formatted numeric inputs (including Danish format e.g. "1.234,56") safely
function parseGoogleSheetNumeric(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim();
  if (!str) return 0;
  let isNegative = false;
  if (str.endsWith("-")) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith("-")) {
    isNegative = true;
    str = str.slice(1).trim();
  }
  // Handle Danish format (comma as decimal separator and dots as thousands separators)
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(/,/g, ".");
  } else if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(/,/g, ".");
  }
  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  return isNegative ? -parsed : parsed;
}

async function fetchHistoryFromGoogleSheets(): Promise<ImportMetadata[]> {
  const hasGoogleCreds = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SALES_SPREADSHEET_ID);
  if (!hasGoogleCreds) return [];

  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SALES_SPREADSHEET_ID;

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    // Check if _System sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const hasSystem = spreadsheet.data.sheets?.some(s => s.properties?.title === "_System");
    
    let history: ImportMetadata[] = [];

    if (hasSystem) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_System!A2:M1000",
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        history = rows.map((r) => {
          const rawDate = r[2] || "";
          const normDate = normalizeDateToYYYYMMDD(rawDate) || rawDate;
          return {
            importId: r[0] || "",
            businessModule: r[1] || "Sales",
            businessDate: normDate,
            worksheetName: r[3] || rawDate || normDate,
            uploadedFileName: r[4] || "",
            originalFileSize: Number(r[5]) || 0,
            importedRowCount: Number(r[6]) || 0,
            importedColumnCount: Number(r[7]) || 0,
            importedAt: r[8] || "",
            uploadedBy: r[9] || "",
            importStatus: r[10] || "success",
            importVersion: Number(r[11]) || 1,
            fileHash: r[12] || "",
            templateVersion: "1.0.0",
            applicationVersion: "1.0.0"
          };
        });
      }
    }

    // List all sheets to find any newly created or existing tabs that are not in _System
    const sheetTitles = spreadsheet.data.sheets
      ?.map((s) => s.properties?.title || "")
      .filter((title) => title && !title.startsWith("_")) || [];

    sheetTitles.forEach((title) => {
      const normDate = normalizeDateToYYYYMMDD(title);
      if (!normDate) return; // ignore sheet if it's not a date-related tab

      const exists = history.some((h) => h.worksheetName === title || h.businessDate === normDate);
      if (!exists) {
        console.log(`[Google Sheets API] Discovered tab "${title}" without system log entry. Synthesizing metadata...`);
        history.push({
          importId: `SYN-${normDate.replace(/-/g, "")}`,
          businessModule: "Sales",
          businessDate: normDate,
          worksheetName: title,
          uploadedFileName: `Google Sheet Tab: ${title}`,
          originalFileSize: 0,
          importedRowCount: 100, // placeholder
          importedColumnCount: 17,
          importedAt: new Date().toISOString(),
          uploadedBy: "google-sheets-sync",
          importStatus: "success",
          importVersion: 1,
          fileHash: `syn-${title}`,
          templateVersion: "1.0.0",
          applicationVersion: "1.0.0"
        });
      }
    });

    return history;
  } catch (err) {
    console.error("[Google Sheets API] Failed to fetch import history:", err);
    return [];
  }
}

async function fetchWorksheetFromGoogleSheets(worksheetName: string): Promise<SalesRawRow[]> {
  const hasGoogleCreds = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SALES_SPREADSHEET_ID);
  if (!hasGoogleCreds) return [];

  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SALES_SPREADSHEET_ID;

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    // Check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const hasSheet = spreadsheet.data.sheets?.some(s => s.properties?.title === worksheetName);
    if (!hasSheet) return [];

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${worksheetName}!A2:Q100000`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    return rows.map((r) => {
      let loc = String(r[6] || "HOVED").trim();
      if (loc === "LOK01" || !loc) {
        loc = "HOVED";
      }
      return {
        postingDate: r[0] || "",
        entryType: r[1] || "",
        documentType: r[2] || "",
        documentNumber: r[3] || "",
        itemNumber: r[4] || "",
        description: r[5] || "",
        locationCode: loc,
        quantity: parseGoogleSheetNumeric(r[7]),
        invoicedQuantity: parseGoogleSheetNumeric(r[8] !== undefined ? r[8] : r[7]),
        remainingQuantity: parseGoogleSheetNumeric(r[9]),
        salesAmount: parseGoogleSheetNumeric(r[10]),
        costAmount: parseGoogleSheetNumeric(r[11]),
        sourceType: r[12] || "",
        customerNumber: r[13] || "",
        customerName: r[14] || "",
        departmentCode: r[15] || "",
        employeeName: r[16] || ""
      };
    });
  } catch (err) {
    console.error(`[Google Sheets API] Failed to fetch worksheet ${worksheetName}:`, err);
    return [];
  }
}
