import {
  TabVindRawRow,
  TabVindNormalizedRow,
  TabVindMatchGroup,
  TabVindMatchingConfig,
  TabVindAnalysisResult,
  TabVindMatchStatus,
  TabVindMatchMethod,
  TabVindSeverity,
  DEFAULT_MATCHING_CONFIG
} from "./types.js";

// Helper to determine if a row is a Nedregulering (Negative adjustment / output)
export function isNedregulering(entryType: string, qty: number, cost: number): boolean {
  const type = String(entryType || "").toLowerCase();
  if (
    type.includes("ned") || 
    type.includes("afgang") || 
    type.includes("svind") || 
    type.includes("forbrug") || 
    type.includes("decrease") || 
    type.includes("negative")
  ) {
    return true;
  }
  // Fallback to signs
  if (qty < 0 || cost < 0) {
    return true;
  }
  return false;
}

// Map spreadsheet raw row into our canonical row model
const HEADER_MAPS: Record<string, keyof TabVindRawRow> = {
  "bogføringsdato": "postingDate",
  "bogforingsdato": "postingDate",
  "posting date": "postingDate",
  "dato": "postingDate",
  "date": "postingDate",
  
  "posttype": "entryType",
  "entry type": "entryType",
  "type": "entryType",
  
  "bilagstype": "documentType",
  "document type": "documentType",
  "bilags type": "documentType",
  
  "bilagsnr.": "documentNumber",
  "bilagsnr": "documentNumber",
  "document number": "documentNumber",
  "document no": "documentNumber",
  "bilagsnummer": "documentNumber",
  
  "varenr.": "itemNumber",
  "varenr": "itemNumber",
  "item number": "itemNumber",
  "item no": "itemNumber",
  "vare nummer": "itemNumber",
  
  "beskrivelse": "description",
  "description": "description",
  "varebeskrivelse": "description",
  
  "lokationskode": "locationCode",
  "location code": "locationCode",
  "lokation": "locationCode",
  "location": "locationCode",
  
  "antal": "quantity",
  "quantity": "quantity",
  "mængde": "quantity",
  
  "faktureret antal": "invoicedQuantity",
  "invoiced quantity": "invoicedQuantity",
  "faktureret_antal": "invoicedQuantity",
  
  "restantal": "remainingQuantity",
  "remaining quantity": "remainingQuantity",
  "rest_antal": "remainingQuantity",
  
  "salgsbeløb (faktisk)": "salesAmount",
  "salgsbeløb_faktisk": "salesAmount",
  "salgsbeløb": "salesAmount",
  "sales amount": "salesAmount",
  "sales_amount": "salesAmount",
  "beløb": "salesAmount",
  
  "kostbeløb (faktisk)": "costAmount",
  "kostbeløb_faktisk": "costAmount",
  "kostbeløb": "costAmount",
  "cost amount": "costAmount",
  "cost_amount": "costAmount",
  "kost": "costAmount",
  
  "kildetype": "sourceType",
  "source type": "sourceType",
  
  "kildenr.": "sourceNumber",
  "kildenr": "sourceNumber",
  "customer number": "sourceNumber",
  "customer no": "sourceNumber",
  "source number": "sourceNumber",
  
  "source name": "sourceName",
  "customer name": "sourceName",
  "kundenavn": "sourceName",
  "source_name": "sourceName",
  
  "årsagskode": "reasonCode",
  "arsagskode": "reasonCode",
  "reason code": "reasonCode",
  "reason_code": "reasonCode"
};

// Clean string column headers
function normalizeHeader(h: any): string {
  if (h === null || h === undefined) return "";
  return String(h).trim().toLowerCase().replace(/[\r\n\t_]/g, " ");
}

// Standard cell value parsers
function parseDateValue(val: any): string {
  if (!val) return "";
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + val * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (num > 30000 && num < 60000) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + num * 24 * 60 * 60 * 1000);
      return date.toISOString().split("T")[0];
    }
  }
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const dm = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dm) {
    const d = dm[1].padStart(2, "0");
    const m = dm[2].padStart(2, "0");
    const y = dm[3];
    return `${y}-${m}-${d}`;
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split("T")[0];
  }
  return "";
}

function parseNumericValue(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  
  let str = String(val).trim();
  let isNegative = false;
  if (str.endsWith("-")) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith("-")) {
    isNegative = true;
    str = str.slice(1).trim();
  }
  
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(",", ".");
  } else if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }
  
  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  return isNegative ? -parsed : parsed;
}

// Convert Excel file worksheet rows into TabVindRawRow
export function cleanAndMapTabVindRows(rawRows: any[]): TabVindRawRow[] {
  if (rawRows.length === 0) return [];

  const originalHeaders = Object.keys(rawRows[0] || {});
  const headerMapping: Record<string, keyof TabVindRawRow> = {};

  originalHeaders.forEach((h) => {
    const norm = normalizeHeader(h);
    const canonical = HEADER_MAPS[norm];
    if (canonical) {
      headerMapping[h] = canonical;
    }
  });

  // Filter out completely empty or noise rows
  const activeRows = rawRows.filter((row, idx) => {
    if (!row) return false;
    let hasData = false;
    Object.entries(row).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        hasData = true;
      }
    });
    return hasData;
  });

  return activeRows.map((row, idx) => {
    const result: any = {};
    Object.entries(row).forEach(([k, v]) => {
      const canonicalKey = headerMapping[k];
      if (canonicalKey) {
        result[canonicalKey] = v;
      }
    });

    const parsedQty = parseNumericValue(result.quantity);
    const parsedCost = parseNumericValue(result.costAmount);
    const parsedEntryType = String(result.entryType || "").trim();

    // Determine canonical entry type
    let finalEntryType = "Opregulering";
    if (isNedregulering(parsedEntryType, parsedQty, parsedCost)) {
      finalEntryType = "Nedregulering";
    }

    const finalRow: TabVindRawRow = {
      postingDate: parseDateValue(result.postingDate) || new Date().toISOString().split("T")[0],
      entryType: finalEntryType,
      documentType: String(result.documentType || "Afgang").trim(),
      documentNumber: String(result.documentNumber || "").trim(),
      itemNumber: String(result.itemNumber || "").trim(),
      description: String(result.description || "").trim(),
      locationCode: String(result.locationCode || "MANGEL").trim().toUpperCase(),
      quantity: parsedQty,
      invoicedQuantity: parseNumericValue(result.invoicedQuantity !== undefined ? result.invoicedQuantity : result.quantity),
      remainingQuantity: parseNumericValue(result.remainingQuantity || 0),
      salesAmount: parseNumericValue(result.salesAmount),
      costAmount: parsedCost,
      sourceType: result.sourceType ? String(result.sourceType).trim() : undefined,
      sourceNumber: result.sourceNumber ? String(result.sourceNumber).trim() : undefined,
      sourceName: result.sourceName ? String(result.sourceName).trim() : undefined,
      reasonCode: String(result.reasonCode || "").trim().toUpperCase(),
      sourceRowNumber: idx + 2 // 1-based index including header
    };

    return finalRow;
  });
}

// Get distance between two document strings
function getDocumentNumberDistance(doc1: string, doc2: string): number {
  if (doc1 === doc2) return 0;
  const num1 = parseInt(doc1.replace(/\D/g, ""), 10);
  const num2 = parseInt(doc2.replace(/\D/g, ""), 10);
  if (!isNaN(num1) && !isNaN(num2)) {
    return Math.abs(num1 - num2);
  }
  return Infinity;
}

// Map Severity based on financial impact or warnings
export function getGroupSeverity(
  status: TabVindMatchStatus,
  costDiff: number,
  warningsCount: number
): TabVindSeverity {
  const absDiff = Math.abs(costDiff);
  if (status === "Matched") {
    if (absDiff < 0.1) return "Balanced";
    if (absDiff < 5.0) return "Low";
    return "Medium";
  }
  if (status === "Partially Matched" || status === "Ambiguous") {
    if (absDiff > 1000) return "High";
    return "Medium";
  }
  // Unmatched
  if (absDiff > 10000) return "Critical";
  if (absDiff > 2500) return "High";
  if (absDiff > 500) return "Medium";
  return "Low";
}

// Main Reconciliation Engine
export function reconcileTabVind(
  rawRows: TabVindRawRow[],
  config: TabVindMatchingConfig = DEFAULT_MATCHING_CONFIG
): TabVindAnalysisResult {
  const startTime = Date.now();
  const validationWarnings: string[] = [];

  // 1. Normalize rows and preserve signs
  const normalizedRows: TabVindNormalizedRow[] = rawRows.map((row) => ({
    ...row,
    normQty: Math.abs(row.quantity),
    normCost: Math.abs(row.costAmount)
  }));

  // Identify validation issues / warnings
  normalizedRows.forEach((r) => {
    if (!r.reasonCode) {
      validationWarnings.push(`Række ${r.sourceRowNumber}: Manglende årsagskode for vare ${r.itemNumber}.`);
    }
    if (r.locationCode === "MANGEL") {
      validationWarnings.push(`Række ${r.sourceRowNumber}: Manglende lokationskode.`);
    }
  });

  // Separate pools
  let nedPool = normalizedRows.filter((r) => r.entryType === "Nedregulering");
  let opPool = normalizedRows.filter((r) => r.entryType === "Opregulering");

  const groups: TabVindMatchGroup[] = [];
  let groupCounter = 1;

  const generateGroupId = () => {
    return `G-${String(groupCounter++).padStart(3, "0")}`;
  };

  // Helper to remove rows from pools
  const removeNedRow = (rowNum: number) => {
    nedPool = nedPool.filter((r) => r.sourceRowNumber !== rowNum);
  };
  const removeOpRow = (rowNum: number) => {
    opPool = opPool.filter((r) => r.sourceRowNumber !== rowNum);
  };

  // ==========================================
  // STAGE 1: EXACT DIRECT MATCH
  // ==========================================
  for (let i = 0; i < nedPool.length; i++) {
    const ned = nedPool[i];
    
    // Look for EXACT counterpart in OP pool
    const matchIdx = opPool.findIndex((op) => {
      const sameDate = ned.postingDate === op.postingDate;
      const sameDoc = ned.documentNumber === op.documentNumber;
      const sameItem = ned.itemNumber === op.itemNumber;
      const sameLoc = ned.locationCode === op.locationCode;
      const sameReason = ned.reasonCode === op.reasonCode;
      const qtyMatch = Math.abs(ned.normQty - op.normQty) <= config.exactQuantityTolerance;
      const costMatch = Math.abs(ned.normCost - op.normCost) <= config.exactCostToleranceDkk;

      return sameDate && sameDoc && sameItem && sameLoc && sameReason && qtyMatch && costMatch;
    });

    if (matchIdx !== -1) {
      const op = opPool[matchIdx];
      const costDifference = op.normCost - ned.normCost;
      const qtyDifference = op.normQty - ned.normQty;

      groups.push({
        id: generateGroupId(),
        status: "Matched",
        method: "Exact Direct Match",
        confidence: 100,
        nedRows: [ned],
        opRows: [op],
        nedQuantityTotal: ned.normQty,
        opQuantityTotal: op.normQty,
        quantityDifference: qtyDifference,
        nedCostTotal: ned.normCost,
        opCostTotal: op.normCost,
        costDifference,
        costDifferencePercent: ned.normCost > 0 ? (Math.abs(costDifference) / ned.normCost) * 100 : 0,
        explanation: `Direkte match fundet for vare ${ned.itemNumber} under bilag ${ned.documentNumber}.`,
        warnings: [],
        severity: "Balanced",
        reasonCode: ned.reasonCode || "UOPLYST",
        locationCode: ned.locationCode,
        date: ned.postingDate
      });

      removeNedRow(ned.sourceRowNumber);
      removeOpRow(op.sourceRowNumber);
      i--; // adjust pointer
    }
  }

  // ==========================================
  // STAGE 2: SAME DOCUMENT GROUP
  // ==========================================
  // Group remaining rows by postingDate, documentNumber, locationCode, reasonCode
  const groupKeys = new Set<string>();
  const getDocKey = (r: TabVindNormalizedRow) => `${r.postingDate}|${r.documentNumber}|${r.locationCode}|${r.reasonCode}`;

  nedPool.forEach((r) => groupKeys.add(getDocKey(r)));
  opPool.forEach((r) => groupKeys.add(getDocKey(r)));

  for (const key of groupKeys) {
    const [date, docNum, location, reason] = key.split("|");
    if (!docNum) continue; // skip blank document numbers

    const nedsInDoc = nedPool.filter((r) => getDocKey(r) === key);
    const opsInDoc = opPool.filter((r) => getDocKey(r) === key);

    if (nedsInDoc.length > 0 && opsInDoc.length > 0) {
      const totalNedCost = nedsInDoc.reduce((sum, r) => sum + r.normCost, 0);
      const totalOpCost = opsInDoc.reduce((sum, r) => sum + r.normCost, 0);
      const totalNedQty = nedsInDoc.reduce((sum, r) => sum + r.normQty, 0);
      const totalOpQty = opsInDoc.reduce((sum, r) => sum + r.normQty, 0);

      const costDiff = totalOpCost - totalNedCost;
      const qtyDiff = totalOpQty - totalNedQty;

      // Check if within tolerance
      if (Math.abs(costDiff) <= config.exactCostToleranceDkk) {
        groups.push({
          id: generateGroupId(),
          status: "Matched",
          method: "Same Document Group",
          confidence: 90,
          nedRows: nedsInDoc,
          opRows: opsInDoc,
          nedQuantityTotal: totalNedQty,
          opQuantityTotal: totalOpQty,
          quantityDifference: qtyDiff,
          nedCostTotal: totalNedCost,
          opCostTotal: totalOpCost,
          costDifference: costDiff,
          costDifferencePercent: totalNedCost > 0 ? (Math.abs(costDiff) / totalNedCost) * 100 : 0,
          explanation: `Bilagsgruppe ${docNum} afstemt fuldstændigt med ${nedsInDoc.length} NED og ${opsInDoc.length} OP linjer.`,
          warnings: [],
          severity: "Balanced",
          reasonCode: reason || "UOPLYST",
          locationCode: location,
          date
        });

        nedsInDoc.forEach((r) => removeNedRow(r.sourceRowNumber));
        opsInDoc.forEach((r) => removeOpRow(r.sourceRowNumber));
      }
    }
  }

  // ==========================================
  // STAGE 3: LINKED PRODUCTION DOCUMENTS
  // ==========================================
  // Production entries often have near consecutive document numbers (e.g. PROD-001 and PROD-002)
  // We can group remaining rows by date, location, and reason code, and seek sequence links
  const linkedKeys = new Set<string>();
  const getLinkedKey = (r: TabVindNormalizedRow) => `${r.postingDate}|${r.locationCode}|${r.reasonCode}`;

  nedPool.forEach((r) => linkedKeys.add(getLinkedKey(r)));
  opPool.forEach((r) => linkedKeys.add(getLinkedKey(r)));

  for (const key of linkedKeys) {
    const [date, location, reason] = key.split("|");
    const neds = nedPool.filter((r) => getLinkedKey(r) === key);
    const ops = opPool.filter((r) => getLinkedKey(r) === key);

    if (neds.length > 0 && ops.length > 0) {
      // Look for closely sequenced document numbers
      for (const ned of neds) {
        const matches = ops.filter((op) => {
          const distance = getDocumentNumberDistance(ned.documentNumber, op.documentNumber);
          return distance <= config.maxDocumentNumberDistance;
        });

        if (matches.length > 0) {
          // If we can form a balanced match with any close OP
          const bestOp = matches.find((op) => {
            const costDiff = op.normCost - ned.normCost;
            return Math.abs(costDiff) <= config.productionCostToleranceDkk;
          });

          if (bestOp) {
            const costDifference = bestOp.normCost - ned.normCost;
            const qtyDifference = bestOp.normQty - ned.normQty;

            groups.push({
              id: generateGroupId(),
              status: "Matched",
              method: "Linked Production Documents",
              confidence: 80,
              nedRows: [ned],
              opRows: [bestOp],
              nedQuantityTotal: ned.normQty,
              opQuantityTotal: bestOp.normQty,
              quantityDifference: qtyDifference,
              nedCostTotal: ned.normCost,
              opCostTotal: bestOp.normCost,
              costDifference,
              costDifferencePercent: ned.normCost > 0 ? (Math.abs(costDifference) / ned.normCost) * 100 : 0,
              explanation: `Koblet produktionsbilag fundet: NED (${ned.documentNumber}) og OP (${bestOp.documentNumber}) med lille nummerafstand og ens forretningskontekst.`,
              warnings: [],
              severity: "Balanced",
              reasonCode: reason || "UOPLYST",
              locationCode: location,
              date
            });

            removeNedRow(ned.sourceRowNumber);
            removeOpRow(bestOp.sourceRowNumber);
            break;
          }
        }
      }
    }
  }

  // ==========================================
  // STAGE 4: COST-BASED CONVERSION MATCH
  // ==========================================
  // A raw material (NED) converted to products (OP) within the same date/location/reason
  for (const key of linkedKeys) {
    const [date, location, reason] = key.split("|");
    const remainingNeds = nedPool.filter((r) => getLinkedKey(r) === key);
    const remainingOps = opPool.filter((r) => getLinkedKey(r) === key);

    if (remainingNeds.length > 0 && remainingOps.length > 0) {
      const sumNedCost = remainingNeds.reduce((sum, r) => sum + r.normCost, 0);
      const sumOpCost = remainingOps.reduce((sum, r) => sum + r.normCost, 0);
      const costDifference = sumOpCost - sumNedCost;

      const toleranceAmount = Math.max(config.productionCostToleranceDkk, sumNedCost * (config.productionCostTolerancePercent / 100));

      if (Math.abs(costDifference) <= toleranceAmount) {
        const sumNedQty = remainingNeds.reduce((sum, r) => sum + r.normQty, 0);
        const sumOpQty = remainingOps.reduce((sum, r) => sum + r.normQty, 0);

        groups.push({
          id: generateGroupId(),
          status: "Matched",
          method: "Cost-Based Conversion Match",
          confidence: 75,
          nedRows: remainingNeds,
          opRows: remainingOps,
          nedQuantityTotal: sumNedQty,
          opQuantityTotal: sumOpQty,
          quantityDifference: sumOpQty - sumNedQty,
          nedCostTotal: sumNedCost,
          opCostTotal: sumOpCost,
          costDifference,
          costDifferencePercent: sumNedCost > 0 ? (Math.abs(costDifference) / sumNedCost) * 100 : 0,
          explanation: `Værdibaseret konverteringsmatch fundet. Samlet dagsafstemning balancerer indenfor værditolerance.`,
          warnings: [],
          severity: "Balanced",
          reasonCode: reason || "UOPLYST",
          locationCode: location,
          date
        });

        remainingNeds.forEach((r) => removeNedRow(r.sourceRowNumber));
        remainingOps.forEach((r) => removeOpRow(r.sourceRowNumber));
      }
    }
  }

  // ==========================================
  // STAGE 5: PARTIAL OR AMBIGUOUS MATCH
  // ==========================================
  // Look for remaining entries with the same document number that exceed tolerance
  const remainingDocNums = new Set<string>();
  nedPool.forEach((r) => remainingDocNums.add(r.documentNumber));
  opPool.forEach((r) => remainingDocNums.add(r.documentNumber));

  for (const docNum of remainingDocNums) {
    if (!docNum) continue;
    const neds = nedPool.filter((r) => r.documentNumber === docNum);
    const ops = opPool.filter((r) => r.documentNumber === docNum);

    if (neds.length > 0 && ops.length > 0) {
      const sumNedCost = neds.reduce((sum, r) => sum + r.normCost, 0);
      const sumOpCost = ops.reduce((sum, r) => sum + r.normCost, 0);
      const costDifference = sumOpCost - sumNedCost;
      const sumNedQty = neds.reduce((sum, r) => sum + r.normQty, 0);
      const sumOpQty = ops.reduce((sum, r) => sum + r.normQty, 0);

      const warnings = [`Værdiafvigelse på ${costDifference.toFixed(2)} DKK overstiger de tilladte grænser.`];

      groups.push({
        id: generateGroupId(),
        status: "Partially Matched",
        method: "Partial / Ambiguous Match",
        confidence: 50,
        nedRows: neds,
        opRows: ops,
        nedQuantityTotal: sumNedQty,
        opQuantityTotal: sumOpQty,
        quantityDifference: sumOpQty - sumNedQty,
        nedCostTotal: sumNedCost,
        opCostTotal: sumOpCost,
        costDifference,
        costDifferencePercent: sumNedCost > 0 ? (Math.abs(costDifference) / sumNedCost) * 100 : 0,
        explanation: `Uafstemt bilagsgruppe ${docNum}. Posterne deler bilagsnummer, men dækker over en væsentlig økonomisk difference.`,
        warnings,
        severity: getGroupSeverity("Partially Matched", costDifference, 1),
        reasonCode: neds[0].reasonCode || ops[0].reasonCode || "UOPLYST",
        locationCode: neds[0].locationCode || ops[0].locationCode,
        date: neds[0].postingDate || ops[0].postingDate
      });

      neds.forEach((r) => removeNedRow(r.sourceRowNumber));
      ops.forEach((r) => removeOpRow(r.sourceRowNumber));
    }
  }

  // Look for remaining entries with same Item Number across pools (Ambiguous Match)
  for (let i = 0; i < nedPool.length; i++) {
    const ned = nedPool[i];
    const opIdx = opPool.findIndex((op) => op.itemNumber === ned.itemNumber);

    if (opIdx !== -1) {
      const op = opPool[opIdx];
      const costDifference = op.normCost - ned.normCost;

      groups.push({
        id: generateGroupId(),
        status: "Ambiguous",
        method: "Partial / Ambiguous Match",
        confidence: 40,
        nedRows: [ned],
        opRows: [op],
        nedQuantityTotal: ned.normQty,
        opQuantityTotal: op.normQty,
        quantityDifference: op.normQty - ned.normQty,
        nedCostTotal: ned.normCost,
        opCostTotal: op.normCost,
        costDifference,
        costDifferencePercent: ned.normCost > 0 ? (Math.abs(costDifference) / ned.normCost) * 100 : 0,
        explanation: `Tvetydig match fundet: Vare ${ned.itemNumber} har både NED og OP reguleringer, men er bogført på uoverensstemmende datoer eller bilag.`,
        warnings: ["Uoverensstemmende datoer eller bilag."],
        severity: "Medium",
        reasonCode: ned.reasonCode || op.reasonCode || "UOPLYST",
        locationCode: ned.locationCode || op.locationCode,
        date: ned.postingDate
      });

      removeNedRow(ned.sourceRowNumber);
      removeOpRow(op.sourceRowNumber);
      i--;
    }
  }

  // ==========================================
  // STAGE 6: UNMATCHED
  // ==========================================
  // Anything remaining is unmatched
  nedPool.forEach((ned) => {
    groups.push({
      id: generateGroupId(),
      status: "Unmatched NED",
      method: "Unmatched",
      confidence: 0,
      nedRows: [ned],
      opRows: [],
      nedQuantityTotal: ned.normQty,
      opQuantityTotal: 0,
      quantityDifference: -ned.normQty,
      nedCostTotal: ned.normCost,
      opCostTotal: 0,
      costDifference: -ned.normCost,
      costDifferencePercent: 100,
      explanation: `Uafstemt negativ regulering (NED). Der findes ingen tilsvarende modgående reguleringer.`,
      warnings: [],
      severity: getGroupSeverity("Unmatched NED", -ned.normCost, 0),
      reasonCode: ned.reasonCode || "MANGLER",
      locationCode: ned.locationCode,
      date: ned.postingDate
    });
  });

  opPool.forEach((op) => {
    groups.push({
      id: generateGroupId(),
      status: "Unmatched OP",
      method: "Unmatched",
      confidence: 0,
      nedRows: [],
      opRows: [op],
      nedQuantityTotal: 0,
      opQuantityTotal: op.normQty,
      quantityDifference: op.normQty,
      nedCostTotal: 0,
      opCostTotal: op.normCost,
      costDifference: op.normCost,
      costDifferencePercent: 100,
      explanation: `Uafstemt positiv regulering (OP). Der findes ingen tilsvarende modgående reguleringer.`,
      warnings: [],
      severity: getGroupSeverity("Unmatched OP", op.normCost, 0),
      reasonCode: op.reasonCode || "MANGLER",
      locationCode: op.locationCode,
      date: op.postingDate
    });
  });

  // Calculate high-level summary metrics
  const totalRawNed = normalizedRows.filter((r) => r.entryType === "Nedregulering");
  const totalRawOp = normalizedRows.filter((r) => r.entryType === "Opregulering");

  const nedCostTotal = totalRawNed.reduce((sum, r) => sum + r.normCost, 0);
  const opCostTotal = totalRawOp.reduce((sum, r) => sum + r.normCost, 0);
  const nedQuantityTotal = totalRawNed.reduce((sum, r) => sum + r.normQty, 0);
  const opQuantityTotal = totalRawOp.reduce((sum, r) => sum + r.normQty, 0);

  const matchedGroups = groups.filter((g) => g.status === "Matched");
  const unmatchedNed = groups.filter((g) => g.status === "Unmatched NED");
  const unmatchedOp = groups.filter((g) => g.status === "Unmatched OP");
  const partiallyMatched = groups.filter((g) => g.status === "Partially Matched" || g.status === "Ambiguous");

  const matchedNedCost = matchedGroups.reduce((sum, g) => sum + g.nedCostTotal, 0);

  // Absolute Unexplained difference is the financial delta of unmatched groups and partial groups
  const unmatchedNedCostSum = unmatchedNed.reduce((sum, g) => sum + g.nedCostTotal, 0);
  const unmatchedOpCostSum = unmatchedOp.reduce((sum, g) => sum + g.opCostTotal, 0);
  const partialCostDiffAbsoluteSum = partiallyMatched.reduce((sum, g) => sum + Math.abs(g.costDifference), 0);
  const absoluteUnexplainedDifference = unmatchedNedCostSum + unmatchedOpCostSum + partialCostDiffAbsoluteSum;

  const totalGroupsCount = groups.length;
  const groupMatchRate = totalGroupsCount > 0 ? (matchedGroups.length / totalGroupsCount) * 100 : 0;
  const valueMatchRate = nedCostTotal > 0 ? (matchedNedCost / nedCostTotal) * 100 : 0;

  // Process business date range
  const dates = normalizedRows.map((r) => r.postingDate).sort();
  const dateRange = {
    min: dates[0] || "",
    max: dates[dates.length - 1] || ""
  };
  const detectedBusinessDate = dateRange.max;

  // Analysis status
  let analysisStatus: "success" | "warning" | "empty" = "success";
  if (normalizedRows.length === 0) {
    analysisStatus = "empty";
  } else if (absoluteUnexplainedDifference > 10000 || validationWarnings.length > 5) {
    analysisStatus = "warning";
  }

  return {
    fileName: "",
    fileSize: 0,
    detectedBusinessDate,
    dateRange,
    rowCount: normalizedRows.length,
    nedRowCount: totalRawNed.length,
    opRowCount: totalRawOp.length,
    validationWarnings,
    analysisStatus,
    analysisDurationMs: Date.now() - startTime,
    groups: groups.sort((a, b) => {
      // sort unmatched and ambiguous first by absolute cost impact descending
      const scoreMap = { "Unmatched NED": 5, "Unmatched OP": 5, "Partially Matched": 4, "Ambiguous": 3, "Matched": 1 };
      const statusA = scoreMap[a.status] || 0;
      const statusB = scoreMap[b.status] || 0;
      if (statusA !== statusB) return statusB - statusA;
      return Math.abs(b.costDifference) - Math.abs(a.costDifference);
    }),
    summary: {
      nedCostTotal,
      opCostTotal,
      netCostDifference: opCostTotal - nedCostTotal,
      absoluteUnexplainedDifference,
      nedQuantityTotal,
      opQuantityTotal,
      matchedGroupsCount: matchedGroups.length,
      unmatchedNedCount: unmatchedNed.length,
      unmatchedOpCount: unmatchedOp.length,
      partiallyMatchedCount: partiallyMatched.length,
      groupMatchRate,
      valueMatchRate
    },
    rawRows: normalizedRows
  };
}
