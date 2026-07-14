export interface DebitorRawRow {
  customerNumber: string;
  customerName: string;
  balance: number; // Decimal value in Kroner (e.g., 1254.35)
  overdueBalance: number; // Decimal value in Kroner
  paymentTerms: string; // e.g., "Netto 14 dage"
  lastInvoice: string; // ISO date format (YYYY-MM-DD)
  creditHandling: string; // e.g., "Normal", "Spærret"
  salesperson: string; // e.g., "Rasim Beytula"
  location: string; // e.g., "HOVED", "LOK01"
  seller: string; // e.g., "Sælgerkode" or "Sælger"
}

export interface DebitorCompressedRow {
  cn: string;   // customerNumber
  cid: number;  // customerName (Customer Dictionary ID)
  sb: number;   // balance stored in øre as an integer
  ov: number;   // overdueBalance stored in øre as an integer
  pt: number;   // paymentTerms (Payment Terms Dictionary ID)
  li: string;   // lastInvoice (ISO date or integer representing days)
  ch: number;   // creditHandling (Credit Handling Dictionary ID)
  sp: number;   // salesperson (Salesperson Dictionary ID)
  lc: number;   // location (Location Dictionary ID)
  sl: number;   // seller (Seller Dictionary ID)
}

export type DictionaryCategory = 
  | "customer" 
  | "product" 
  | "location" 
  | "payment_terms" 
  | "credit_handling" 
  | "salesperson"
  | "seller";

export interface DictionaryEntry {
  category: DictionaryCategory;
  id: number;
  value: string;
}

export interface DebitorSnapshot {
  worksheetName: string; // Name of the sheet (YYYY-MM-DD)
  businessDate: string;  // YYYY-MM-DD
  importedAt: string;    // ISO timestamp
  rows: DebitorRawRow[]; // Mapped from compressed rows
}

export interface DebitorValidationSummary {
  isValid: boolean;
  fileName: string;
  rowCount: number;
  columnCount: number;
  detectedBusinessDate: string;
  validationStatus: "valid" | "warning" | "invalid";
  errors: string[];
  warnings: string[];
  missingColumns: string[];
  detectedWorksheet?: string;
  
  // Section 42 fields
  canonicalRowCount?: number;
  uniqueCustomerCount?: number;
  duplicateCustomerCount?: number;
  missingCustomerNumberCount?: number;
  missingCustomerNameCount?: number;
  invalidBalanceCount?: number;
  invalidOverdueCount?: number;
  invalidLastInvoiceDateCount?: number;
  negativeBalanceCount?: number;
  negativeOverdueCount?: number;
  missingCreditHandlingCount?: number;
  unknownColumnCount?: number;
  canImport?: boolean;
  previewRows?: any[];
}
