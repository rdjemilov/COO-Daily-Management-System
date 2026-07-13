import express from "express";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { seedMockDataIfEmpty, getImportHistory, saveToGoogleSheets, getWorksheetData, calculateFileHash, checkDuplicateFile } from "./server/dbService.js";
import { validateExcelData, cleanAndMapRows } from "./server/validator.js";
import { ImportMetadata } from "./src/shared/types.js";
import { calculateSalesAlerts, getISOWeekString } from "./server/alerts/sales-alerts.service.js";
import { handleAnalyse, handlePdf } from "./server/tab-vind/handler.js";

const app = express();

// Increase payload size limit to handle large Excel files in base64
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
    const history = await getImportHistory();
    // Sort history descending by import time or business date
    const sortedHistory = history.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    res.json(sortedHistory);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch import history: " + e.message });
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
      uploadedBy: "studiorasim@gmail.com",
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

    // Save to Google Sheets (simulated database layer)
    const success = await saveToGoogleSheets(businessDate, cleanRows, metadata);
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
