import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { ImportMetadata } from "../../../src/shared/types.ts";
import { DebitorRawRow, DebitorCompressedRow, DictionaryEntry, DictionaryCategory } from "../../../types/debitor/index.ts";
import { DictionaryEngine } from "../storage/dictionary.ts";
import { CompressionEngine } from "../storage/compression.ts";
import { DebitorCache } from "../storage/cache.ts";
import { DebtorAction, DebtorActionEngine, escapeFormula } from "../storage/actions.ts";
import { DebtorNote, DebtorNoteEngine } from "../storage/notes.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_FILE = path.join(DATA_DIR, "debitor_system_metadata.json");

export class DebitorGoogleSheetsService {
  private static ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (e) {
        console.warn("[Vercel/ReadOnly Fallback] Failed to create data directory.", e);
      }
    }
  }

  // Get credentials
  private static getGoogleCredentials() {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_DEBITOR_SPREADSHEET_ID;

    const isConfigured = !!(clientEmail && privateKey && spreadsheetId);
    return { clientEmail, privateKey, spreadsheetId, isConfigured };
  }

  // Test sheet connection
  public static async testConnection(): Promise<{ success: boolean; message: string }> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      return { success: false, message: "Mangler Google credentials eller GOOGLE_DEBITOR_SPREADSHEET_ID" };
    }

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      return {
        success: true,
        message: `Forbindelse lykkedes! Fandt ${spreadsheet.data.sheets?.length || 0} faner i debitor-regnearket.`,
      };
    } catch (e: any) {
      return { success: false, message: `Forbindelsesfejl: ${e.message || e}` };
    }
  }

  // Save Debitor Snapshot to Google Sheets
  public static async saveSnapshot(
    worksheetName: string,
    rows: DebitorRawRow[],
    metadata: ImportMetadata
  ): Promise<boolean> {
    // 1. Invalidate caches
    DebitorCache.invalidateAll();

    // 2. Local serialization fallback
    this.ensureDirectories();
    const localWsPath = path.join(DATA_DIR, `debitor_ws_${worksheetName}.json`);
    try {
      fs.writeFileSync(localWsPath, JSON.stringify(rows, null, 2), "utf-8");
      
      // Save metadata locally
      const localMeta = await this.getImportHistory();
      // handle replace
      if (metadata.replacedImportId) {
        const idx = localMeta.findIndex((h) => h.importId === metadata.replacedImportId);
        if (idx !== -1) {
          localMeta[idx].importStatus = "failed";
          localMeta[idx].errorMessage = `Erstattet af Import ${metadata.importId}`;
        }
      }
      localMeta.push(metadata);
      fs.writeFileSync(METADATA_FILE, JSON.stringify(localMeta, null, 2), "utf-8");
    } catch (err) {
      console.warn("[Vercel/ReadOnly Fallback] Failed to save local debitor worksheet or metadata", err);
    }

    // 3. Compress rows
    const compressedRows = CompressionEngine.compressRows(rows);

    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      console.log(`[Debitor Database Simulator] Gemte snapshot ${worksheetName} og logførte metadata (Simuleret/Mock-tilstand).`);
      return true;
    }

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Fetch spreadsheet sheets
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetExists = spreadsheet.data.sheets?.some((s) => s.properties?.title === worksheetName);

      // Create sheet tab if it doesn't exist
      if (!sheetExists) {
        console.log(`[Google Sheets API] Opretter ny fane "${worksheetName}" i debitor-spreadsheeting...`);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: worksheetName } } }],
          },
        });
      }

      // Clear existing content in snapshot
      console.log(`[Google Sheets API] Rydder gamle data i range "${worksheetName}!A1:J50000"...`);
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${worksheetName}!A1:J50000`,
      });

      // Headers mapping compressed keys
      const headers = ["cn", "cid", "sb", "ov", "pt", "li", "ch", "sp", "lc", "sl"];
      const values: any[][] = [headers];
      compressedRows.forEach((r) => {
        values.push([r.cn, r.cid, r.sb, r.ov, r.pt, r.li, r.ch, r.sp, r.lc, r.sl]);
      });

      // Write values
      console.log(`[Google Sheets API] Skriver ${compressedRows.length} komprimerede rækker til "${worksheetName}"...`);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${worksheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });

      // Sync Dictionary Sheet
      await this.syncDictionarySheet(sheets, spreadsheetId, spreadsheet);

      // Sync Metadata (_System tab)
      await this.syncSystemMetadataSheet(sheets, spreadsheetId, spreadsheet, metadata);

      return true;
    } catch (e: any) {
      console.error("[Google Sheets API] Fejl under synkronisering af debitor snapshot:", e);
      // Propagate failure to metadata status
      metadata.importStatus = "failed";
      metadata.errorMessage = `Google Sheets Sync failed: ${e.message || e}`;
      
      // Update local storage status
      try {
        const localMeta = await this.getImportHistory();
        const idx = localMeta.findIndex((h) => h.importId === metadata.importId);
        if (idx !== -1) {
          localMeta[idx] = metadata;
        } else {
          localMeta.push(metadata);
        }
        fs.writeFileSync(METADATA_FILE, JSON.stringify(localMeta, null, 2), "utf-8");
      } catch {}

      throw new Error(`Google Sheets debitor-synkroniseringsfejl: ${e.message || e}`);
    }
  }

  // Sync dictionary rows to `_Dictionary` worksheet
  private static async syncDictionarySheet(sheets: any, spreadsheetId: string, spreadsheet: any) {
    const hasDict = spreadsheet.data.sheets?.some((s: any) => s.properties?.title === "_Dictionary");

    if (!hasDict) {
      console.log(`[Google Sheets API] Opretter ordbogs-fane "_Dictionary"...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "_Dictionary" } } }],
        },
      });
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `_Dictionary!A1:C100000`,
    });

    const entries = DictionaryEngine.getAllEntries();
    const headers = ["Category", "ID", "Value"];
    const values: any[][] = [headers];

    entries.forEach((e) => {
      values.push([e.category, e.id, e.value]);
    });

    console.log(`[Google Sheets API] Gemmer ${entries.length} ordbogsindgange til "_Dictionary"...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `_Dictionary!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }

  // Load dictionaries from `_Dictionary` worksheet
  public static async loadDictionaryFromGoogle(): Promise<void> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) return;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasDict = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Dictionary");
      if (!hasDict) return;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_Dictionary!A2:C100000",
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const entries: DictionaryEntry[] = rows.map((r) => ({
          category: r[0] as DictionaryCategory,
          id: Number(r[1]),
          value: r[2] || "",
        }));
        DictionaryEngine.setEntries(entries);
        console.log(`[Google Sheets API] Indlæste ${entries.length} ordbogsindgange.`);
      }
    } catch (err) {
      console.error("[Google Sheets API] Kunne ikke indlæse ordbog fra Google Sheets:", err);
    }
  }

  // Sync import metadata logs to `_System` sheet
  private static async syncSystemMetadataSheet(
    sheets: any,
    spreadsheetId: string,
    spreadsheet: any,
    metadata: ImportMetadata
  ) {
    const hasSystem = spreadsheet.data.sheets?.some((s: any) => s.properties?.title === "_System");

    if (!hasSystem) {
      console.log(`[Google Sheets API] Opretter system-fane "_System"...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: "_System" } } }],
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
        "File Hash",
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `_System!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [systemHeaders] },
      });
    }

    // Build values to append
    const metaValue = [
      metadata.importId || "",
      metadata.businessModule || "Debitor",
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
      metadata.fileHash || "",
    ];

    console.log(`[Google Sheets API] Registrerer metadata række i "_System"...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `_System!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [metaValue] },
    });
  }

  // Get Import History Logs
  public static async getImportHistory(): Promise<ImportMetadata[]> {
    const cached = DebitorCache.getMetadata();
    if (cached) return cached;

    let history: ImportMetadata[] = [];
    this.ensureDirectories();

    // Load local fallback first
    if (fs.existsSync(METADATA_FILE)) {
      try {
        const content = fs.readFileSync(METADATA_FILE, "utf-8");
        history = JSON.parse(content) as ImportMetadata[];
      } catch (err) {
        console.error("Fejl ved læsning af lokal debitor metadata:", err);
      }
    }

    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      DebitorCache.setMetadata(history);
      return history;
    }

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasSystem = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_System");

      if (hasSystem) {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "_System!A2:M2000",
        });

        const rows = response.data.values;
        if (rows && rows.length > 0) {
          const googleHistory: ImportMetadata[] = rows.map((r) => ({
            importId: r[0] || "",
            businessModule: r[1] || "Debitor",
            businessDate: r[2] || "",
            worksheetName: r[3] || r[2] || "",
            uploadedFileName: r[4] || "",
            originalFileSize: Number(r[5]) || 0,
            importedRowCount: Number(r[6]) || 0,
            importedColumnCount: Number(r[7]) || 0,
            importedAt: r[8] || "",
            uploadedBy: r[9] || "",
            importStatus: (r[10] || "success") as "success" | "failed",
            importVersion: Number(r[11]) || 1,
            fileHash: r[12] || "",
            templateVersion: "1.0.0",
            applicationVersion: "1.0.0",
          }));

          // Merge google history with local
          googleHistory.forEach((gh) => {
            const idx = history.findIndex((h) => h.importId === gh.importId);
            if (idx === -1) {
              history.push(gh);
            } else {
              history[idx] = gh;
            }
          });

          // Sort descending
          history.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
          
          // Write merged back locally
          try {
            fs.writeFileSync(METADATA_FILE, JSON.stringify(history, null, 2), "utf-8");
          } catch {}
        }
      }
    } catch (e) {
      console.error("[Google Sheets API] Kunne ikke hente debitor historik:", e);
    }

    DebitorCache.setMetadata(history);
    return history;
  }

  // Get Worksheet Data
  public static async getWorksheetData(worksheetName: string): Promise<DebitorRawRow[]> {
    // Check cache
    const cached = DebitorCache.getSnapshot(worksheetName);
    if (cached) return cached.rows;

    this.ensureDirectories();
    let localRows: DebitorRawRow[] = [];
    const localWsPath = path.join(DATA_DIR, `debitor_ws_${worksheetName}.json`);

    // Load locally if file exists
    if (fs.existsSync(localWsPath)) {
      try {
        const content = fs.readFileSync(localWsPath, "utf-8");
        localRows = JSON.parse(content) as DebitorRawRow[];
      } catch (err) {
        console.error("Fejl ved indlæsning af lokal debitor fane:", err);
      }
    }

    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      if (localRows.length > 0) {
        // Populate static dictionary items from rows to stay consistent
        localRows.forEach((r) => {
          DictionaryEngine.getOrCreateId("customer", r.customerName);
          DictionaryEngine.getOrCreateId("payment_terms", r.paymentTerms);
          DictionaryEngine.getOrCreateId("credit_handling", r.creditHandling);
          DictionaryEngine.getOrCreateId("salesperson", r.salesperson);
          DictionaryEngine.getOrCreateId("location", r.location);
          DictionaryEngine.getOrCreateId("seller", r.seller);
        });

        DebitorCache.setSnapshot(worksheetName, {
          worksheetName,
          businessDate: worksheetName,
          importedAt: new Date().toISOString(),
          rows: localRows,
        });
      }
      return localRows;
    }

    try {
      // Hydrate Dictionaries from Sheet first
      await this.loadDictionaryFromGoogle();

      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasSheet = spreadsheet.data.sheets?.some((s) => s.properties?.title === worksheetName);
      if (!hasSheet) return localRows; // Fallback to local if Google sheet missing

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${worksheetName}!A2:J100000`,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) return localRows;

      const compressedRows: DebitorCompressedRow[] = rows.map((r) => ({
        cn: r[0] || "",
        cid: Number(r[1]) || 0,
        sb: Number(r[2]) || 0,
        ov: Number(r[3]) || 0,
        pt: Number(r[4]) || 0,
        li: r[5] || "",
        ch: Number(r[6]) || 0,
        sp: Number(r[7]) || 0,
        lc: Number(r[8]) || 0,
        sl: Number(r[9]) || 0,
      }));

      // Decompress
      const decompressed = CompressionEngine.decompressRows(compressedRows);

      // Save to local cache file
      try {
        fs.writeFileSync(localWsPath, JSON.stringify(decompressed, null, 2), "utf-8");
      } catch {}

      DebitorCache.setSnapshot(worksheetName, {
        worksheetName,
        businessDate: worksheetName,
        importedAt: new Date().toISOString(),
        rows: decompressed,
      });

      return decompressed;
    } catch (e) {
      console.error(`[Google Sheets API] Kunne ikke hente debitor fane "${worksheetName}":`, e);
      return localRows;
    }
  }

  // Fetch `SaldoPosterRAW` manually maintained worksheet if it exists
  public static async getSaldoPosterRAW(): Promise<any[]> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) return [];

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasSheet = spreadsheet.data.sheets?.some((s) => s.properties?.title === "SaldoPosterRAW");
      if (!hasSheet) return [];

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "SaldoPosterRAW!A1:Z50000",
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) return [];

      const headers = rows[0];
      const dataRows = rows.slice(1);
      return dataRows.map((r) => {
        const obj: Record<string, any> = {};
        headers.forEach((h: string, idx: number) => {
          obj[h] = r[idx];
        });
        return obj;
      });
    } catch (err) {
      console.error("[Google Sheets API] Kunne ikke hente SaldoPosterRAW:", err);
      return [];
    }
  }

  // Load Actions from `_Actions` worksheet
  public static async loadActionsFromGoogle(): Promise<DebtorAction[]> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      return DebtorActionEngine.loadLocal();
    }

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasActions = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Actions");
      if (!hasActions) {
        // Create if missing!
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "_Actions" } } }],
          },
        });
        // Write headers
        const headers = ["id", "cn", "ty", "st", "pr", "ow", "dd", "cm", "cr", "ca", "ub", "ua", "cl", "pd", "rf"];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `_Actions!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
        return [];
      }

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_Actions!A2:O100000",
      });

      const rows = response.data.values;
      const actions: DebtorAction[] = [];
      if (rows && rows.length > 0) {
        rows.forEach((r) => {
          actions.push({
            id: r[0] || "",
            customerNumber: r[1] || "",
            type: r[2] || "other",
            status: r[3] || "open",
            priority: r[4] || "medium",
            owner: r[5] || null,
            dueDate: r[6] || null,
            comment: r[7] || "",
            createdBy: r[8] || null,
            createdAt: r[9] || "",
            updatedBy: r[10] || null,
            updatedAt: r[11] || "",
            closedAt: r[12] || null,
            promisedPaymentDate: r[13] || null,
            reference: r[14] || null,
          });
        });
      }
      DebtorActionEngine.setActions(actions);
      return actions;
    } catch (err) {
      console.error("[Google Sheets API] Failed to load actions from Google Sheets:", err);
      return DebtorActionEngine.loadLocal();
    }
  }

  // Save/Append a new Action to `_Actions` worksheet
  public static async createActionInGoogle(action: DebtorAction): Promise<void> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    
    // Always save locally first
    const localActions = DebtorActionEngine.getAllActions();
    localActions.push(action);
    DebtorActionEngine.setActions(localActions);

    if (!isConfigured) return;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Make sure worksheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasActions = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Actions");
      if (!hasActions) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "_Actions" } } }],
          },
        });
        const headers = ["id", "cn", "ty", "st", "pr", "ow", "dd", "cm", "cr", "ca", "ub", "ua", "cl", "pd", "rf"];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `_Actions!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
      }

      // Escape formula injection for comment, owner, reference
      const rowValues = [
        action.id,
        action.customerNumber,
        action.type,
        action.status,
        action.priority,
        escapeFormula(action.owner),
        action.dueDate || "",
        escapeFormula(action.comment),
        escapeFormula(action.createdBy),
        action.createdAt,
        escapeFormula(action.updatedBy),
        action.updatedAt,
        action.closedAt || "",
        action.promisedPaymentDate || "",
        escapeFormula(action.reference),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "_Actions!A2",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    } catch (err) {
      console.error("[Google Sheets API] Failed to append action to Google Sheets:", err);
    }
  }

  // Update an Action in `_Actions` worksheet
  public static async updateActionInGoogle(id: string, updatedAction: DebtorAction): Promise<void> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();

    // Always update locally first
    const localActions = DebtorActionEngine.getAllActions();
    const idx = localActions.findIndex((a) => a.id === id);
    if (idx !== -1) {
      localActions[idx] = updatedAction;
    }
    DebtorActionEngine.setActions(localActions);

    if (!isConfigured) return;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // To update in Google Sheets, we first read all IDs to find the correct row
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_Actions!A2:A100000",
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const rowIdx = rows.findIndex((r) => r[0] === id);
        if (rowIdx !== -1) {
          const sheetRow = rowIdx + 2; // +2 offset for 1-based index and header row
          const rowValues = [
            updatedAction.id,
            updatedAction.customerNumber,
            updatedAction.type,
            updatedAction.status,
            updatedAction.priority,
            escapeFormula(updatedAction.owner),
            updatedAction.dueDate || "",
            escapeFormula(updatedAction.comment),
            escapeFormula(updatedAction.createdBy),
            updatedAction.createdAt,
            escapeFormula(updatedAction.updatedBy),
            updatedAction.updatedAt,
            updatedAction.closedAt || "",
            updatedAction.promisedPaymentDate || "",
            escapeFormula(updatedAction.reference),
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `_Actions!A${sheetRow}:O${sheetRow}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rowValues] },
          });
        }
      }
    } catch (err) {
      console.error("[Google Sheets API] Failed to update action in Google Sheets:", err);
    }
  }

  // Load Notes from `_Notes` worksheet
  public static async loadNotesFromGoogle(): Promise<DebtorNote[]> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    if (!isConfigured) {
      return DebtorNoteEngine.loadLocal();
    }

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Check if sheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasNotes = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Notes");
      if (!hasNotes) {
        // Create if missing!
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "_Notes" } } }],
          },
        });
        // Write headers
        const headers = ["id", "cn", "ca", "tx", "au", "cr", "ub", "ua", "pn"];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `_Notes!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
        return [];
      }

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_Notes!A2:I100000",
      });

      const rows = response.data.values;
      const notes: DebtorNote[] = [];
      if (rows && rows.length > 0) {
        rows.forEach((r) => {
          notes.push({
            id: r[0] || "",
            customerNumber: r[1] || "",
            category: r[2] || "general",
            text: r[3] || "",
            author: r[4] || "",
            createdAt: r[5] || "",
            updatedBy: r[6] || null,
            updatedAt: r[7] || "",
            isPinned: r[8] === "TRUE" || r[8] === "true",
          });
        });
      }
      DebtorNoteEngine.setNotes(notes);
      return notes;
    } catch (err) {
      console.error("[Google Sheets API] Failed to load notes from Google Sheets:", err);
      return DebtorNoteEngine.loadLocal();
    }
  }

  // Save/Append a new Note to `_Notes` worksheet
  public static async createNoteInGoogle(note: DebtorNote): Promise<void> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();
    
    // Always save locally first
    const localNotes = DebtorNoteEngine.getAllNotes();
    localNotes.push(note);
    DebtorNoteEngine.setNotes(localNotes);

    if (!isConfigured) return;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // Make sure worksheet exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const hasNotes = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Notes");
      if (!hasNotes) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: "_Notes" } } }],
          },
        });
        const headers = ["id", "cn", "ca", "tx", "au", "cr", "ub", "ua", "pn"];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `_Notes!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [headers] },
        });
      }

      const rowValues = [
        note.id,
        note.customerNumber,
        note.category,
        escapeFormula(note.text),
        escapeFormula(note.author),
        note.createdAt,
        escapeFormula(note.updatedBy),
        note.updatedAt,
        note.isPinned ? "TRUE" : "FALSE",
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "_Notes!A2",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    } catch (err) {
      console.error("[Google Sheets API] Failed to append note to Google Sheets:", err);
    }
  }

  // Update a Note in `_Notes` worksheet (pin state, etc.)
  public static async updateNoteInGoogle(id: string, updatedNote: DebtorNote): Promise<void> {
    const { clientEmail, privateKey, spreadsheetId, isConfigured } = this.getGoogleCredentials();

    // Always update locally first
    const localNotes = DebtorNoteEngine.getAllNotes();
    const idx = localNotes.findIndex((n) => n.id === id);
    if (idx !== -1) {
      localNotes[idx] = updatedNote;
    }
    DebtorNoteEngine.setNotes(localNotes);

    if (!isConfigured) return;

    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      // To update in Google Sheets, we first read all IDs to find the correct row
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "_Notes!A2:A100000",
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        const rowIdx = rows.findIndex((r) => r[0] === id);
        if (rowIdx !== -1) {
          const sheetRow = rowIdx + 2; // +2 offset for 1-based index and header row
          const rowValues = [
            updatedNote.id,
            updatedNote.customerNumber,
            updatedNote.category,
            escapeFormula(updatedNote.text),
            escapeFormula(updatedNote.author),
            updatedNote.createdAt,
            escapeFormula(updatedNote.updatedBy),
            updatedNote.updatedAt,
            updatedNote.isPinned ? "TRUE" : "FALSE",
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `_Notes!A${sheetRow}:I${sheetRow}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rowValues] },
          });
        }
      }
    } catch (err) {
      console.error("[Google Sheets API] Failed to update note in Google Sheets:", err);
    }
  }
}
