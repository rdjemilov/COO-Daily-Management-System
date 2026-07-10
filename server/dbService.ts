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
  const filePath = path.join(DATA_DIR, `ws_${worksheetName}.json`);
  if (!fs.existsSync(filePath)) {
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

  const useMockData = process.env.USE_MOCK_DATA === "true" || !process.env.GOOGLE_CLIENT_EMAIL;
  if (useMockData) {
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
    // Do not crash the application, return true as we saved locally successfully
    return true;
  }
}

// Seed Mock Data if Database is empty
export function seedMockDataIfEmpty() {
  ensureDirectories();
  if ((fs.existsSync(METADATA_FILE) && getImportHistorySync().length > 0) || inMemoryHistory.length > 0) {
    return;
  }

  console.log("Seeding initial mock historical sales worksheets for Daily Management System...");

  // Generate historical dates relative to July 10, 2026
  const dates = [
    "2026-07-10", // Friday (Today)
    "2026-07-09", // Thursday (Yesterday)
    "2026-07-08", // Wednesday
    "2026-07-07", // Tuesday
    "2026-07-06", // Monday
    "2026-07-03", // Friday (1 week ago)
    "2026-07-02", // Thursday (1 week ago)
    "2026-06-26", // Friday (2 weeks ago)
    "2026-06-12", // Friday (4 weeks ago)
  ];

  const products = [
    { itemNumber: "1001", description: "Letmælk 1L Arla", price: 12.50, cost: 9.20, category: "Dairy" },
    { itemNumber: "1002", description: "Sødmælk 1L Arla", price: 13.00, cost: 9.50, category: "Dairy" },
    { itemNumber: "1003", description: "Smør LURPAK 250g", price: 28.50, cost: 22.10, category: "Dairy" },
    { itemNumber: "2001", description: "Rugbrød Schulstad 1kg", price: 24.00, cost: 16.50, category: "Bread" },
    { itemNumber: "2002", description: "Sødmælksbrød 500g", price: 18.00, cost: 12.00, category: "Bread" },
    { itemNumber: "3001", description: "Kyllingebryst Dansk 1kg", price: 79.95, cost: 58.00, category: "Meat" },
    { itemNumber: "3002", description: "Hakket Oksekød 500g 8-12%", price: 45.00, cost: 32.50, category: "Meat" },
    { itemNumber: "4001", description: "Coca Cola 1.5L Flaske", price: 21.00, cost: 14.20, category: "Drinks" },
    { itemNumber: "4002", description: "Faxe Kondi 1.5L Flaske", price: 20.00, cost: 13.80, category: "Drinks" },
    // Loss items for Sales Without Profit
    { itemNumber: "5001", description: "Svinekoteletter Spotpris 1kg", price: 49.00, cost: 55.00, category: "Meat" }, // Negative gross profit
    { itemNumber: "5002", description: "Økologiske Æg 10stk", price: 25.00, cost: 25.00, category: "Dairy" }, // Zero profit
    // Excluded items
    { itemNumber: "PANT01", description: "Pant flaske A", price: 1.00, cost: 1.00, category: "Pant" },
    { itemNumber: "PANT02", description: "Pant flaske B", price: 1.50, cost: 1.50, category: "Pant" },
    { itemNumber: "9991", description: "Kasse med mælk (Returplast)", price: 45.00, cost: 45.00, category: "Packaging" },
    { itemNumber: "9992", description: "Kortgebyr Nets", price: 1.50, cost: 0.00, category: "Fees" },
    { itemNumber: "9993", description: "Indbetaling kontant", price: 500.00, cost: 500.00, category: "Payments" },
  ];

  const customers = [
    { number: "C10001", name: "Dansk Supermarked" },
    { number: "C10002", name: "Aarhus Kantineservice" },
    { number: "C10003", name: "Københavns Delikatesse" },
    { number: "C10004", name: "Fyn Food Club" },
    { number: "C10005", name: "Nordic Hotel Group" },
    { number: "C99999", name: "Kontant Salg - Aarhus" },
    { number: "C99998", name: "Kontant København" },
  ];

  const locations = ["LOK01", "LOK02", "LOK03"];
  const employees = ["Hans Nielsen", "Mette Jensen", "Ahmet Kaya", "Sofie Hansen"];

  const history: ImportMetadata[] = [];

  dates.forEach((date, dateIdx) => {
    const importId = `IMP-${date.replace(/-/g, "")}-01`;
    const rows: SalesRawRow[] = [];
    const isToday = date === "2026-07-10";

    // Base multiplier to create visual trend (Slight growth from 4 weeks ago to today)
    const baseMultiplier = 1.0 + (dates.length - dateIdx) * 0.04;

    // We will generate 30-40 transactions per day
    const rowCount = Math.floor(35 * baseMultiplier);

    let docCounter = 10000 + dateIdx * 100;

    for (let i = 0; i < rowCount; i++) {
      // Pick a random product
      const product = products[Math.floor(Math.random() * products.length)];
      // Pick a customer
      const customer = customers[Math.floor(Math.random() * customers.length)];
      // Pick a location
      const location = locations[Math.floor(Math.random() * locations.length)];
      // Pick employee
      const employee = employees[Math.floor(Math.random() * employees.length)];

      const quantity = Math.floor(Math.random() * 8) + 1;
      const documentType = Math.random() > 0.08 ? "Faktura" : (Math.random() > 0.5 ? "Kreditnota" : "Salgsleverance");

      // Calculate Sales Amount and Cost Amount
      let salesAmount = parseFloat((product.price * quantity).toFixed(2));
      let costAmount = parseFloat((product.cost * quantity).toFixed(2));

      // Handle document type differences
      if (documentType === "Kreditnota") {
        salesAmount = -salesAmount;
        costAmount = -costAmount;
      } else if (documentType === "Salgsleverance") {
        salesAmount = 0; // Deliveries don't have invoice values
      }

      // Generate a document number
      const docNo = `INV-${docCounter + Math.floor(i / 1.5)}`;

      const row: SalesRawRow = {
        postingDate: date,
        entryType: "Salg",
        documentType: documentType,
        documentNumber: docNo,
        itemNumber: product.itemNumber,
        description: product.description,
        locationCode: location,
        quantity: quantity,
        invoicedQuantity: documentType === "Faktura" ? quantity : 0,
        remainingQuantity: 0,
        salesAmount: salesAmount,
        costAmount: costAmount,
        sourceType: "Kunde",
        customerNumber: customer.number,
        customerName: customer.name,
        departmentCode: "AFD01",
        employeeName: employee,
      };

      rows.push(row);
    }

    // Save worksheet rows
    const filePath = path.join(DATA_DIR, `ws_${date}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf-8");
    } catch (e) {
      console.warn(`[Vercel Fallback] Failed to write mock sheet ${date} to disk. Seeding in-memory.`, e);
    }
    inMemoryWorksheets[date] = rows;

    // Add import metadata record
    const meta: ImportMetadata = {
      importId: importId,
      businessModule: "Sales",
      businessDate: date,
      worksheetName: date,
      uploadedFileName: `NAV_Sales_Export_${date}.xlsx`,
      originalFileSize: 45200 + Math.floor(Math.random() * 5000),
      importedRowCount: rows.length,
      importedColumnCount: 17,
      importedAt: new Date(new Date(date).getTime() + 8 * 3600000).toISOString(), // Imported in morning of that day
      uploadedBy: "studiorasim@gmail.com",
      importStatus: "success",
      importVersion: 1,
      fileHash: crypto.createHash("md5").update(`raw_${date}`).digest("hex"),
      templateVersion: "1.0.0",
      applicationVersion: "1.0.0",
    };

    history.push(meta);
  });

  // Save history metadata
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Vercel Fallback] Failed to write mock metadata to disk. Seeding in-memory.", e);
  }

  // Populate in-memory history
  history.forEach((h) => {
    if (!inMemoryHistory.some((item) => item.importId === h.importId)) {
      inMemoryHistory.push(h);
    }
  });

  console.log("Mock sales worksheets seeded successfully.");
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
