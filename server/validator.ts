import { SalesRawRow, ValidationSummary } from "../src/shared/types.js";

// Danish/Turkish/English column mappings
const COLUMN_MAPS: Record<string, keyof SalesRawRow> = {
  "bogføringsdato": "postingDate",
  "bogforingsdato": "postingDate",
  "posting date": "postingDate",
  "dato": "postingDate",
  "date": "postingDate",
  "kayıt tarihi": "postingDate",
  "kayittarihi": "postingDate",
  "kayit tarihi": "postingDate",
  "tarih": "postingDate",
  
  "posttype": "entryType",
  "entry type": "entryType",
  "type": "entryType",
  "giriş türü": "entryType",
  "giristuru": "entryType",
  "giriş tipi": "entryType",
  "tip": "entryType",
  
  "bilagstype": "documentType",
  "document type": "documentType",
  "bilags type": "documentType",
  "belge türü": "documentType",
  "belgeturu": "documentType",
  "belge tipi": "documentType",
  
  "bilagsnr.": "documentNumber",
  "bilagsnr": "documentNumber",
  "document number": "documentNumber",
  "document no": "documentNumber",
  "bilagsnummer": "documentNumber",
  "belge no": "documentNumber",
  "belge numarası": "documentNumber",
  "belgenumarasi": "documentNumber",
  "belge numarasi": "documentNumber",
  "fatura no": "documentNumber",
  
  "varenr.": "itemNumber",
  "varenr": "itemNumber",
  "item number": "itemNumber",
  "item no": "itemNumber",
  "vare nummer": "itemNumber",
  "ürün no": "itemNumber",
  "urunno": "itemNumber",
  "urun no": "itemNumber",
  "ürün numarası": "itemNumber",
  "urun numarasi": "itemNumber",
  "stok no": "itemNumber",
  "stok kodu": "itemNumber",
  
  "beskrivelse": "description",
  "description": "description",
  "varebeskrivelse": "description",
  "açıklama": "description",
  "aciklama": "description",
  "tanım": "description",
  "tanim": "description",
  
  "lokationskode": "locationCode",
  "location code": "locationCode",
  "lokation": "locationCode",
  "location": "locationCode",
  "lokasyon kodu": "locationCode",
  "lokasyon": "locationCode",
  "depo kodu": "locationCode",
  "depo": "locationCode",
  
  "antal": "quantity",
  "quantity": "quantity",
  "mængde": "quantity",
  "miktar": "quantity",
  "adet": "quantity",
  
  "faktureret antal": "invoicedQuantity",
  "invoiced quantity": "invoicedQuantity",
  "faktureret_antal": "invoicedQuantity",
  "faturalanan miktar": "invoicedQuantity",
  
  "restantal": "remainingQuantity",
  "remaining quantity": "remainingQuantity",
  "rest_antal": "remainingQuantity",
  "kalan miktar": "remainingQuantity",
  "kalanmiktar": "remainingQuantity",
  
  "salgsbeløb (faktisk)": "salesAmount",
  "salgsbeløb_faktisk": "salesAmount",
  "salgsbeløb": "salesAmount",
  "sales amount": "salesAmount",
  "sales_amount": "salesAmount",
  "beløb": "salesAmount",
  "satış tutarı": "salesAmount",
  "satistutari": "salesAmount",
  "satis tutari": "salesAmount",
  "tutar": "salesAmount",
  "satış": "salesAmount",
  "satis": "salesAmount",
  
  "kostbeløb (faktisk)": "costAmount",
  "kostbeløb_faktisk": "costAmount",
  "kostbeløb": "costAmount",
  "cost amount": "costAmount",
  "cost_amount": "costAmount",
  "kost": "costAmount",
  "maliyet tutarı": "costAmount",
  "maliyet tutari": "costAmount",
  "maliyet": "costAmount",
  
  "kildetype": "sourceType",
  "source type": "sourceType",
  "kilde type": "sourceType",
  "kaynak türü": "sourceType",
  "kaynakturu": "sourceType",
  
  "kildenr.": "customerNumber",
  "kildenr": "customerNumber",
  "customer number": "customerNumber",
  "customer no": "customerNumber",
  "kilde nummer": "customerNumber",
  "müşteri no": "customerNumber",
  "musterino": "customerNumber",
  "musteri no": "customerNumber",
  "cari kod": "customerNumber",
  "cari kodu": "customerNumber",
  "kodu": "customerNumber",
  
  "source name": "customerName",
  "customer name": "customerName",
  "kundenavn": "customerName",
  "kunde navn": "customerName",
  "navn": "customerName",
  "source_name": "customerName",
  "müşteri adı": "customerName",
  "musteriadi": "customerName",
  "musteri adi": "customerName",
  "cari unvan": "customerName",
  "cari adı": "customerName",
  "cari adi": "customerName",
  "isim": "customerName",
  
  "afdelingskode": "departmentCode",
  "department code": "departmentCode",
  "afdeling": "departmentCode",
  "departman kodu": "departmentCode",
  "departman": "departmentCode",
  
  "medarbejder": "employeeName",
  "employee name": "employeeName",
  "sælger": "employeeName",
  "personel": "employeeName",
  "çalışan": "employeeName",
  "satici": "employeeName"
};

// Standard list of required canonical columns
const REQUIRED_KEYS: (keyof SalesRawRow)[] = [
  "postingDate",
  "documentNumber",
  "itemNumber",
  "description",
  "salesAmount",
  "costAmount",
  "customerNumber"
];

// Helper to clean string column headers
function normalizeHeader(h: any): string {
  if (h === null || h === undefined) return "";
  return String(h).trim().toLowerCase().replace(/[\r\n\t_]/g, " ");
}

// Map spreadsheet raw row into our canonical row model
export function normalizeRow(rawRow: any, headerMapping: Record<string, keyof SalesRawRow>): Partial<SalesRawRow> {
  const result: any = {};
  
  Object.entries(rawRow).forEach(([key, val]) => {
    const canonicalKey = headerMapping[key];
    if (canonicalKey) {
      result[canonicalKey] = val;
    }
  });
  
  return result;
}

// Standard cell value parsers
function parseDateValue(val: any): string {
  if (!val) return "";
  // Check if excel date serial number
  if (typeof val === "number") {
    // Excel date epoch starts on 1900-01-01 (or 1899-12-30 due to bug in Excel leap year)
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + val * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  const str = String(val).trim();
  
  // Check if it is a stringified Excel date serial number
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (num > 30000 && num < 60000) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + num * 24 * 60 * 60 * 1000);
      return date.toISOString().split("T")[0];
    }
  }
  
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  // Match DD-MM-YYYY
  const dm = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dm) {
    const d = dm[1].padStart(2, "0");
    const m = dm[2].padStart(2, "0");
    const y = dm[3];
    return `${y}-${m}-${d}`;
  }
  // Fallback to JS parsing
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
  
  // Handle Danish format (comma as decimal separator and dots as thousands separators)
  // e.g. "1.234,56" -> "1234.56"
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(",", ".");
  } else if (str.includes(",") && str.includes(".")) {
    // both comma and dot exist: remove dots, change comma to dot
    str = str.replace(/\./g, "").replace(",", ".");
  }
  
  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  return isNegative ? -parsed : parsed;
}

// Comprehensive Excel Sheet Validator
export function validateExcelData(fileName: string, rawRows: any[]): ValidationSummary {
  const summary: ValidationSummary = {
    fileName,
    detectedWorksheet: "Sheet1",
    detectedBusinessDate: "",
    dateRange: { min: "", max: "" },
    rowCount: rawRows.length,
    columnCount: 0,
    requiredColumnsFound: [],
    missingColumns: [],
    unknownColumns: [],
    emptyRequiredFieldsCount: 0,
    invalidDatesCount: 0,
    invalidNumbersCount: 0,
    duplicateRowCount: 0,
    isValid: false,
    validationStatus: "invalid"
  };

  if (rawRows.length === 0) {
    summary.validationStatus = "invalid";
    summary.isValid = false;
    return summary;
  }

  // Get all unique keys from raw records to check headers
  const firstRow = rawRows[0];
  const originalHeaders = Object.keys(firstRow);
  summary.columnCount = originalHeaders.length;

  // Build the header map
  const headerMapping: Record<string, keyof SalesRawRow> = {};
  const mappedCanonicalKeys = new Set<keyof SalesRawRow>();

  originalHeaders.forEach((h) => {
    const norm = normalizeHeader(h);
    const canonical = COLUMN_MAPS[norm];
    if (canonical) {
      headerMapping[h] = canonical;
      mappedCanonicalKeys.add(canonical);
    } else {
      summary.unknownColumns.push(h);
    }
  });

  // Check required keys
  REQUIRED_KEYS.forEach((reqKey) => {
    const isFound = mappedCanonicalKeys.has(reqKey);
    const originalName = Object.entries(COLUMN_MAPS).find(([_, k]) => k === reqKey)?.[0] || String(reqKey);
    if (isFound) {
      summary.requiredColumnsFound.push(reqKey);
    } else {
      summary.missingColumns.push(originalName);
    }
  });

  // Filter out empty rows (noise/blank rows at the bottom of the Excel sheet)
  const nonNoiseRows = rawRows.filter((row) => {
    if (!row) return false;
    const normalized = normalizeRow(row, headerMapping);
    
    const postingDateRaw = normalized.postingDate;
    const docNumRaw = normalized.documentNumber;
    const itemNumRaw = normalized.itemNumber;
    
    const hasPostingDate = postingDateRaw !== undefined && postingDateRaw !== null && String(postingDateRaw).trim() !== "";
    const hasDocNum = docNumRaw !== undefined && docNumRaw !== null && String(docNumRaw).trim() !== "";
    const hasItemNum = itemNumRaw !== undefined && itemNumRaw !== null && String(itemNumRaw).trim() !== "";
    
    return hasPostingDate || hasDocNum || hasItemNum;
  });

  summary.rowCount = nonNoiseRows.length;

  // Calculate row duplication (based on stringified row representation)
  const seenRows = new Set<string>();
  const datesFound: string[] = [];

  nonNoiseRows.forEach((row, idx) => {
    // Stringify row to check duplicates
    const stringified = JSON.stringify(row);
    if (seenRows.has(stringified)) {
      summary.duplicateRowCount++;
    } else {
      seenRows.add(stringified);
    }

    // Parse values to validate them
    const normalized = normalizeRow(row, headerMapping);

    // Validate date
    const postingDateRaw = normalized.postingDate;
    const parsedDate = parseDateValue(postingDateRaw);
    if (!parsedDate) {
      summary.invalidDatesCount++;
    } else {
      datesFound.push(parsedDate);
    }

    // Validate core numeric values
    const salesAmtRaw = normalized.salesAmount;
    const costAmtRaw = normalized.costAmount;
    const qtyRaw = normalized.quantity;

    if (salesAmtRaw !== undefined && isNaN(parseNumericValue(salesAmtRaw))) {
      summary.invalidNumbersCount++;
    }
    if (costAmtRaw !== undefined && isNaN(parseNumericValue(costAmtRaw))) {
      summary.invalidNumbersCount++;
    }
    if (qtyRaw !== undefined && isNaN(parseNumericValue(qtyRaw))) {
      summary.invalidNumbersCount++;
    }

    // Check empty required fields
    REQUIRED_KEYS.forEach((reqKey) => {
      const val = normalized[reqKey];
      if (val === undefined || val === null || String(val).trim() === "") {
        summary.emptyRequiredFieldsCount++;
      }
    });
  });

  // Process business date range
  if (datesFound.length > 0) {
    datesFound.sort();
    summary.dateRange.min = datesFound[0];
    summary.dateRange.max = datesFound[datesFound.length - 1];

    // Detect primary business date (most frequent date or the max date)
    // For single-day sheets, min and max are the same.
    summary.detectedBusinessDate = summary.dateRange.max;
  }

  // Determine validity
  const hasMissingRequired = summary.missingColumns.length > 0;
  const excessiveErrors = summary.emptyRequiredFieldsCount > (rawRows.length * 0.5) || summary.invalidDatesCount > (rawRows.length * 0.5);

  if (hasMissingRequired || excessiveErrors) {
    summary.isValid = false;
    summary.validationStatus = "invalid";
  } else if (summary.missingColumns.length === 0 && summary.emptyRequiredFieldsCount === 0 && summary.invalidDatesCount === 0) {
    summary.isValid = true;
    summary.validationStatus = "valid";
  } else {
    summary.isValid = true;
    summary.validationStatus = "warning";
  }

  return summary;
}

// Convert raw rows to clean, typed SalesRawRow list
export function cleanAndMapRows(rawRows: any[], businessDate: string): SalesRawRow[] {
  const headerMapping: Record<string, keyof SalesRawRow> = {};
  if (rawRows.length === 0) return [];

  const originalHeaders = Object.keys(rawRows[0]);
  originalHeaders.forEach((h) => {
    const norm = normalizeHeader(h);
    const canonical = COLUMN_MAPS[norm];
    if (canonical) {
      headerMapping[h] = canonical;
    }
  });

  // Filter out empty rows (noise/blank rows at the bottom of the Excel sheet)
  const nonNoiseRows = rawRows.filter((row) => {
    if (!row) return false;
    const normalized = normalizeRow(row, headerMapping);
    
    const postingDateRaw = normalized.postingDate;
    const docNumRaw = normalized.documentNumber;
    const itemNumRaw = normalized.itemNumber;
    
    const hasPostingDate = postingDateRaw !== undefined && postingDateRaw !== null && String(postingDateRaw).trim() !== "";
    const hasDocNum = docNumRaw !== undefined && docNumRaw !== null && String(docNumRaw).trim() !== "";
    const hasItemNum = itemNumRaw !== undefined && itemNumRaw !== null && String(itemNumRaw).trim() !== "";
    
    return hasPostingDate || hasDocNum || hasItemNum;
  });

  return nonNoiseRows.map((row) => {
    const normalized = normalizeRow(row, headerMapping);
    
    // Parse values explicitly
    let rawLoc = String(normalized.locationCode || "HOVED").trim();
    if (rawLoc === "LOK01") {
      rawLoc = "HOVED";
    }

    const finalRow: SalesRawRow = {
      postingDate: parseDateValue(normalized.postingDate) || businessDate,
      entryType: String(normalized.entryType || "Salg").trim(),
      documentType: String(normalized.documentType || "Faktura").trim(),
      documentNumber: String(normalized.documentNumber || "").trim(),
      itemNumber: String(normalized.itemNumber || "").trim(),
      description: String(normalized.description || "").trim(),
      locationCode: rawLoc,
      quantity: parseNumericValue(normalized.quantity),
      invoicedQuantity: parseNumericValue(normalized.invoicedQuantity !== undefined ? normalized.invoicedQuantity : normalized.quantity),
      remainingQuantity: parseNumericValue(normalized.remainingQuantity || 0),
      salesAmount: parseNumericValue(normalized.salesAmount),
      costAmount: parseNumericValue(normalized.costAmount),
      sourceType: String(normalized.sourceType || "Kunde").trim(),
      customerNumber: String(normalized.customerNumber || "").trim(),
      customerName: String(normalized.customerName || "Kontant").trim(),
      departmentCode: String(normalized.departmentCode || "AFD01").trim(),
      employeeName: String(normalized.employeeName || "").trim()
    };

    return finalRow;
  });
}
