import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.log("[Supabase] SUPABASE_URL or SUPABASE_KEY is missing. Running in local fallback mode.");
    return null;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
      },
    });
    console.log("[Supabase] Client initialized successfully.");
    return supabaseInstance;
  } catch (err) {
    console.error("[Supabase] Failed to initialize client:", err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}

// Ensure local backup folder exists
const DATA_DIR = path.join(process.cwd(), "data");
function ensureLocalDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {}
  }
}

// 1. Sync / Save Import Metadata
export async function dbSaveImportMetadata(meta: any): Promise<void> {
  const supabase = getSupabaseClient();
  
  // Local Backup
  ensureLocalDir();
  const metaFile = path.join(DATA_DIR, meta.businessModule === "Debitor" ? "debitor_system_metadata.json" : "system_metadata.json");
  let localMeta: any[] = [];
  if (fs.existsSync(metaFile)) {
    try {
      localMeta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch {}
  }
  
  // Update local replaced status
  if (meta.replacedImportId) {
    const idx = localMeta.findIndex((h) => h.importId === meta.replacedImportId);
    if (idx !== -1) {
      localMeta[idx].importStatus = "failed";
      localMeta[idx].errorMessage = `Erstattet af Import ${meta.importId}`;
    }
  }
  localMeta.push(meta);
  try {
    fs.writeFileSync(metaFile, JSON.stringify(localMeta, null, 2), "utf-8");
  } catch {}

  if (!supabase) return;

  try {
    // Map application properties to snake_case for PostgreSQL
    const dbRow = {
      import_id: meta.importId,
      business_module: meta.businessModule,
      business_date: meta.businessDate,
      worksheet_name: meta.worksheetName,
      uploaded_file_name: meta.uploadedFileName,
      original_file_size: meta.originalFileSize,
      imported_row_count: meta.importedRowCount,
      imported_column_count: meta.importedColumnCount,
      imported_at: meta.importedAt,
      uploaded_by: meta.uploadedBy,
      import_status: meta.importStatus,
      import_version: meta.importVersion,
      file_hash: meta.fileHash,
      template_version: meta.templateVersion || "1.0.0",
      error_message: meta.errorMessage || null,
      replaced_import_id: meta.replacedImportId || null,
      application_version: meta.applicationVersion || "1.0.0",
      tilbud_uge: !!meta.tilbudUge
    };

    // If replaced, update in DB
    if (meta.replacedImportId) {
      await supabase
        .from("import_metadata")
        .update({ import_status: "failed", error_message: `Replaced by Import ${meta.importId}` })
        .eq("import_id", meta.replacedImportId);
    }

    const { error } = await supabase.from("import_metadata").upsert(dbRow);
    if (error) {
      console.error("[Supabase] Error saving import metadata:", error);
    } else {
      console.log(`[Supabase] Metadata ${meta.importId} saved successfully.`);
    }
  } catch (err) {
    console.error("[Supabase] Exception in dbSaveImportMetadata:", err);
  }
}

// 2. Fetch Import Metadata History
export async function dbGetImportHistory(moduleName: "Sales" | "Debitor"): Promise<any[]> {
  const supabase = getSupabaseClient();
  
  // Load local file fallback
  ensureLocalDir();
  const metaFile = path.join(DATA_DIR, moduleName === "Debitor" ? "debitor_system_metadata.json" : "system_metadata.json");
  let localMeta: any[] = [];
  if (fs.existsSync(metaFile)) {
    try {
      localMeta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch {}
  }

  if (!supabase) {
    return localMeta.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }

  try {
    const { data, error } = await supabase
      .from("import_metadata")
      .select("*")
      .eq("business_module", moduleName)
      .order("imported_at", { ascending: false });

    if (error) {
      console.error("[Supabase] Error fetching import history:", error);
      return localMeta.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    }

    if (data && data.length > 0) {
      // Map back to camelCase
      const mapped = data.map((r) => ({
        importId: r.import_id,
        businessModule: r.business_module,
        businessDate: r.business_date,
        worksheetName: r.worksheet_name,
        uploadedFileName: r.uploaded_file_name,
        originalFileSize: r.original_file_size,
        importedRowCount: r.imported_row_count,
        importedColumnCount: r.imported_column_count,
        importedAt: r.imported_at,
        uploadedBy: r.uploaded_by,
        importStatus: r.import_status,
        importVersion: r.import_version,
        fileHash: r.file_hash,
        templateVersion: r.template_version,
        errorMessage: r.error_message,
        replacedImportId: r.replaced_import_id,
        applicationVersion: r.application_version,
        tilbudUge: r.tilbud_uge
      }));

      // Write merged history back locally to keep offline file sync
      try {
        fs.writeFileSync(metaFile, JSON.stringify(mapped, null, 2), "utf-8");
      } catch {}

      return mapped;
    }
  } catch (err) {
    console.error("[Supabase] Exception in dbGetImportHistory:", err);
  }

  return localMeta.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

// 3. Save Sales Rows
export async function dbSaveSalesRows(importId: string, rows: any[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const dbRows = rows.map((row) => ({
      import_id: importId,
      posting_date: row.postingDate || null,
      entry_type: row.entryType || "",
      document_type: row.documentType || "",
      document_number: row.documentNumber || "",
      item_number: row.itemNumber || "",
      description: row.description || "",
      location_code: row.locationCode || "",
      quantity: row.quantity !== undefined ? row.quantity : 0,
      invoiced_quantity: row.invoicedQuantity !== undefined ? row.invoicedQuantity : 0,
      remaining_quantity: row.remainingQuantity !== undefined ? row.remainingQuantity : 0,
      sales_amount: row.salesAmount !== undefined ? row.salesAmount : 0,
      cost_amount: row.costAmount !== undefined ? row.costAmount : 0,
      source_type: row.sourceType || "",
      customer_number: row.customerNumber || "",
      customer_name: row.customerName || "",
      department_code: row.departmentCode || "",
      employee_name: row.employeeName || ""
    }));

    // Insert in chunks of 1000 to prevent payload limits
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
      const chunk = dbRows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from("sales_rows").insert(chunk);
      if (error) {
        throw error;
      }
    }
    console.log(`[Supabase] Successfully saved ${rows.length} sales rows.`);
  } catch (err) {
    console.error("[Supabase] Error saving sales rows:", err);
  }
}

// 4. Fetch Sales Rows by worksheet/import
export async function dbGetSalesRows(worksheetName: string): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    // Find successful import for this worksheetName or businessDate
    const { data: metaData, error: metaErr } = await supabase
      .from("import_metadata")
      .select("import_id")
      .eq("business_module", "Sales")
      .eq("import_status", "success")
      .or(`worksheet_name.eq.${worksheetName},business_date.eq.${worksheetName}`)
      .order("import_version", { ascending: false })
      .limit(1);

    if (metaErr || !metaData || metaData.length === 0) {
      return [];
    }

    const importId = metaData[0].import_id;
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 5000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("sales_rows")
        .select("*")
        .eq("import_id", importId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRows = [...allRows, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    return allRows.map((r) => ({
      postingDate: r.posting_date,
      entryType: r.entry_type,
      documentType: r.document_type,
      documentNumber: r.document_number,
      itemNumber: r.item_number,
      description: r.description,
      locationCode: r.location_code,
      quantity: Number(r.quantity),
      invoicedQuantity: Number(r.invoiced_quantity),
      remainingQuantity: Number(r.remaining_quantity),
      salesAmount: Number(r.sales_amount),
      costAmount: Number(r.cost_amount),
      sourceType: r.source_type,
      customerNumber: r.customer_number,
      customerName: r.customer_name,
      departmentCode: r.department_code,
      employeeName: r.employee_name
    }));
  } catch (err) {
    console.error("[Supabase] Error fetching sales rows:", err);
    return [];
  }
}

// 5. Save Debitor Rows
export async function dbSaveDebitorRows(importId: string, rows: any[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const dbRows = rows.map((row) => ({
      import_id: importId,
      customer_number: row.customerNumber || "",
      customer_name: row.customerName || "",
      balance: row.balance !== undefined ? row.balance : 0,
      overdue_balance: row.overdueBalance !== undefined ? row.overdueBalance : 0,
      payment_terms: row.paymentTerms || "",
      last_invoice: row.lastInvoice || null,
      credit_handling: row.creditHandling || "",
      salesperson: row.salesperson || "",
      location: row.location || "",
      seller: row.seller || ""
    }));

    const CHUNK_SIZE = 1000;
    for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
      const chunk = dbRows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from("debitor_rows").insert(chunk);
      if (error) {
        throw error;
      }
    }
    console.log(`[Supabase] Successfully saved ${rows.length} debitor rows.`);
  } catch (err) {
    console.error("[Supabase] Error saving debitor rows:", err);
  }
}

// 6. Fetch Debitor Rows
export async function dbGetDebitorRows(worksheetName: string): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data: metaData, error: metaErr } = await supabase
      .from("import_metadata")
      .select("import_id")
      .eq("business_module", "Debitor")
      .eq("import_status", "success")
      .or(`worksheet_name.eq.${worksheetName},business_date.eq.${worksheetName}`)
      .order("import_version", { ascending: false })
      .limit(1);

    if (metaErr || !metaData || metaData.length === 0) {
      return [];
    }

    const importId = metaData[0].import_id;
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 5000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("debitor_rows")
        .select("*")
        .eq("import_id", importId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRows = [...allRows, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    return allRows.map((r) => ({
      customerNumber: r.customer_number,
      customerName: r.customer_name,
      balance: Number(r.balance),
      overdueBalance: Number(r.overdue_balance),
      paymentTerms: r.payment_terms,
      lastInvoice: r.last_invoice,
      creditHandling: r.credit_handling,
      salesperson: r.salesperson,
      location: r.location,
      seller: r.seller
    }));
  } catch (err) {
    console.error("[Supabase] Error fetching debitor rows:", err);
    return [];
  }
}

// 7. Get All Actions
export async function dbGetActions(): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase.from("debtor_actions").select("*");
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      customerNumber: r.customer_number,
      type: r.type,
      status: r.status,
      priority: r.priority,
      owner: r.owner,
      dueDate: r.due_date,
      comment: r.comment,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
      closedAt: r.closed_at,
      promisedPaymentDate: r.promised_payment_date,
      reference: r.reference
    }));
  } catch (err) {
    console.error("[Supabase] Error loading actions:", err);
    return [];
  }
}

// 8. Create or Update Action
export async function dbSaveAction(action: any): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const dbRow = {
      id: action.id,
      customer_number: action.customerNumber,
      type: action.type,
      status: action.status,
      priority: action.priority,
      owner: action.owner || null,
      due_date: action.dueDate || null,
      comment: action.comment,
      created_by: action.createdBy || null,
      created_at: action.createdAt,
      updated_by: action.updatedBy || null,
      updated_at: action.updatedAt,
      closed_at: action.closedAt || null,
      promised_payment_date: action.promisedPaymentDate || null,
      reference: action.reference || null
    };

    const { error } = await supabase.from("debtor_actions").upsert(dbRow);
    if (error) throw error;
  } catch (err) {
    console.error("[Supabase] Error saving action:", err);
  }
}

// 9. Get All Notes
export async function dbGetNotes(): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase.from("debtor_notes").select("*");
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      customerNumber: r.customer_number,
      category: r.category,
      text: r.text,
      author: r.author,
      createdAt: r.created_at,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
      isPinned: r.is_pinned
    }));
  } catch (err) {
    console.error("[Supabase] Error loading notes:", err);
    return [];
  }
}

// 10. Save Note
export async function dbSaveNote(note: any): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const dbRow = {
      id: note.id,
      customer_number: note.customerNumber,
      category: note.category,
      text: note.text,
      author: note.author,
      created_at: note.createdAt,
      updated_by: note.updatedBy || null,
      updated_at: note.updatedAt,
      is_pinned: !!note.isPinned
    };

    const { error } = await supabase.from("debtor_notes").upsert(dbRow);
    if (error) throw error;
  } catch (err) {
    console.error("[Supabase] Error saving note:", err);
  }
}
