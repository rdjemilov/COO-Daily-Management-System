import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SalesRawRow, ImportMetadata } from "../src/shared/types.js";
import {
  dbGetImportHistory,
  dbSaveImportMetadata,
  dbGetSalesRows,
  dbSaveSalesRows,
  isSupabaseConfigured
} from "./supabaseService.js";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_FILE = path.join(DATA_DIR, "system_metadata.json");

// Local in-memory caches
const inMemoryWorksheets: Record<string, SalesRawRow[]> = {};

function ensureDirectories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("[Local Fallback] Failed to create data directory.", e);
  }
}

// Generate unique MD5 hash for files
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

// Check if file is duplicate
export async function checkDuplicateFile(fileHash: string): Promise<ImportMetadata | null> {
  const metadataList = await getImportHistory();
  return metadataList.find((m) => m.fileHash === fileHash && m.importStatus === "success") || null;
}

// Get import history (Sales module)
export async function getImportHistory(): Promise<ImportMetadata[]> {
  return await dbGetImportHistory("Sales");
}

// Save import history item
export async function saveImportMetadata(meta: ImportMetadata): Promise<void> {
  await dbSaveImportMetadata(meta);
}

function normalizeRowSigns(row: SalesRawRow): SalesRawRow {
  const docType = String(row.documentType || "").trim().toLowerCase();
  const isCreditMemo = docType.includes("kredit") || docType.includes("credit");
  
  if (isCreditMemo) {
    return {
      ...row,
      quantity: -Math.abs(row.quantity),
      salesAmount: -Math.abs(row.salesAmount),
      costAmount: -Math.abs(row.costAmount)
    };
  } else {
    return {
      ...row,
      quantity: Math.abs(row.quantity),
      salesAmount: Math.abs(row.salesAmount),
      costAmount: Math.abs(row.costAmount)
    };
  }
}

// Get worksheet data
export async function getWorksheetData(worksheetName: string): Promise<SalesRawRow[]> {
  if (inMemoryWorksheets[worksheetName]) {
    return inMemoryWorksheets[worksheetName].map(normalizeRowSigns);
  }
  ensureDirectories();

  // Search import history to resolve actual worksheet name
  const history = await getImportHistory();
  const matchedMeta = history.find(
    (h) => (h.businessDate === worksheetName || h.worksheetName === worksheetName) && h.importStatus === "success"
  );
  const actualWorksheetName = matchedMeta ? matchedMeta.worksheetName : worksheetName;

  // First try Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const dbRows = await dbGetSalesRows(actualWorksheetName);
      if (dbRows && dbRows.length > 0) {
        inMemoryWorksheets[actualWorksheetName] = dbRows;
        return dbRows.map(normalizeRowSigns);
      }
    } catch (err) {
      console.warn(`[Supabase] Failed to fetch worksheet ${actualWorksheetName}, trying local backup`, err);
    }
  }

  // Fallback to local backup json
  const filePath = path.join(DATA_DIR, `ws_${actualWorksheetName}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    try {
      const parsed = JSON.parse(content) as SalesRawRow[];
      return parsed.map(normalizeRowSigns);
    } catch (parseError: any) {
      console.warn(`[Self-Healing] JSON parse failed for worksheet ${worksheetName}. Repairing...`, parseError.message);
      let str = content.trim();
      let repaired: any[] | null = null;
      if (str.endsWith("]")) {
        try { repaired = JSON.parse(str); } catch {}
      }
      if (!repaired) {
        let lastBraceIdx = str.lastIndexOf("}");
        while (lastBraceIdx !== -1) {
          const candidate = str.substring(0, lastBraceIdx + 1) + "\n]";
          try {
            const p = JSON.parse(candidate);
            if (Array.isArray(p)) {
              repaired = p;
              break;
            }
          } catch {
            str = str.substring(0, lastBraceIdx);
            lastBraceIdx = str.lastIndexOf("}");
          }
        }
      }
      if (repaired && repaired.length > 0) {
        try { fs.writeFileSync(filePath, JSON.stringify(repaired), "utf-8"); } catch {}
        return (repaired as SalesRawRow[]).map(normalizeRowSigns);
      }
      throw parseError;
    }
  } catch (error) {
    console.error(`Error reading local worksheet ${worksheetName}:`, error);
    return [];
  }
}

// Save worksheet data
export async function saveWorksheetData(worksheetName: string, rows: SalesRawRow[]): Promise<void> {
  inMemoryWorksheets[worksheetName] = rows;
  ensureDirectories();
  const filePath = path.join(DATA_DIR, `ws_${worksheetName}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(rows), "utf-8");
  } catch (error) {
    console.warn(`[Local Fallback] Failed to write worksheet ${worksheetName} to filesystem.`, error);
  }
}

// Main Save/Import Endpoint for Sales data
export async function saveToDatabase(worksheetName: string, rows: SalesRawRow[], metadata: ImportMetadata): Promise<boolean> {
  // Save locally first for robust backups
  await saveWorksheetData(worksheetName, rows);
  await saveImportMetadata(metadata);

  if (!isSupabaseConfigured()) {
    console.log(`[Local Fallback] Saved ${worksheetName} metadata and rows locally. (Supabase not configured yet).`);
    return true;
  }

  try {
    // Save metadata and rows to Supabase
    await dbSaveSalesRows(metadata.importId, rows);
    console.log(`[Supabase] Successfully synchronized worksheet ${worksheetName} to Supabase Database.`);
    return true;
  } catch (e: any) {
    console.error("[Supabase] Error syncing to Supabase:", e);
    metadata.importStatus = "failed";
    metadata.errorMessage = `Supabase Sync failed: ${e.message || e}`;
    await saveImportMetadata(metadata);
    throw new Error(`Supabase synkroniseringsfejl: ${e.message || e}`);
  }
}

export function seedMockDataIfEmpty() {
  console.log("Mock seeding is disabled. Waiting for user Excel/Supabase imports.");
}
