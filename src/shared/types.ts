export interface SalesRawRow {
  postingDate: string; // YYYY-MM-DD
  entryType: string;
  documentType: string;
  documentNumber: string;
  itemNumber: string;
  description: string;
  locationCode: string;
  quantity: number;
  invoicedQuantity: number;
  remainingQuantity: number;
  salesAmount: number;
  costAmount: number;
  sourceType: string;
  customerNumber: string;
  customerName: string;
  departmentCode: string;
  employeeName: string;
}

export interface ImportMetadata {
  importId: string;
  businessModule: string; // e.g. "Sales"
  businessDate: string; // YYYY-MM-DD
  worksheetName: string; // YYYY-MM-DD or YYYY-MM-DD_vN
  uploadedFileName: string;
  originalFileSize: number;
  importedRowCount: number;
  importedColumnCount: number;
  importedAt: string; // ISO timestamp
  uploadedBy: string;
  importStatus: "success" | "failed";
  importVersion: number;
  fileHash: string;
  templateVersion: string;
  errorMessage?: string;
  replacedImportId?: string;
  applicationVersion: string;
  tilbudUge?: boolean;
}

export interface SalesFilter {
  businessDate: string; // Date of the worksheet
  startDate: string | null;
  endDate: string | null;
  location: string[];
  documentType: string[];
  customerQuery: string; // Can match number or name
  productQuery: string;  // Can match number or description
}

export interface KPIMetric {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  comparisonValue?: number;
  formattedComparisonValue?: string;
  diffAbsolute?: number;
  diffPercentage?: number;
  direction: "up" | "down" | "neutral";
  status: "positive" | "negative" | "neutral"; // higher sales positive, higher loss negative, etc.
  tooltip: string;
}

export interface CustomerSummary {
  customerNumber: string;
  customerName: string;
  salesAmount: number;
  costAmount: number;
  grossProfit: number;
  grossMargin: number; // percentage
  invoiceCount: number;
  averageInvoiceValue: number;
  shareOfTotalSales: number; // percentage
}

export interface ProductSummary {
  itemNumber: string;
  description: string;
  quantity: number;
  salesAmount: number;
  costAmount: number;
  grossProfit: number;
  grossMargin: number; // percentage
  invoiceCount: number;
  customerCount: number;
  shareOfTotalSales: number; // percentage
}

export interface SalesWithoutProfitRow {
  date: string;
  documentType: string;
  documentNumber: string;
  customerNumber: string;
  customerName: string;
  itemNumber: string;
  description: string;
  locationCode: string;
  quantity: number;
  salesAmount: number;
  costAmount: number;
  grossProfit: number;
  lossAmount: number; // positive representation of loss
  grossMargin: number;
  severity: "critical" | "loss" | "zero";
}

export interface ValidationSummary {
  fileName: string;
  detectedWorksheet: string;
  detectedBusinessDate: string;
  dateRange: { min: string; max: string };
  rowCount: number;
  columnCount: number;
  requiredColumnsFound: string[];
  missingColumns: string[];
  unknownColumns: string[];
  emptyRequiredFieldsCount: number;
  invalidDatesCount: number;
  invalidNumbersCount: number;
  duplicateRowCount: number;
  isValid: boolean;
  validationStatus: "valid" | "warning" | "invalid";
}
