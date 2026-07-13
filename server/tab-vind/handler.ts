import * as XLSX from "xlsx";
import { cleanAndMapTabVindRows, reconcileTabVind } from "../../src/modules/tab-vind/engine.js";
import { DEFAULT_MATCHING_CONFIG } from "../../src/modules/tab-vind/types.js";
import { generateTabVindPDF } from "./pdfGenerator.js";

export async function handleAnalyse(req: any, res: any) {
  try {
    const { fileBase64, fileName, fileSize, matchingConfig } = req.body;
    
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: "Manglende filindhold (base64) eller filnavn." });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileBase64, "base64");
    
    // Read Excel workbook
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: "Excel-filen indeholder ingen ark/worksheets." });
    }

    // Use the first worksheet by default as requested
    const activeSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[activeSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet);

    if (rawRows.length === 0) {
      return res.status(400).json({ error: `Excel-arket '${activeSheetName}' er tomt.` });
    }

    // Validate and clean raw rows
    const tabVindRaw = cleanAndMapTabVindRows(rawRows);

    if (tabVindRaw.length === 0) {
      return res.status(400).json({ error: "Ingen gyldige rækker kunne findes eller parses i arket." });
    }

    // Reconcile and analyze
    const config = matchingConfig || DEFAULT_MATCHING_CONFIG;
    const analysisResult = reconcileTabVind(tabVindRaw, config);
    
    // Supplement file details as requested
    analysisResult.fileName = fileName;
    analysisResult.fileSize = fileSize || buffer.length;

    res.json(analysisResult);
  } catch (error: any) {
    console.error("TAB/VIND analysis failed:", error);
    res.status(500).json({ error: "Analyse af filen mislykkedes: " + error.message });
  }
}

export async function handlePdf(req: any, res: any) {
  try {
    const { analysis, filters, options } = req.body;
    
    if (!analysis) {
      return res.status(400).json({ error: "Manglende analysesæt til PDF-generering." });
    }

    const pdfBuffer = await generateTabVindPDF(analysis, filters, options);

    // Build deterministic filename
    let dateStr = analysis.detectedBusinessDate || new Date().toISOString().split("T")[0];
    if (
      analysis.dateRange && 
      analysis.dateRange.min && 
      analysis.dateRange.max && 
      analysis.dateRange.min !== analysis.dateRange.max
    ) {
      dateStr = `${analysis.dateRange.min}_${analysis.dateRange.max}`;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const filename = `TabVind_Rapport_${dateStr}_${hh}${mm}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    
    res.end(pdfBuffer);
  } catch (error: any) {
    console.error("PDF generation endpoint failed:", error);
    res.status(500).json({ error: "Fejl under PDF-generering: " + error.message });
  }
}
