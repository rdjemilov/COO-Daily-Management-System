import { parseNumberSafely, parseDateSafely } from "./validator.ts";
import crypto from "crypto";

export interface DebtorTransactionRecord {
  postingDate: string;
  documentType: string;
  documentNumber: string | null;
  customerNumber: string;
  description: string | null;
  departmentCode: string | null;
  salespersonCode: string | null;
  amountOre: number;
  remainingAmountOre: number | null;
  creditAmountOre: number | null;
  dueDate: string | null;
  paymentMethodCode: string | null;
  sourceRowNumber: number;
  fingerprint: string;
  isValid: boolean;
  validationWarnings: string[];
}

export interface DebtorTransactionReadResult {
  records: DebtorTransactionRecord[];
  validRecords: DebtorTransactionRecord[];
  invalidRecords: DebtorTransactionRecord[];
  duplicateFingerprints: string[];
  latestPostingDate: string | null;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  duplicateCount: number;
  versionFingerprint: string;
  readAt: string;
  warnings: string[];
}

// Map column names dynamically based on Danish NAV structures
function getTransactionColumnMapper(keys: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  keys.forEach((key) => {
    const k = key.toLowerCase().trim();
    if (k === "bogføringsdato" || k === "posting date" || k === "dato" || k === "postingdate") {
      map.postingDate = key;
    } else if (k === "bilagstype" || k === "document type" || k === "type" || k === "documenttype") {
      map.documentType = key;
    } else if (k === "bilagsnr." || k === "bilagsnr" || k === "document no." || k === "document no" || k === "documentnumber") {
      map.documentNumber = key;
    } else if (k === "debitornr." || k === "debitornr" || k === "customer no." || k === "customer no" || k === "customernumber" || k === "kundenr." || k === "kundenr") {
      map.customerNumber = key;
    } else if (k === "beskrivelse" || k === "description") {
      map.description = key;
    } else if (k === "afdelingskode" || k === "department code" || k === "afdeling") {
      map.departmentCode = key;
    } else if (k === "sælgerkode" || k === "saelgerkode" || k === "salesperson code" || k === "salesperson") {
      map.salespersonCode = key;
    } else if (k === "beløb" || k === "belob" || k === "amount" || k === "beløb (rv)") {
      map.amount = key;
    } else if (k === "restbeløb" || k === "restbelob" || k === "remaining amount" || k === "restbeløb (rv)") {
      map.remainingAmount = key;
    } else if (k === "kreditbeløb" || k === "kreditbelob" || k === "credit amount" || k === "kreditbeløb (rv)") {
      map.creditAmount = key;
    } else if (k === "forfaldsdato" || k === "due date" || k === "forfald" || k === "duedate") {
      map.dueDate = key;
    } else if (k === "betalingsformskode" || k === "payment method code" || k === "betalingsform" || k === "paymentmethodcode") {
      map.paymentMethodCode = key;
    }
  });
  return map;
}

// Generate transaction fingerprint
export function generateTransactionFingerprint(tx: Partial<DebtorTransactionRecord>): string {
  const dataString = [
    tx.postingDate || "",
    tx.documentType || "",
    tx.documentNumber || "",
    tx.customerNumber || "",
    tx.amountOre || 0,
    tx.remainingAmountOre || 0,
    tx.dueDate || "",
    tx.paymentMethodCode || "",
    tx.description || "",
  ].join("|");

  return crypto.createHash("sha256").update(dataString).digest("hex");
}

export function parseAndMapTransactions(rawRows: any[]): DebtorTransactionReadResult {
  const records: DebtorTransactionRecord[] = [];
  const validRecords: DebtorTransactionRecord[] = [];
  const invalidRecords: DebtorTransactionRecord[] = [];
  const fingerprints = new Set<string>();
  const duplicateFingerprints: string[] = [];
  
  if (!rawRows || rawRows.length === 0) {
    return {
      records: [],
      validRecords: [],
      invalidRecords: [],
      duplicateFingerprints: [],
      latestPostingDate: null,
      rowCount: 0,
      validRowCount: 0,
      invalidRowCount: 0,
      duplicateCount: 0,
      versionFingerprint: "empty",
      readAt: new Date().toISOString(),
      warnings: ["Ingen transaktioner fundet i SaldoPosterRAW."],
    };
  }

  const keys = Object.keys(rawRows[0]);
  const colMap = getTransactionColumnMapper(keys);

  rawRows.forEach((raw, idx) => {
    const warnings: string[] = [];
    const sourceRowNumber = idx + 2; // +2 for Excel 1-based indexing and header row

    const postingDateRaw = colMap.postingDate ? raw[colMap.postingDate] : undefined;
    const postingDate = parseDateSafely(postingDateRaw);
    if (!postingDate) {
      warnings.push("Ugyldig eller manglende bogføringsdato.");
    }

    const documentType = String(colMap.documentType ? raw[colMap.documentType] || "" : "").trim();
    if (!documentType) {
      warnings.push("Mangler bilagstype.");
    }

    const documentNumber = colMap.documentNumber ? String(raw[colMap.documentNumber] || "").trim() : null;
    
    // customerNumber normalisation (preserving leading zeros, trim, string)
    let customerNumber = colMap.customerNumber ? String(raw[colMap.customerNumber] || "").trim() : "";
    if (!customerNumber) {
      warnings.push("Mangler debitornummer.");
    }

    const description = colMap.description ? String(raw[colMap.description] || "").trim() : null;
    const departmentCode = colMap.departmentCode ? String(raw[colMap.departmentCode] || "").trim() : null;
    const salespersonCode = colMap.salespersonCode ? String(raw[colMap.salespersonCode] || "").trim() : null;

    // Numerical parsing - convert to integer øre
    const rawAmt = colMap.amount ? raw[colMap.amount] : 0;
    const amount = parseNumberSafely(rawAmt);
    const amountOre = Math.round(amount * 100);

    const rawRemaining = colMap.remainingAmount ? raw[colMap.remainingAmount] : null;
    const remainingAmountOre = rawRemaining !== null && rawRemaining !== undefined 
      ? Math.round(parseNumberSafely(rawRemaining) * 100) 
      : null;

    const rawCredit = colMap.creditAmount ? raw[colMap.creditAmount] : null;
    const creditAmountOre = rawCredit !== null && rawCredit !== undefined 
      ? Math.round(parseNumberSafely(rawCredit) * 100) 
      : null;

    const dueDateRaw = colMap.dueDate ? raw[colMap.dueDate] : undefined;
    const dueDate = parseDateSafely(dueDateRaw);

    const paymentMethodCode = colMap.paymentMethodCode ? String(raw[colMap.paymentMethodCode] || "").trim() : null;

    const tx: Partial<DebtorTransactionRecord> = {
      postingDate,
      documentType,
      documentNumber,
      customerNumber,
      description,
      departmentCode,
      salespersonCode,
      amountOre,
      remainingAmountOre,
      creditAmountOre,
      dueDate,
      paymentMethodCode,
      sourceRowNumber,
    };

    const fingerprint = generateTransactionFingerprint(tx);
    const isValid = warnings.length === 0;

    const record: DebtorTransactionRecord = {
      ...(tx as DebtorTransactionRecord),
      fingerprint,
      isValid,
      validationWarnings: warnings,
    };

    records.push(record);

    if (fingerprints.has(fingerprint)) {
      duplicateFingerprints.push(fingerprint);
    } else {
      fingerprints.add(fingerprint);
    }

    if (isValid) {
      validRecords.push(record);
    } else {
      invalidRecords.push(record);
    }
  });

  // Calculate latest posting date
  let latestPostingDate: string | null = null;
  validRecords.forEach((r) => {
    if (!latestPostingDate || r.postingDate > latestPostingDate) {
      latestPostingDate = r.postingDate;
    }
  });

  // Generate a version fingerprint
  const versionFingerprint = crypto
    .createHash("md5")
    .update(`${records.length}|${latestPostingDate || ""}`)
    .digest("hex");

  const readAt = new Date().toISOString();

  // Deduplicate records list for calculations
  const seenFp = new Set<string>();
  const deduplicatedValid = validRecords.filter((r) => {
    if (seenFp.has(r.fingerprint)) return false;
    seenFp.add(r.fingerprint);
    return true;
  });

  return {
    records,
    validRecords: deduplicatedValid,
    invalidRecords,
    duplicateFingerprints,
    latestPostingDate,
    rowCount: records.length,
    validRowCount: validRecords.length,
    invalidRowCount: invalidRecords.length,
    duplicateCount: duplicateFingerprints.length,
    versionFingerprint,
    readAt,
    warnings: duplicateFingerprints.length > 0 
      ? [`Fandt ${duplicateFingerprints.length} duplikerede rækker i SaldoPosterRAW.`] 
      : [],
  };
}
