import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";
import { seedMockDataIfEmpty, getImportHistory, saveToGoogleSheets, getWorksheetData, calculateFileHash, checkDuplicateFile } from "./server/dbService.js";
import { validateExcelData, cleanAndMapRows } from "./server/validator.js";
import { ImportMetadata } from "./src/shared/types.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
      const { fileBase64, fileName, fileHash, businessDate, replaceExisting, replaceImportId } = req.body;
      
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Daily Management System Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
