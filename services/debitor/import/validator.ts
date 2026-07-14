import { DebitorRawRow, DebitorValidationSummary } from "../../../types/debitor/index.ts";

const COLUMN_MAPS: Record<string, keyof DebitorRawRow> = {
  // customerNumber
  "kundenr.": "customerNumber",
  "kundenr": "customerNumber",
  "kundenummer": "customerNumber",
  "customer number": "customerNumber",
  "customer no": "customerNumber",
  "customer_no": "customerNumber",
  "kildenr.": "customerNumber",
  "kildenr": "customerNumber",
  "kilde nummer": "customerNumber",
  "müşteri no": "customerNumber",
  "musterino": "customerNumber",
  "musteri no": "customerNumber",
  "cari kod": "customerNumber",
  "cari kodu": "customerNumber",

  // customerName
  "kundenavn": "customerName",
  "kunde navn": "customerName",
  "customer name": "customerName",
  "customer_name": "customerName",
  "navn": "customerName",
  "name": "customerName",
  "source name": "customerName",
  "source_name": "customerName",
  "müşteri adı": "customerName",
  "musteriadi": "customerName",
  "musteri adi": "customerName",
  "cari unvan": "customerName",
  "cari adı": "customerName",
  "cari adi": "customerName",

  // balance
  "saldo": "balance",
  "balance": "balance",
  "saldobeløb": "balance",
  "saldobelob": "balance",
  "saldo (kr)": "balance",
  "balance (kr)": "balance",
  "bakiye": "balance",
  "tutar": "balance",

  // overdueBalance
  "forfalden saldo": "overdueBalance",
  "forfalden_saldo": "overdueBalance",
  "overdue balance": "overdueBalance",
  "overdue_balance": "overdueBalance",
  "forfalden": "overdueBalance",
  "forfalden (kr)": "overdueBalance",
  "forfaldent": "overdueBalance",
  "vadesi geçmiş bakiye": "overdueBalance",
  "vadesi gecmis bakiye": "overdueBalance",

  // paymentTerms
  "betalingsbetingelser": "paymentTerms",
  "betalingsbetingelse": "paymentTerms",
  "payment terms": "paymentTerms",
  "payment_terms": "paymentTerms",
  "payment terms code": "paymentTerms",
  "ödeme koşulları": "paymentTerms",
  "odeme kosullari": "paymentTerms",

  // lastInvoice
  "seneste faktura": "lastInvoice",
  "seneste fakturadato": "lastInvoice",
  "seneste_fakturadato": "lastInvoice",
  "seneste_faktura": "lastInvoice",
  "last invoice": "lastInvoice",
  "last invoice date": "lastInvoice",
  "last_invoice_date": "lastInvoice",
  "son fatura": "lastInvoice",
  "son fatura tarihi": "lastInvoice",

  // creditHandling
  "kreditstyring": "creditHandling",
  "kredit styring": "creditHandling",
  "credit handling": "creditHandling",
  "credit_handling": "creditHandling",
  "spærret": "creditHandling",
  "spaerset": "creditHandling",
  "kredit grænse": "creditHandling",
  "kredi sınırı": "creditHandling",
  "kredi limiti": "creditHandling",

  // salesperson
  "sælger": "salesperson",
  "saelger": "salesperson",
  "salesperson": "salesperson",
  "sales person": "salesperson",
  "salesperson code": "salesperson",
  "sælgerkode": "salesperson",
  "saelgerkode": "salesperson",
  "satici": "salesperson",
  "satıcı": "salesperson",

  // location
  "lokation": "location",
  "location": "location",
  "lokationskode": "location",
  "location code": "location",
  "depo": "location",
  "depo kodu": "location",
};

const REQUIRED_KEYS: (keyof DebitorRawRow)[] = ["customerNumber", "customerName", "balance"];

// Parses Danish decimals or standard numbers safely
export function parseNumberSafely(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim();
  if (!str) return 0;

  let isNegative = false;
  if (str.endsWith("-")) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith("-")) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  // Handle Danish number format
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(/,/g, ".");
  } else if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(/,/g, ".");
  }

  const parsed = parseFloat(str);
  const result = isNaN(parsed) ? 0 : parsed;
  return isNegative ? -result : result;
}

// Normalize date format to YYYY-MM-DD
export function parseDateSafely(val: any): string {
  if (!val) return "";
  if (typeof val === "number") {
    // Excel serial date serial number
    try {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
  }

  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD-MM-YYYY or DD.MM.YYYY
  const match = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    const padD = d.padStart(2, "0");
    const padM = m.padStart(2, "0");
    return `${y}-${padM}-${padD}`;
  }

  return str;
}

// Dynamic Column Mapper to detect column indices or loosely matched headers
export function getDynamicRowMapper(firstRowKeys: string[]): Record<keyof DebitorRawRow, string> {
  const map: Record<keyof DebitorRawRow, string> = {
    customerNumber: "",
    customerName: "",
    balance: "",
    overdueBalance: "",
    paymentTerms: "",
    lastInvoice: "",
    creditHandling: "",
    salesperson: "",
    location: "",
    seller: "",
  };

  firstRowKeys.forEach((key, index) => {
    const h = key.trim().toLowerCase();

    // Helper checking for multiple substrings
    const hasAny = (subs: string[]) => subs.some(sub => h.includes(sub));

    // 1. customerNumber
    if (
      h === "nr." || h === "nr" || h === "nummer" || h === "number" ||
      hasAny(["kundenr", "customer number", "customer no", "customer_no", "debitornr", "debitor nr", "debitor_nr", "müşteri no", "musteri no", "musterino", "cari kod", "cari_kod", "kunde nr", "kunde-nr", "musteri nr", "müsteri nr", "müşteri nr"])
    ) {
      if (!map.customerNumber || h.includes("kundenr") || h === "nummer" || h.includes("debitor") || h.includes("musteri")) {
        map.customerNumber = key;
      }
    }

    // 2. customerName
    if (
      h === "navn" || h === "name" ||
      hasAny(["kundenavn", "customer name", "customer_name", "müşteri adı", "musteriadi", "musteri adi", "cari unvan", "cari adı", "cari adi", "musteri ismi", "müşteri ismi", "müsteri ismi"])
    ) {
      if (!map.customerName || h.includes("kundenavn") || h === "navn" || h.includes("musteri")) {
        map.customerName = key;
      }
    }

    // 3. balance
    if (
      h === "saldo" || h === "balance" || h === "bakiye" || h === "tutar" ||
      hasAny(["saldo ", "saldo(", "saldobel", "saldosu", "balance ", "tutar"])
    ) {
      if (!map.balance || h === "saldo" || h.includes("saldobel") || h.includes("saldo (rv)")) {
        map.balance = key;
      }
    }

    // 4. overdueBalance
    if (
      h === "forfalden" || h === "forfaldent" || h === "overdue" || h === "vadesi" || h === "forf" ||
      hasAny(["forfalden", "forfaldent", "forf. beløb", "forf. belob", "forf.beløb", "forf.belob", "overdue", "vadesi", "forf", "forf.", "vadesi gecmis", "vadesi geçmiş"])
    ) {
      if (!map.overdueBalance || h.includes("forfalden") || h.includes("forf.")) {
        map.overdueBalance = key;
      }
    }

    // 5. paymentTerms
    if (
      h === "betaling" || h === "betingelse" || h === "betingelser" ||
      hasAny(["betalingsbetingelser", "payment terms", "payment_terms", "betalingsbet", "ödeme ko", "odeme ko", "betingelseskode", "betalingsbeting.kode", "betalingsbetingelse", "odeme anlasmasi", "ödeme anlaşması"])
    ) {
      if (!map.paymentTerms || h.includes("betaling") || h.includes("beting")) {
        map.paymentTerms = key;
      }
    }

    // 6. creditHandling
    if (
      h === "status" || h === "spærret" || h === "spaerset" ||
      hasAny(["ls status", "ls_status", "kreditstyring", "credit handling", "spærret", "spaerset", "kredi s", "kredi l", "tahsilat aktif", "aktif", "pasif", "ls status", "lsstatus"])
    ) {
      if (!map.creditHandling || h.includes("ls status") || h.includes("spærret")) {
        map.creditHandling = key;
      }
    }

    // 7. lastInvoice
    if (
      h === "fakturadato" ||
      hasAny(["seneste faktura", "last invoice", "sidste faktura", "son fatura", "fakturadato", "sidste fakturadato", "son alisveris", "son alışveriş", "sidste_fakturadato"])
    ) {
      if (!map.lastInvoice || h.includes("fakturadato") || h.includes("sidste")) {
        map.lastInvoice = key;
      }
    }

    // 8. salesperson
    if (
      h === "sælger" || h === "saelger" || h === "satici" || h === "satıcı" ||
      h.includes("kredithåndtering") || h.includes("kreditåndtering") || h.includes("kredithandtering") || h.includes("kreditandtering") || h.includes("kredith") || h.includes("kreditå") ||
      hasAny([
        "sælger", "saelger", "salesperson", "sales person", "satici", "satıcı", 
        "kredi tahsilat", "kreditansvarlig", "credit manager", "sælgerkode", "saelgerkode",
        "kredithåndtering", "kreditåndtering", "kredithandtering", "kreditandtering",
        "kredith", "kreditå"
      ])
    ) {
      // Prioritize "kredithåndtering" / "kreditåndtering" / "kredi tahsilat" over general salesperson/sælger if both exist
      const isKreditSpecial = h.includes("kredith") || h.includes("kreditå") || h.includes("kreditand") || h.includes("kredithand") || h.includes("kredi") || h.includes("tahsilat") || h.includes("manager") || h.includes("ansvarlig");
      const currentIsKreditSpecial = map.salesperson && (
        map.salesperson.toLowerCase().includes("kredith") || 
        map.salesperson.toLowerCase().includes("kreditå") || 
        map.salesperson.toLowerCase().includes("kreditand") || 
        map.salesperson.toLowerCase().includes("kredithand") || 
        map.salesperson.toLowerCase().includes("kredi") || 
        map.salesperson.toLowerCase().includes("tahsilat") || 
        map.salesperson.toLowerCase().includes("manager") || 
        map.salesperson.toLowerCase().includes("ansvarlig")
      );

      if (!map.salesperson || (isKreditSpecial && !currentIsKreditSpecial)) {
        map.salesperson = key;
      }
    }

    // 9. location
    if (
      h === "lokation" || h === "location" || h === "depo" ||
      hasAny(["lokation", "location", "depo", "lokationskode", "bayi"])
    ) {
      if (!map.location || h.includes("lokation") || h === "location") {
        map.location = key;
      }
    }
  });

  // Apply positional fallbacks based on column count if keys are still unmapped
  // 12-column layout fallback
  if (firstRowKeys.length >= 12 && firstRowKeys.length < 15) {
    if (!map.customerNumber) map.customerNumber = firstRowKeys[0]; // Nummer
    if (!map.customerName) map.customerName = firstRowKeys[2]; // Navn
    if (!map.balance) map.balance = firstRowKeys[5]; // Saldo (RV)
    if (!map.overdueBalance) map.overdueBalance = firstRowKeys[6]; // Forf. beløb (RV)
    if (!map.paymentTerms) map.paymentTerms = firstRowKeys[7]; // Betalingsbeting.kode
    if (!map.lastInvoice) map.lastInvoice = firstRowKeys[9]; // Sidste fakturadato
    if (!map.salesperson) {
      // Safe fallback - don't map to customerName column or column with 'navn'/'name'
      const fallbackKey = firstRowKeys[1];
      const fkLower = fallbackKey.toLowerCase();
      if (!fkLower.includes("navn") && !fkLower.includes("name") && fallbackKey !== map.customerName) {
        map.salesperson = fallbackKey;
      }
    }
    if (!map.seller) map.seller = firstRowKeys[1]; // Sælgerkode
  }
  // 18-column layout fallback
  else if (firstRowKeys.length >= 18) {
    if (!map.customerNumber) map.customerNumber = firstRowKeys[0]; // musteri nr
    if (!map.seller) map.seller = firstRowKeys[1]; // Column B Sælger (Sælgerkode)
    if (!map.customerName) map.customerName = firstRowKeys[2]; // musteri ismi
    if (!map.location) map.location = firstRowKeys[4]; // Column E (lokation)
    if (!map.balance) map.balance = firstRowKeys[5]; // saldosu
    if (!map.overdueBalance) map.overdueBalance = firstRowKeys[6]; // forf. beløb
    if (!map.paymentTerms) map.paymentTerms = firstRowKeys[7]; // betalingsbet.kode
    if (!map.creditHandling) map.creditHandling = firstRowKeys[8]; // LS status
    if (!map.lastInvoice) map.lastInvoice = firstRowKeys[9]; // sidste fakturadato
    if (!map.salesperson) map.salesperson = firstRowKeys[14]; // kredi tahsilati ile ilgilenen kisi (column O)
  }
  // Generic fallback if column count is unexpected
  else {
    if (!map.customerNumber && firstRowKeys.length > 0) map.customerNumber = firstRowKeys[0];
    if (!map.customerName && firstRowKeys.length > 1) map.customerName = firstRowKeys[1];
    if (!map.balance && firstRowKeys.length > 2) map.balance = firstRowKeys[2];
  }

  return map;
}

// Validate raw Excel rows
export function validateDebitorExcelData(fileName: string, rawRows: any[]): DebitorValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingColumns: string[] = [];

  if (!rawRows || rawRows.length === 0) {
    return {
      isValid: false,
      fileName,
      rowCount: 0,
      columnCount: 0,
      detectedBusinessDate: new Date().toISOString().split("T")[0],
      validationStatus: "invalid",
      errors: ["Excel-arket indeholder ingen rækker."],
      warnings: [],
      missingColumns: [],
    };
  }

  // Extract keys from first row
  const firstRowKeys = Object.keys(rawRows[0]);
  const columnCount = firstRowKeys.length;

  // Use dynamic mapper to map columns
  const map = getDynamicRowMapper(firstRowKeys);

  // Check required keys
  const requiredFields: { key: keyof DebitorRawRow; label: string }[] = [
    { key: "customerNumber", label: "customerNumber" },
    { key: "customerName", label: "customerName" },
    { key: "balance", label: "balance" },
  ];

  requiredFields.forEach(({ key, label }) => {
    if (!map[key]) {
      missingColumns.push(label);
      errors.push(`Mangler påkrævet kolonne for: ${label}`);
    }
  });

  // Warn about missing optional keys
  const optionalFields: { key: keyof DebitorRawRow; label: string }[] = [
    { key: "overdueBalance", label: "overdueBalance" },
    { key: "paymentTerms", label: "paymentTerms" },
    { key: "lastInvoice", label: "lastInvoice" },
    { key: "creditHandling", label: "creditHandling" },
    { key: "salesperson", label: "salesperson" },
    { key: "location", label: "location" },
  ];

  optionalFields.forEach(({ key, label }) => {
    if (!map[key]) {
      warnings.push(`Valgfri kolonne "${label}" blev ikke fundet. Standardværdier vil blive anvendt.`);
    }
  });

  // Try to detect business date from filename (e.g. "Debitorsaldo_2026-07-14.xlsx")
  let detectedBusinessDate = new Date().toISOString().split("T")[0];
  const dateMatch = fileName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (dateMatch) {
    detectedBusinessDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  } else {
    // Check Danish DD-MM-YYYY date format in filename
    const dateMatchDanish = fileName.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
    if (dateMatchDanish) {
      detectedBusinessDate = `${dateMatchDanish[3]}-${dateMatchDanish[2]}-${dateMatchDanish[1]}`;
    }
  }

  // Map clean rows for validation metrics
  const cleanRows = cleanAndMapDebitorRows(rawRows);
  const canonicalRowCount = cleanRows.length;

  const seenCustomers = new Set<string>();
  let duplicateCustomerCount = 0;
  let missingCustomerNumberCount = 0;
  let missingCustomerNameCount = 0;
  let invalidBalanceCount = 0;
  let invalidOverdueCount = 0;
  let invalidLastInvoiceDateCount = 0;
  let negativeBalanceCount = 0;
  let negativeOverdueCount = 0;
  let missingCreditHandlingCount = 0;

  cleanRows.forEach((clean, idx) => {
    const raw = rawRows[idx];
    const customerNo = clean.customerNumber;
    if (!customerNo) {
      missingCustomerNumberCount++;
    } else {
      if (seenCustomers.has(customerNo)) {
        duplicateCustomerCount++;
      } else {
        seenCustomers.add(customerNo);
      }
    }

    if (!clean.customerName || clean.customerName === "Ukendt Kunde") {
      missingCustomerNameCount++;
    }

    if (clean.balance < 0) {
      negativeBalanceCount++;
    }
    if (clean.overdueBalance < 0) {
      negativeOverdueCount++;
    }

    // Check raw fields
    const rawBal = map.balance ? raw[map.balance] : undefined;
    if (rawBal !== undefined && rawBal !== null && rawBal !== "") {
      const parsed = parseNumberSafely(rawBal);
      if (parsed === 0 && String(rawBal).trim() !== "0" && !String(rawBal).trim().startsWith("0")) {
        invalidBalanceCount++;
      }
    } else {
      invalidBalanceCount++;
    }

    const rawOverdue = map.overdueBalance ? raw[map.overdueBalance] : undefined;
    if (rawOverdue !== undefined && rawOverdue !== null && rawOverdue !== "") {
      const parsed = parseNumberSafely(rawOverdue);
      if (parsed === 0 && String(rawOverdue).trim() !== "0" && !String(rawOverdue).trim().startsWith("0")) {
        invalidOverdueCount++;
      }
    }

    const rawLastInv = map.lastInvoice ? raw[map.lastInvoice] : undefined;
    if (rawLastInv) {
      const parsedDate = parseDateSafely(rawLastInv);
      if (!parsedDate || parsedDate === "") {
        invalidLastInvoiceDateCount++;
      }
    }

    const rawCH = map.creditHandling ? raw[map.creditHandling] : undefined;
    if (!rawCH) {
      missingCreditHandlingCount++;
    }
  });

  const uniqueCustomerCount = seenCustomers.size;

  // Add failures based on the specification constraints
  if (canonicalRowCount > 0 && missingCustomerNumberCount === canonicalRowCount) {
    errors.push("Alle kundenumre er tomme/blanke.");
  }

  // Configurable invalid percentage threshold (e.g. max 25% invalid balance rows)
  const MAX_INVALID_PERCENT = 0.25;
  if (canonicalRowCount > 0 && (invalidBalanceCount / canonicalRowCount) > MAX_INVALID_PERCENT) {
    errors.push(`Materiell del af rækkerne fejlede i numerisk bakiye-parsing (${Math.round((invalidBalanceCount / canonicalRowCount) * 100)}% fejl).`);
  }

  // Duplicate warning
  if (duplicateCustomerCount > 0) {
    warnings.push(`Fandt ${duplicateCustomerCount} duplikerede kundenumre. Disse vil blive aggregeret ved import.`);
  }

  const isValid = errors.length === 0;
  const validationStatus = !isValid ? "invalid" : warnings.length > 0 ? "warning" : "valid";

  return {
    isValid,
    fileName,
    rowCount: rawRows.length,
    columnCount,
    detectedBusinessDate,
    validationStatus,
    errors,
    warnings,
    missingColumns,
    canonicalRowCount,
    uniqueCustomerCount,
    duplicateCustomerCount,
    missingCustomerNumberCount,
    missingCustomerNameCount,
    invalidBalanceCount,
    invalidOverdueCount,
    invalidLastInvoiceDateCount,
    negativeBalanceCount,
    negativeOverdueCount,
    missingCreditHandlingCount,
    unknownColumnCount: 0, // unmapped count can be calculated if needed, default to 0
    canImport: isValid,
    previewRows: cleanRows.slice(0, 50),
  };
}

// Clean and map raw Excel rows to canonical DebitorRawRow structures
export function cleanAndMapDebitorRows(rawRows: any[]): DebitorRawRow[] {
  if (!rawRows || rawRows.length === 0) return [];
  const firstRowKeys = Object.keys(rawRows[0]);
  const map = getDynamicRowMapper(firstRowKeys);

  return rawRows.map((raw) => {
    const customerNumber = String(map.customerNumber ? raw[map.customerNumber] || "" : "").trim();
    const customerName = String(map.customerName ? raw[map.customerName] || "Ukendt Kunde" : "Ukendt Kunde").trim();
    const balance = parseNumberSafely(map.balance ? raw[map.balance] : 0);
    const overdueBalance = parseNumberSafely(map.overdueBalance ? raw[map.overdueBalance] : 0);
    const paymentTerms = String(map.paymentTerms ? raw[map.paymentTerms] || "Netto 14 dage" : "Netto 14 dage").trim();
    const lastInvoice = parseDateSafely(map.lastInvoice ? raw[map.lastInvoice] : "");
    const creditHandling = String(map.creditHandling ? raw[map.creditHandling] || "Normal" : "Normal").trim();
    const salesperson = String(map.salesperson ? raw[map.salesperson] || "Uspecificeret" : "Uspecificeret").trim();
    const seller = String(map.seller ? raw[map.seller] || "Uspecificeret" : "Uspecificeret").trim();
    
    let location = String(map.location ? raw[map.location] || "HOVED" : "HOVED").trim();
    if (location === "LOK01" || !location) {
      location = "HOVED";
    }

    return {
      customerNumber,
      customerName,
      balance,
      overdueBalance,
      paymentTerms,
      lastInvoice,
      creditHandling,
      salesperson,
      location,
      seller,
    };
  });
}

// Aggregate duplicate customer rows by customer number
export function aggregateDebitorRows(rows: DebitorRawRow[]): DebitorRawRow[] {
  const map = new Map<string, DebitorRawRow>();

  rows.forEach((row) => {
    const custNo = row.customerNumber;
    if (!custNo) return;

    if (!map.has(custNo)) {
      map.set(custNo, { ...row });
    } else {
      const existing = map.get(custNo)!;
      // 1. Sum balance
      existing.balance += row.balance;
      // 2. Sum overdue balance
      existing.overdueBalance += row.overdueBalance;
      // 3. Use the latest valid last-invoice date
      if (row.lastInvoice) {
        if (!existing.lastInvoice || row.lastInvoice > existing.lastInvoice) {
          existing.lastInvoice = row.lastInvoice;
        }
      }
      // 4. Prefer the first non-empty customer name
      if (!existing.customerName && row.customerName) {
        existing.customerName = row.customerName;
      }
      // 5. Use the first non-empty credit handling value unless values conflict
      if (!existing.creditHandling && row.creditHandling) {
        existing.creditHandling = row.creditHandling;
      }
      // Keep other fields like salesperson or location if existing is empty
      if (!existing.salesperson && row.salesperson) {
        existing.salesperson = row.salesperson;
      }
      if (!existing.location && row.location) {
        existing.location = row.location;
      }
      if (!existing.seller && row.seller) {
        existing.seller = row.seller;
      }
    }
  });

  return Array.from(map.values());
}
