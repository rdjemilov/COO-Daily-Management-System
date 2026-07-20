import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { seedMockDataIfEmpty, getImportHistory, saveToDatabase, getWorksheetData, calculateFileHash, checkDuplicateFile } from "./server/dbService.js";
import { validateExcelData, cleanAndMapRows } from "./server/validator.js";
import { ImportMetadata } from "./src/shared/types.js";
import { calculateSalesAlerts, getISOWeekString } from "./server/alerts/sales-alerts.service.js";
import { handleAnalyse, handlePdf } from "./server/tab-vind/handler.js";
import { handleCountingProductsLookup, handleCountingProductsQuery, handleCountingProductsRefresh, handleCountingPdf } from "./server/counting/handler.js";
import { DebitorGoogleSheetsService } from "./services/debitor/google/sheets.ts";
import { validateDebitorExcelData, cleanAndMapDebitorRows, aggregateDebitorRows } from "./services/debitor/import/validator.ts";
import { parseAndMapTransactions } from "./services/debitor/import/transactions.ts";
import { CreateActionSchema, UpdateActionSchema, DebtorActionEngine } from "./services/debitor/storage/actions.ts";
import { CreateNoteSchema, UpdateNoteSchema, DebtorNoteEngine } from "./services/debitor/storage/notes.ts";
import { DebitorRefreshOrchestrator } from "./services/debitor/refreshOrchestrator.ts";
import { DebitorPdfGenerator } from "./services/debitor/pdf/index.ts";
import { DebitorAuditService } from "./services/debitor/storage/audit.ts";
import { DebitorRateLimiter } from "./services/debitor/storage/ratelimit.ts";
import crypto from "crypto";

const app = express();

// Increase payload size limit to handle large Excel files in base64
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Apply rate limiting middleware to all /api/ endpoints to prevent abuse
app.use("/api/", DebitorRateLimiter.handle);

// Initialize and seed mock database data if empty
seedMockDataIfEmpty();

// API Route: Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API Route: Get Available Worksheets (Import Dates)
app.get("/api/all-dates", async (req, res) => {
  try {
    const history = await getImportHistory();
    const successImports = history.filter((m) => m.importStatus === "success");
    // Map and sort unique dates descending
    const dates = Array.from(new Set(successImports.map((m) => m.businessDate))).sort((a, b) => b.localeCompare(a));
    res.json(dates);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch import dates: " + e.message });
  }
});

// API Route: Get Import History logs
app.get("/api/imports", async (req, res) => {
  try {
    const salesHistory = await getImportHistory();
    const debitorHistory = await DebitorGoogleSheetsService.getImportHistory();
    const combinedHistory = [...salesHistory, ...debitorHistory];
    // Sort history descending by import time or business date
    const sortedHistory = combinedHistory.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    res.json(sortedHistory);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch import history: " + e.message });
  }
});

// API Route: Get Debitor unique business dates
app.get("/api/debitor/all-dates", async (req, res) => {
  try {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const successImports = history.filter((m) => m.importStatus === "success");
    const dates = Array.from(new Set(successImports.map((m) => m.businessDate))).sort((a, b) => b.localeCompare(a));
    res.json(dates);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch debitor dates: " + e.message });
  }
});

// API Route: Get Raw Sales data for a specific worksheet
app.get("/api/data/:worksheet", async (req, res) => {
  try {
    const worksheetName = req.params.worksheet;
    const data = await getWorksheetData(worksheetName);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: `Failed to fetch data for worksheet ${req.params.worksheet}: ` + e.message });
  }
});

// API Route: Get Sales Alerts & Opportunities
app.get("/api/sales/alerts", async (req, res) => {
  try {
    let week = req.query.week as string;
    
    // If no week parameter, default to the week of the latest imported worksheet
    if (!week) {
      const history = await getImportHistory();
      const successImports = history.filter((m) => m.importStatus === "success");
      const dates = Array.from(new Set(successImports.map((m) => m.businessDate))).sort((a, b) => b.localeCompare(a));
      if (dates.length > 0) {
        week = getISOWeekString(dates[0]);
      } else {
        // Fallback to current year's week
        week = getISOWeekString(new Date().toISOString().split("T")[0]);
      }
    }

    // Helper to parse potential arrays or strings of filters
    const parseArrayQuery = (q: any): string[] | undefined => {
      if (!q) return undefined;
      if (Array.isArray(q)) return q as string[];
      if (typeof q === "string") return q.split(",").map((s) => s.trim()).filter(Boolean);
      return undefined;
    };

    const filters = {
      location: parseArrayQuery(req.query.location),
      documentType: parseArrayQuery(req.query.documentType),
      customerQuery: req.query.customerQuery as string || undefined,
      productQuery: req.query.productQuery as string || undefined,
      excludeCashCustomers: req.query.excludeCashCustomers !== undefined ? req.query.excludeCashCustomers === "true" : true,
      expectedBusinessDays: req.query.expectedBusinessDays ? parseInt(req.query.expectedBusinessDays as string) : 5,
      criticalRiskThreshold: req.query.criticalRiskThreshold ? parseFloat(req.query.criticalRiskThreshold as string) : 5000,
    };

    const alerts = await calculateSalesAlerts(week, filters);
    res.json(alerts);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load sales alerts: " + e.message });
  }
});

// API Routes: TAB/VIND Temporary Analysis & PDF Reporting
app.post("/api/tab-vind/analyse", handleAnalyse);
app.post("/api/tab-vind/pdf", handlePdf);

// API Routes: Cycle Counting (Counting) Module
app.post("/api/counting/products/lookup", handleCountingProductsLookup);
app.get("/api/counting/products", handleCountingProductsQuery);
app.post("/api/counting/products/refresh", handleCountingProductsRefresh);
app.post("/api/counting/pdf", handleCountingPdf);

app.get("/api/settings/supabase", (req, res) => {
  try {
    res.json({
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_KEY: process.env.SUPABASE_KEY || "",
      USE_MOCK_DATA: process.env.USE_MOCK_DATA === "true"
    });
  } catch (err: any) {
    res.status(500).json({ error: "Kunne ikke hente indstillinger: " + err.message });
  }
});

app.post("/api/settings/supabase", (req, res) => {
  try {
    const {
      SUPABASE_URL,
      SUPABASE_KEY,
      USE_MOCK_DATA
    } = req.body;

    // 1. Update in-memory process.env so it works immediately
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_KEY = SUPABASE_KEY;
    process.env.USE_MOCK_DATA = USE_MOCK_DATA ? "true" : "false";

    // 2. Persist to .env file
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    } else {
      const examplePath = path.join(process.cwd(), ".env.example");
      if (fs.existsSync(examplePath)) {
        envContent = fs.readFileSync(examplePath, "utf8");
      }
    }

    let lines = envContent.split(/\r?\n/);
    const updatedKeys = {
      SUPABASE_URL,
      SUPABASE_KEY,
      USE_MOCK_DATA: USE_MOCK_DATA ? "true" : "false"
    };

    for (const [key, value] of Object.entries(updatedKeys)) {
      const cleanValue = (value || "").trim();
      const index = lines.findIndex(line => {
        const trimmed = line.trim();
        return trimmed.startsWith(`${key}=`) || trimmed.startsWith(`# ${key}=`) || trimmed.startsWith(`#${key}=`);
      });

      if (index !== -1) {
        lines[index] = `${key}="${cleanValue}"`;
      } else {
        lines.push(`${key}="${cleanValue}"`);
      }
    }

    fs.writeFileSync(envPath, lines.join("\n"), "utf8");
    res.json({ success: true, message: "Supabase bağlantı ayarları kaydedildi ve etkinleştirildi!" });
  } catch (err: any) {
    res.status(500).json({ error: "Kunne ikke gemme indstillinger: " + err.message });
  }
});

// API Route: Get Connection Health
app.get("/api/settings/connection-health", async (req, res) => {
  try {
    const isMock = process.env.USE_MOCK_DATA === "true";
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);

    if (isMock) {
      return res.json({
        success: true,
        isMock: true,
        message: "Lokal simülasyon modunda çalışıyor (Local JSON yedekleri aktif)."
      });
    }

    if (!hasSupabase) {
      return res.json({
        success: false,
        isMock: false,
        message: "Supabase bağlantı bilgileri (SUPABASE_URL, SUPABASE_KEY) .env dosyasında eksik."
      });
    }

    // Try testing connection
    const test = await DebitorGoogleSheetsService.testConnection();
    res.json({
      success: test.success,
      isMock: false,
      message: test.message
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Route: Test Credentials
app.post("/api/settings/test-supabase", async (req, res) => {
  try {
    const { SUPABASE_URL, SUPABASE_KEY } = req.body;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.json({ success: false, message: "Test için gerekli alanlar eksik." });
    }

    // Temporarily apply process.env to test
    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_KEY;
    
    // We can clear any cached client to force a new one
    const { getSupabaseClient } = await import("./server/supabaseService.js");
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_KEY = SUPABASE_KEY;

    try {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Supabase istemcisi başlatılamadı.");
      }
      
      const { data, error } = await client.from("import_metadata").select("import_id").limit(1);
      if (error) {
        throw error;
      }

      res.json({ success: true, message: "Supabase veritabanı bağlantı testi başarılı!" });
    } catch (err: any) {
      res.json({ success: false, message: "Bağlantı başarısız: " + (err.message || err) });
    } finally {
      process.env.SUPABASE_URL = oldUrl;
      process.env.SUPABASE_KEY = oldKey;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Route: Debitor Upload and Validate
app.post(["/api/debitor/upload", "/api/database/debitor/validate"], async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PAYLOAD",
          message: "Manglende filindhold eller filnavn",
          retryable: false
        }
      });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_WORKBOOK",
          message: "Excel-filen indeholder ingen arbejdsark.",
          retryable: false
        }
      });
    }

    const activeSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[activeSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet);

    if (rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_WORKSHEET",
          message: "Arbejdsarket er tomt.",
          retryable: false
        }
      });
    }

    const validationSummary = validateDebitorExcelData(fileName, rawRows);
    validationSummary.detectedWorksheet = activeSheetName;

    const fileHash = calculateFileHash(buffer);
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const existingImport = history.find((m) => m.fileHash === fileHash && m.importStatus === "success") || null;

    res.json({
      success: true,
      validationSummary,
      fileHash,
      isDuplicate: !!existingImport,
      duplicateInfo: existingImport,
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Fejl under parsing af fil: " + e.message,
        retryable: true
      }
    });
  }
});

// API Route: Execute and commit Debitor raw import
app.post(["/api/debitor/import", "/api/database/debitor/import"], async (req, res) => {
  const start = Date.now();
  try {
    const { fileBase64, fileName, fileHash, businessDate, replaceExisting, replaceImportId } = req.body;
    
    if (!fileBase64 || !fileName || !businessDate) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PAYLOAD",
          message: "Manglende nødvendige importparametre",
          retryable: false
        }
      });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const activeSheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[activeSheetName]);

    // Validation again to prevent invalid imports
    const validationSummary = validateDebitorExcelData(fileName, rawRows);
    if (!validationSummary.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Filen er ikke gyldig til import: " + (validationSummary.errors[0] || "Ugyldigt format"),
          retryable: false
        }
      });
    }

    const cleanRows = cleanAndMapDebitorRows(rawRows);
    
    // Aggregation of duplicates!
    const aggregatedRows = aggregateDebitorRows(cleanRows);

    const importId = `IMP-DEB-${businessDate.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;
    
    const metadata: ImportMetadata = {
      importId,
      businessModule: "Debitor",
      businessDate,
      worksheetName: businessDate,
      uploadedFileName: fileName,
      originalFileSize: buffer.length,
      importedRowCount: aggregatedRows.length,
      importedColumnCount: Object.keys(rawRows[0] || {}).length,
      importedAt: new Date().toISOString(),
      uploadedBy: "rb@danfoods.dk",
      importStatus: "success",
      importVersion: replaceExisting ? 2 : 1,
      fileHash: fileHash || calculateFileHash(buffer),
      templateVersion: "1.0.0",
      applicationVersion: "1.0.0",
    };

    if (replaceExisting && replaceImportId) {
      metadata.replacedImportId = replaceImportId;
    }

    const success = await DebitorGoogleSheetsService.saveSnapshot(businessDate, aggregatedRows, metadata);
    if (!success) {
      throw new Error("Kunne ikke gemme snapshot i Google Sheets");
    }

    // Log the successful import action to the audit log
    await DebitorAuditService.logEvent(
      "IMPORT",
      { importId, businessDate, rowCount: aggregatedRows.length, fileName },
      start
    );

    res.json({
      success: true,
      importId,
      worksheetName: businessDate,
      rowCount: aggregatedRows.length,
      message: `Importeret med succes: ${aggregatedRows.length} rækker.`,
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Importen fejlede: " + e.message,
        retryable: true
      }
    });
  }
});

// API Route: Get Raw Debitor data for a specific worksheet
app.get("/api/debitor/data/:worksheet", async (req, res) => {
  try {
    const worksheetName = req.params.worksheet;
    const data = await DebitorGoogleSheetsService.getWorksheetData(worksheetName);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: `Kunne ikke hente data for ${req.params.worksheet}: ` + e.message,
        retryable: true
      }
    });
  }
});

// API Route: Get all available business dates for successful imports
app.get(["/api/debitor/dates", "/api/debitor/all-dates"], async (req, res) => {
  try {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const dates = Array.from(new Set(
      history.filter((m) => m.importStatus === "success").map((m) => m.businessDate)
    )).sort((a, b) => b.localeCompare(a));
    res.json({ success: true, dates });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Orchestrated Refresh/Load
app.get("/api/debitor/refresh", async (req, res) => {
  const start = Date.now();
  try {
    const snapshotDate = req.query.snapshotDate as string | undefined;
    const force = req.query.force === "true";
    const result = await DebitorRefreshOrchestrator.refresh({ snapshotDate, force });
    
    // Log the refresh event for performance auditing
    const actualDate = result.snapshotMetadata?.businessDate || snapshotDate || "unknown";
    await DebitorAuditService.logEvent(
      "REFRESH",
      { snapshotDate: actualDate, force, customerCount: result.kpis.customers.length },
      start
    );

    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Get and Parse SaldoPosterRAW transactions
app.get("/api/debitor/transactions", async (req, res) => {
  try {
    const rawTx = await DebitorGoogleSheetsService.getSaldoPosterRAW();
    const result = parseAndMapTransactions(rawTx);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Get all Actions
app.get("/api/debitor/actions", async (req, res) => {
  try {
    const actions = await DebitorGoogleSheetsService.loadActionsFromGoogle();
    res.json({ success: true, actions });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Create a new Action
app.post("/api/debitor/actions", async (req, res) => {
  const start = Date.now();
  try {
    const parsed = CreateActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          retryable: false
        }
      });
    }

    const data = parsed.data;
    const id = "ACT-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const action = {
      id,
      customerNumber: data.customerNumber,
      type: data.type,
      status: data.status,
      priority: data.priority,
      owner: data.owner || null,
      dueDate: data.dueDate || null,
      comment: data.comment,
      createdBy: data.createdBy || "rb@danfoods.dk",
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      closedAt: (data.status === "completed" || data.status === "cancelled") ? new Date().toISOString() : null,
      promisedPaymentDate: data.promisedPaymentDate || null,
      reference: data.reference || null,
    };

    await DebitorGoogleSheetsService.createActionInGoogle(action);
    
    // Log the action to audit database
    await DebitorAuditService.logEvent(
      "ACTION",
      { type: "CREATE", actionId: id, customerNo: action.customerNumber, actionType: action.type },
      start,
      action.createdBy
    );

    res.json({ success: true, action });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Update an Action (supports both /:id and /[id])
app.patch(["/api/debitor/actions/:id", "/api/debitor/actions/\\[id\\]"], async (req, res) => {
  const start = Date.now();
  try {
    let actionId = req.params.id;
    if (!actionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_ACTION_ID",
          message: "Action ID parameter er påkrævet",
          retryable: false
        }
      });
    }

    if (actionId.startsWith("[") && actionId.endsWith("]")) {
      actionId = actionId.slice(1, -1);
    }

    const parsed = UpdateActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          retryable: false
        }
      });
    }

    const actions = await DebitorGoogleSheetsService.loadActionsFromGoogle();
    const existing = actions.find((a) => a.id === actionId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "ACTION_NOT_FOUND",
          message: `Aktivitet med ID ${actionId} blev ikke fundet`,
          retryable: false
        }
      });
    }

    const data = parsed.data;
    const prevStatus = existing.status;
    const newStatus = data.status || existing.status;

    let closedAt = existing.closedAt;
    if ((newStatus === "completed" || newStatus === "cancelled") && prevStatus !== "completed" && prevStatus !== "cancelled") {
      closedAt = new Date().toISOString();
    } else if (newStatus !== "completed" && newStatus !== "cancelled" && (prevStatus === "completed" || prevStatus === "cancelled")) {
      closedAt = null; // Reopened
    }

    const updated = {
      ...existing,
      type: data.type !== undefined ? data.type : existing.type,
      status: newStatus,
      priority: data.priority !== undefined ? data.priority : existing.priority,
      owner: data.owner !== undefined ? data.owner : existing.owner,
      dueDate: data.dueDate !== undefined ? data.dueDate : existing.dueDate,
      comment: data.comment !== undefined ? data.comment : existing.comment,
      updatedBy: data.updatedBy || "rb@danfoods.dk",
      updatedAt: new Date().toISOString(),
      closedAt,
      promisedPaymentDate: data.promisedPaymentDate !== undefined ? data.promisedPaymentDate : existing.promisedPaymentDate,
      reference: data.reference !== undefined ? data.reference : existing.reference,
    };

    await DebitorGoogleSheetsService.updateActionInGoogle(actionId, updated);
    
    // Log the action update to audit database
    await DebitorAuditService.logEvent(
      "ACTION",
      { type: "UPDATE", actionId, customerNo: updated.customerNumber, status: updated.status },
      start,
      updated.updatedBy
    );

    res.json({ success: true, action: updated });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Get all Notes
app.get("/api/debitor/notes", async (req, res) => {
  try {
    const notes = await DebitorGoogleSheetsService.loadNotesFromGoogle();
    res.json({ success: true, notes });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Create a new Note
app.post("/api/debitor/notes", async (req, res) => {
  const start = Date.now();
  try {
    const parsed = CreateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          retryable: false
        }
      });
    }

    const data = parsed.data;
    const id = "NTE-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const note = {
      id,
      customerNumber: data.customerNumber,
      category: data.category,
      text: data.text,
      author: data.author || "rb@danfoods.dk",
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      isPinned: data.isPinned || false,
    };

    await DebitorGoogleSheetsService.createNoteInGoogle(note);

    // Log note creation to audit log
    await DebitorAuditService.logEvent(
      "NOTE",
      { type: "CREATE", noteId: id, customerNo: note.customerNumber, category: note.category },
      start,
      note.author
    );

    res.json({ success: true, note });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: Update a Note (supports both /:id and /[id])
app.patch(["/api/debitor/notes/:id", "/api/debitor/notes/\\[id\\]"], async (req, res) => {
  const start = Date.now();
  try {
    let noteId = req.params.id;
    if (!noteId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_NOTE_ID",
          message: "Note ID parameter er påkrævet",
          retryable: false
        }
      });
    }

    if (noteId.startsWith("[") && noteId.endsWith("]")) {
      noteId = noteId.slice(1, -1);
    }

    const parsed = UpdateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          retryable: false
        }
      });
    }

    const notes = await DebitorGoogleSheetsService.loadNotesFromGoogle();
    const existing = notes.find((n) => n.id === noteId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOTE_NOT_FOUND",
          message: `Note med ID ${noteId} blev ikke fundet`,
          retryable: false
        }
      });
    }

    const data = parsed.data;
    const updated = {
      ...existing,
      category: data.category !== undefined ? data.category : existing.category,
      text: data.text !== undefined ? data.text : existing.text,
      isPinned: data.isPinned !== undefined ? data.isPinned : existing.isPinned,
      updatedBy: data.updatedBy || "rb@danfoods.dk",
      updatedAt: new Date().toISOString(),
    };

    await DebitorGoogleSheetsService.updateNoteInGoogle(noteId, updated);
    
    // Log note update to audit log
    await DebitorAuditService.logEvent(
      "NOTE",
      { type: "UPDATE", noteId, customerNo: updated.customerNumber, category: updated.category, isPinned: updated.isPinned },
      start,
      updated.updatedBy
    );

    res.json({ success: true, note: updated });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: e.message,
        retryable: true
      }
    });
  }
});

// API Route: PDF Export - Dashboard Summary (Landscape)
app.get("/api/debitor/pdf/dashboard", async (req, res) => {
  const start = Date.now();
  try {
    const snapshotDate = req.query.snapshotDate as string | undefined;
    const result = await DebitorRefreshOrchestrator.refresh({ snapshotDate });
    const pdfBuffer = await DebitorPdfGenerator.generateDashboardPdf(result);

    const actualDate = result.snapshotMetadata?.businessDate || new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=DF-Debitor-Dashboard-${actualDate}.pdf`);
    res.send(pdfBuffer);

    await DebitorAuditService.logEvent("PDF_EXPORT", { reportType: "DASHBOARD", snapshotDate: actualDate }, start);
  } catch (e: any) {
    console.error("Dashboard PDF export failed:", e);
    res.status(500).json({ success: false, error: "Kunne ikke generere Dashboard PDF: " + e.message });
  }
});

// API Route: PDF Export - Customer Card (Portrait)
app.get("/api/debitor/pdf/customer/:customerNo", async (req, res) => {
  const start = Date.now();
  try {
    const customerNo = req.params.customerNo;
    const snapshotDate = req.query.snapshotDate as string | undefined;
    const result = await DebitorRefreshOrchestrator.refresh({ snapshotDate });
    const pdfBuffer = await DebitorPdfGenerator.generateCustomerPdf(result, customerNo);

    const actualDate = result.snapshotMetadata?.businessDate || new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=DF-Debitor-${customerNo}-${actualDate}.pdf`);
    res.send(pdfBuffer);

    await DebitorAuditService.logEvent("PDF_EXPORT", { reportType: "CUSTOMER_CARD", customerNo, snapshotDate: actualDate }, start);
  } catch (e: any) {
    console.error("Customer PDF export failed:", e);
    res.status(500).json({ success: false, error: "Kunne ikke generere Kundekort PDF: " + e.message });
  }
});

// API Route: PDF Export - Collection Queue (Portrait)
app.get("/api/debitor/pdf/collection", async (req, res) => {
  const start = Date.now();
  try {
    const snapshotDate = req.query.snapshotDate as string | undefined;
    const result = await DebitorRefreshOrchestrator.refresh({ snapshotDate });
    const pdfBuffer = await DebitorPdfGenerator.generateCollectionPdf(result);

    const actualDate = result.snapshotMetadata?.businessDate || new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=DF-Collection-${actualDate}.pdf`);
    res.send(pdfBuffer);

    await DebitorAuditService.logEvent("PDF_EXPORT", { reportType: "COLLECTION", snapshotDate: actualDate }, start);
  } catch (e: any) {
    console.error("Collection PDF export failed:", e);
    res.status(500).json({ success: false, error: "Kunne ikke generere Rykkerrapport PDF: " + e.message });
  }
});

// API Route: PDF Export - Executive Report (Portrait)
app.get("/api/debitor/pdf/executive", async (req, res) => {
  const start = Date.now();
  try {
    const snapshotDate = req.query.snapshotDate as string | undefined;
    const result = await DebitorRefreshOrchestrator.refresh({ snapshotDate });
    const pdfBuffer = await DebitorPdfGenerator.generateExecutivePdf(result);

    const actualDate = result.snapshotMetadata?.businessDate || new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=DF-Executive-Report-${actualDate}.pdf`);
    res.send(pdfBuffer);

    await DebitorAuditService.logEvent("PDF_EXPORT", { reportType: "EXECUTIVE", snapshotDate: actualDate }, start);
  } catch (e: any) {
    console.error("Executive PDF export failed:", e);
    res.status(500).json({ success: false, error: "Kunne ikke generere Ledelsesrapport PDF: " + e.message });
  }
});

// API Route: Upload and Validate Excel File
app.post("/api/upload", async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: "Missing file contents or file name" });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileBase64, "base64");
    
    // Read Excel workbook using xlsx
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Excel file has no worksheets" });
    }

    const activeSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[activeSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet);

    if (rawRows.length === 0) {
      return res.status(400).json({ error: "Excel sheet is empty" });
    }

    // Validate the spreadsheet data
    const validationSummary = validateExcelData(fileName, rawRows);
    validationSummary.detectedWorksheet = activeSheetName;

    // Calculate file hash for duplication checks
    const fileHash = calculateFileHash(buffer);
    const existingImport = await checkDuplicateFile(fileHash);

    // Generate preview rows (up to 50 rows)
    const previewRows = rawRows.slice(0, 50);

    res.json({
      validationSummary,
      previewRows,
      fileHash,
      isDuplicate: !!existingImport,
      duplicateInfo: existingImport,
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to parse and validate file: " + e.message });
  }
});

// API Route: Execute and commit raw import
app.post("/api/import", async (req, res) => {
  try {
    const { fileBase64, fileName, fileHash, businessDate, replaceExisting, replaceImportId, tilbudUge } = req.body;
    
    if (!fileBase64 || !fileName || !businessDate) {
      return res.status(400).json({ error: "Missing required import payloads" });
    }

    // Read Excel
    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const activeSheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[activeSheetName]);

    // Normalize and clean rows
    const cleanRows = cleanAndMapRows(rawRows, businessDate);

    // Construct metadata
    const importId = `IMP-${businessDate.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;
    
    const metadata: ImportMetadata = {
      importId,
      businessModule: "Sales",
      businessDate,
      worksheetName: businessDate,
      uploadedFileName: fileName,
      originalFileSize: buffer.length,
      importedRowCount: cleanRows.length,
      importedColumnCount: Object.keys(rawRows[0] || {}).length,
      importedAt: new Date().toISOString(),
      uploadedBy: "rb@danfoods.dk",
      importStatus: "success",
      importVersion: replaceExisting ? 2 : 1,
      fileHash: fileHash || calculateFileHash(buffer),
      templateVersion: "1.0.0",
      applicationVersion: "1.0.0",
      tilbudUge: !!tilbudUge,
    };

    if (replaceExisting && replaceImportId) {
      metadata.replacedImportId = replaceImportId;
    }

    // Save to Database layer (with local backup)
    const success = await saveToDatabase(businessDate, cleanRows, metadata);
    if (!success) {
      throw new Error("Failed to write import data to database model");
    }

    res.json({
      success: true,
      importId,
      worksheetName: businessDate,
      rowCount: cleanRows.length,
      message: `Successfully imported ${cleanRows.length} rows as worksheet ${businessDate}.`,
    });
  } catch (e: any) {
    res.status(500).json({ error: "Import failed: " + e.message });
  }
});

// Vite development vs production asset serving middleware setup
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (!isProduction) {
  // Local development: mount Vite asynchronously
  const vitePromise = import("vite").then(({ createServer: createViteServer }) =>
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    })
  );
  app.use(async (req, res, next) => {
    try {
      const vite = await vitePromise;
      vite.middlewares(req, res, next);
    } catch (err) {
      next(err);
    }
  });
} else {
  // Production: serve static assets from dist
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    // If it's an API route, pass it to next to handle properly (or return 404)
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Start the server if running locally and NOT on Vercel
if (!process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Daily Management System Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
