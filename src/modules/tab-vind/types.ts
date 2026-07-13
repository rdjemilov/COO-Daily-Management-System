export interface TabVindRawRow {
  postingDate: string; // YYYY-MM-DD
  entryType: string; // "Nedregulering", "Opregulering", etc.
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
  sourceType?: string;
  sourceNumber?: string;
  sourceName?: string;
  reasonCode: string; // Årsagskode
  sourceRowNumber: number; // 1-based index in the sheet
}

export interface TabVindNormalizedRow extends TabVindRawRow {
  normQty: number; // absolute value of quantity
  normCost: number; // absolute value of cost
}

export type TabVindMatchStatus = "Matched" | "Partially Matched" | "Ambiguous" | "Unmatched NED" | "Unmatched OP";

export type TabVindMatchMethod = 
  | "Exact Direct Match" 
  | "Same Document Group" 
  | "Linked Production Documents" 
  | "Cost-Based Conversion Match" 
  | "Partial / Ambiguous Match" 
  | "Unmatched";

export type TabVindSeverity = "Balanced" | "Low" | "Medium" | "High" | "Critical";

export interface TabVindMatchGroup {
  id: string; // Match group ID, e.g. "G-001"
  status: TabVindMatchStatus;
  method: TabVindMatchMethod;
  confidence: number; // 0 to 100
  nedRows: TabVindNormalizedRow[];
  opRows: TabVindNormalizedRow[];
  nedQuantityTotal: number;
  opQuantityTotal: number;
  quantityDifference: number; // OP - NED
  nedCostTotal: number;
  opCostTotal: number;
  costDifference: number; // OP - NED
  costDifferencePercent: number; // (ABS(OP - NED) / NED) * 100
  explanation: string;
  warnings: string[];
  severity: TabVindSeverity;
  reasonCode: string;
  locationCode: string;
  date: string;
}

export interface TabVindMatchingConfig {
  floatingPointEpsilonDkk: number;
  exactCostToleranceDkk: number;
  exactQuantityTolerance: number;
  productionCostToleranceDkk: number;
  productionCostTolerancePercent: number;
  quantityTolerancePercent: number;
  maxDocumentNumberDistance: number;
  allowCrossLocationMatching: boolean;
  automaticMatchMinimumConfidence: number;
}

export const DEFAULT_MATCHING_CONFIG: TabVindMatchingConfig = {
  floatingPointEpsilonDkk: 0.01,
  exactCostToleranceDkk: 0.50,
  exactQuantityTolerance: 0.001,
  productionCostToleranceDkk: 5.00,
  productionCostTolerancePercent: 0.10, // 0.10%
  quantityTolerancePercent: 10.0,
  maxDocumentNumberDistance: 3,
  allowCrossLocationMatching: false,
  automaticMatchMinimumConfidence: 70,
};

export interface TabVindAnalysisResult {
  fileName: string;
  fileSize: number;
  detectedBusinessDate: string;
  dateRange: { min: string; max: string };
  rowCount: number;
  nedRowCount: number;
  opRowCount: number;
  validationWarnings: string[];
  analysisStatus: "success" | "warning" | "empty";
  analysisDurationMs: number;
  groups: TabVindMatchGroup[];
  summary: {
    nedCostTotal: number;
    opCostTotal: number;
    netCostDifference: number; // OP - NED
    absoluteUnexplainedDifference: number; // Unmatched rows + partially matched diffs absolute sum
    nedQuantityTotal: number;
    opQuantityTotal: number;
    matchedGroupsCount: number;
    unmatchedNedCount: number;
    unmatchedOpCount: number;
    partiallyMatchedCount: number;
    groupMatchRate: number; // Matched groups / Total groups %
    valueMatchRate: number; // Matched NED cost / Total NED cost %
  };
  rawRows: TabVindNormalizedRow[];
}
