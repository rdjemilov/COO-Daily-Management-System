import fs from "fs";
import path from "path";
import { ImportMetadata } from "../../../src/shared/types.ts";
import { DebitorRawRow } from "../../../types/debitor/index.ts";
import { DictionaryEngine } from "../storage/dictionary.ts";
import { DebitorCache } from "../storage/cache.ts";
import { DebtorActionEngine, DebtorAction } from "../storage/actions.ts";
import { DebtorNoteEngine, DebtorNote } from "../storage/notes.ts";
import {
  dbGetImportHistory,
  dbSaveImportMetadata,
  dbGetDebitorRows,
  dbSaveDebitorRows,
  dbGetActions,
  dbSaveAction,
  dbGetNotes,
  dbSaveNote,
  isSupabaseConfigured
} from "../../../server/supabaseService.js";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_FILE = path.join(DATA_DIR, "debitor_system_metadata.json");

export class DebitorGoogleSheetsService {
  private static ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
  }

  // Test Supabase/Database connection
  public static async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { success: false, message: "Supabase URL veya API Anahtarı (.env içerisinde SUPABASE_URL, SUPABASE_KEY) eksik!" };
    }

    try {
      const history = await dbGetImportHistory("Debitor");
      return {
        success: true,
        message: `Supabase bağlantısı başarılı! Veritabanında ${history.length} adet yükleme geçmişi kaydı bulundu.`,
      };
    } catch (e: any) {
      return { success: false, message: `Supabase bağlantı hatası: ${e.message || e}` };
    }
  }

  // Save Debitor Snapshot
  public static async saveSnapshot(
    worksheetName: string,
    rows: DebitorRawRow[],
    metadata: ImportMetadata
  ): Promise<boolean> {
    DebitorCache.invalidateAll();
    this.ensureDirectories();

    // 1. Local Fallback save
    const localWsPath = path.join(DATA_DIR, `debitor_ws_${worksheetName}.json`);
    try {
      fs.writeFileSync(localWsPath, JSON.stringify(rows, null, 2), "utf-8");
    } catch {}

    // Save metadata locally
    await dbSaveImportMetadata(metadata);

    if (!isSupabaseConfigured()) {
      console.log(`[Local Fallback] Gemte debitor snapshot ${worksheetName} lokalt. (Supabase is not configured yet).`);
      return true;
    }

    try {
      // 2. Save rows to Supabase
      await dbSaveDebitorRows(metadata.importId, rows);
      console.log(`[Supabase] Successfully saved debitor snapshot ${worksheetName} to Supabase.`);
      return true;
    } catch (e: any) {
      console.error("[Supabase] Failed to save debitor snapshot:", e);
      metadata.importStatus = "failed";
      metadata.errorMessage = `Supabase sync failed: ${e.message || e}`;
      await dbSaveImportMetadata(metadata);
      throw new Error(`Supabase debitor-synkroniseringsfejl: ${e.message || e}`);
    }
  }

  // Get Import History Logs
  public static async getImportHistory(): Promise<ImportMetadata[]> {
    const cached = DebitorCache.getMetadata();
    if (cached) return cached;

    const history = await dbGetImportHistory("Debitor");
    DebitorCache.setMetadata(history);
    return history;
  }

  // Get Worksheet Data
  public static async getWorksheetData(worksheetName: string): Promise<DebitorRawRow[]> {
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
      } catch {}
    }

    if (!isSupabaseConfigured()) {
      if (localRows.length > 0) {
        // Hydrate dictionaries to stay consistent
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
      // Load from Supabase
      const dbRows = await dbGetDebitorRows(worksheetName);
      if (dbRows && dbRows.length > 0) {
        // Hydrate dictionaries
        dbRows.forEach((r) => {
          DictionaryEngine.getOrCreateId("customer", r.customerName);
          DictionaryEngine.getOrCreateId("payment_terms", r.paymentTerms);
          DictionaryEngine.getOrCreateId("credit_handling", r.creditHandling);
          DictionaryEngine.getOrCreateId("salesperson", r.salesperson);
          DictionaryEngine.getOrCreateId("location", r.location);
          DictionaryEngine.getOrCreateId("seller", r.seller);
        });

        // Write locally for future fast backup reads
        try {
          fs.writeFileSync(localWsPath, JSON.stringify(dbRows, null, 2), "utf-8");
        } catch {}

        DebitorCache.setSnapshot(worksheetName, {
          worksheetName,
          businessDate: worksheetName,
          importedAt: new Date().toISOString(),
          rows: dbRows,
        });

        return dbRows;
      }
      return localRows;
    } catch (e) {
      console.error(`[Supabase] Failed to fetch worksheet "${worksheetName}":`, e);
      return localRows;
    }
  }

  // Fallback / Standalone implementation of raw transactions
  public static async getSaldoPosterRAW(): Promise<any[]> {
    return [];
  }

  // Load Actions
  public static async loadActionsFromGoogle(): Promise<DebtorAction[]> {
    if (!isSupabaseConfigured()) {
      return DebtorActionEngine.loadLocal();
    }

    try {
      const actions = await dbGetActions();
      if (actions && actions.length > 0) {
        DebtorActionEngine.setActions(actions);
        return actions;
      }
    } catch (err) {
      console.error("[Supabase] Failed to load actions from DB, using local:", err);
    }
    return DebtorActionEngine.loadLocal();
  }

  // Create/Save Action
  public static async createActionInGoogle(action: DebtorAction): Promise<void> {
    // Save locally first
    const localActions = DebtorActionEngine.getAllActions();
    localActions.push(action);
    DebtorActionEngine.setActions(localActions);

    if (!isSupabaseConfigured()) return;

    try {
      await dbSaveAction(action);
    } catch (err) {
      console.error("[Supabase] Failed to save action:", err);
    }
  }

  // Update Action
  public static async updateActionInGoogle(id: string, updatedAction: DebtorAction): Promise<void> {
    // Update locally first
    const localActions = DebtorActionEngine.getAllActions();
    const idx = localActions.findIndex((a) => a.id === id);
    if (idx !== -1) {
      localActions[idx] = updatedAction;
    }
    DebtorActionEngine.setActions(localActions);

    if (!isSupabaseConfigured()) return;

    try {
      await dbSaveAction(updatedAction);
    } catch (err) {
      console.error("[Supabase] Failed to update action in Supabase:", err);
    }
  }

  // Load Notes
  public static async loadNotesFromGoogle(): Promise<DebtorNote[]> {
    if (!isSupabaseConfigured()) {
      return DebtorNoteEngine.loadLocal();
    }

    try {
      const notes = await dbGetNotes();
      if (notes && notes.length > 0) {
        DebtorNoteEngine.setNotes(notes);
        return notes;
      }
    } catch (err) {
      console.error("[Supabase] Failed to load notes from DB, using local:", err);
    }
    return DebtorNoteEngine.loadLocal();
  }

  // Create Note
  public static async createNoteInGoogle(note: DebtorNote): Promise<void> {
    // Save locally first
    const localNotes = DebtorNoteEngine.getAllNotes();
    localNotes.push(note);
    DebtorNoteEngine.setNotes(localNotes);

    if (!isSupabaseConfigured()) return;

    try {
      await dbSaveNote(note);
    } catch (err) {
      console.error("[Supabase] Failed to save note:", err);
    }
  }

  // Update Note
  public static async updateNoteInGoogle(id: string, updatedNote: DebtorNote): Promise<void> {
    // Update locally first
    const localNotes = DebtorNoteEngine.getAllNotes();
    const idx = localNotes.findIndex((n) => n.id === id);
    if (idx !== -1) {
      localNotes[idx] = updatedNote;
    }
    DebtorNoteEngine.setNotes(localNotes);

    if (!isSupabaseConfigured()) return;

    try {
      await dbSaveNote(updatedNote);
    } catch (err) {
      console.error("[Supabase] Failed to update note in Supabase:", err);
    }
  }
}
