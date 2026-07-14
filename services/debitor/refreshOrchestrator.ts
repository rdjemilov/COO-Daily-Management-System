import { DebitorGoogleSheetsService } from "./google/sheets.ts";
import { DebitorRawRow } from "../../types/debitor/index.ts";
import { ImportMetadata } from "../../src/shared/types.ts";
import { parseAndMapTransactions, DebtorTransactionReadResult } from "./import/transactions.ts";
import { DebtorAction, DebtorActionEngine } from "./storage/actions.ts";
import { calculateDebtorKPIs, KPIEngineResult } from "./calculations/index.ts";
import { DebitorCache } from "./storage/cache.ts";
import {
  DebitorSettings,
  DebitorSettingsService,
  CustomerRiskResult,
  ExecutiveSummary,
  calculateCustomerRisk,
  calculateExecutiveRisk
} from "./calculations/risk/index.ts";

export interface RefreshDebitorDataInput {
  snapshotDate?: string;
  force?: boolean;
}

export interface RefreshDebitorDataResult {
  snapshotMetadata: ImportMetadata | null;
  snapshotRecords: DebitorRawRow[];
  transactionResult: DebtorTransactionReadResult;
  actions: DebtorAction[];
  dictionariesVersion: string;
  refreshedAt: string;
  warnings: string[];
  kpis: KPIEngineResult;
  riskResults: CustomerRiskResult[];
  executiveSummary: ExecutiveSummary;
  settings: DebitorSettings;
}

export class HistoricalSnapshotResolver {
  // List all unique business dates with successful imports, sorted descending
  public static async listSuccessfulSnapshotDates(): Promise<string[]> {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const successImports = history.filter((m) => m.importStatus === "success");
    return Array.from(new Set(successImports.map((m) => m.businessDate))).sort((a, b) => b.localeCompare(a));
  }

  // Get active snapshot metadata on or before a given date
  public static async getLatestSnapshotOnOrBefore(date: string): Promise<ImportMetadata | null> {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const successImports = history
      .filter((m) => m.importStatus === "success" && m.businessDate <= date)
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    return successImports[0] || null;
  }

  // Get active snapshot version on a given date
  public static async getActiveSnapshotVersion(date: string): Promise<string | null> {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const active = history.find((m) => m.businessDate === date && m.importStatus === "success");
    return active ? active.importId : null;
  }

  // Get snapshot rows by business date
  public static async getSnapshotByBusinessDate(date: string): Promise<{ metadata: ImportMetadata | null; rows: DebitorRawRow[] }> {
    const history = await DebitorGoogleSheetsService.getImportHistory();
    const active = history.find((m) => m.businessDate === date && m.importStatus === "success");
    if (!active) {
      return { metadata: null, rows: [] };
    }
    const rows = await DebitorGoogleSheetsService.getWorksheetData(active.worksheetName);
    return { metadata: active, rows };
  }

  // Get the latest successful snapshot available
  public static async getLatestSuccessfulSnapshot(): Promise<{ metadata: ImportMetadata | null; rows: DebitorRawRow[] }> {
    const dates = await this.listSuccessfulSnapshotDates();
    if (dates.length === 0) {
      return { metadata: null, rows: [] };
    }
    return this.getSnapshotByBusinessDate(dates[0]);
  }

  /**
   * Section 3: Get comparison snapshot based on the 7-day rule:
   * If snapshot date is 2026-07-15, comparison target is 2026-07-08.
   * If no snapshot exists exactly 7 days earlier, find the latest available snapshot before or on 2026-07-08.
   * Never compare with future snapshots.
   */
  public static async getComparisonSnapshot(selectedDate: string): Promise<{ metadata: ImportMetadata | null; rows: DebitorRawRow[] }> {
    const dates = await this.listSuccessfulSnapshotDates();
    
    // Calculate target date (7 days earlier)
    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 7);
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const targetDateStr = `${y}-${m}-${d}`;

    // Find latest available snapshot <= targetDateStr AND < selectedDate
    const candidateDates = dates.filter((d) => d <= targetDateStr && d < selectedDate);
    if (candidateDates.length === 0) {
      return { metadata: null, rows: [] };
    }

    const sortedCandidates = [...candidateDates].sort((a, b) => b.localeCompare(a));
    const bestMatchDate = sortedCandidates[0];

    return this.getSnapshotByBusinessDate(bestMatchDate);
  }

  // Deprecated: Get the available snapshot prior to a given date (kept for backwards compatibility if needed)
  public static async getPreviousAvailableSnapshot(date: string): Promise<{ metadata: ImportMetadata | null; rows: DebitorRawRow[] }> {
    return this.getComparisonSnapshot(date);
  }
}

export class DebitorRefreshOrchestrator {
  /**
   * Orchestrates the reading, validating, joining and caching of all Debitor data
   */
  public static async refresh(input: RefreshDebitorDataInput = {}): Promise<RefreshDebitorDataResult> {
    // 1. Resolve which snapshot business date to load
    let targetDate = input.snapshotDate;
    let metadata: ImportMetadata | null = null;
    let snapshotRecords: DebitorRawRow[] = [];

    if (targetDate) {
      const result = await HistoricalSnapshotResolver.getSnapshotByBusinessDate(targetDate);
      metadata = result.metadata;
      snapshotRecords = result.rows;
    } else {
      const result = await HistoricalSnapshotResolver.getLatestSuccessfulSnapshot();
      metadata = result.metadata;
      snapshotRecords = result.rows;
      if (metadata) {
        targetDate = metadata.businessDate;
      }
    }

    // 2. Load latest SaldoPosterRAW transactions from Google Sheets
    const rawTxRows = await DebitorGoogleSheetsService.getSaldoPosterRAW();
    const transactionResult = parseAndMapTransactions(rawTxRows);

    // 3. Load latest Follow-up Actions from Google Sheets
    const actions = await DebitorGoogleSheetsService.loadActionsFromGoogle();

    // 4. Collect any cross-dataset warnings (Data Quality warnings)
    const warnings: string[] = [];
    if (transactionResult.warnings) {
      warnings.push(...transactionResult.warnings);
    }

    // Join check: find transactions whose customer number does not exist in the active snapshot
    const snapshotCustomerNos = new Set(snapshotRecords.map((r) => r.customerNumber.trim()));
    const unmatchedCustomers = new Set<string>();

    transactionResult.validRecords.forEach((tx) => {
      if (tx.customerNumber && !snapshotCustomerNos.has(tx.customerNumber.trim())) {
        unmatchedCustomers.add(tx.customerNumber);
      }
    });

    if (unmatchedCustomers.size > 0 && snapshotRecords.length > 0) {
      warnings.push(
        `Fandt transaktioner for ${unmatchedCustomers.size} debitorer, der ikke findes i det valgte snapshot.`
      );
    }

    // Resolve comparison snapshot
    let prevMetadata: ImportMetadata | null = null;
    let previousRecords: DebitorRawRow[] = [];
    if (targetDate) {
      const compResult = await HistoricalSnapshotResolver.getComparisonSnapshot(targetDate);
      prevMetadata = compResult.metadata;
      previousRecords = compResult.rows;
    }

    // 5. Calculate KPIs with versions
    const snapshotVersion = metadata?.importId || "none";
    const transactionVersion = transactionResult.versionFingerprint || "none";
    
    // Compute Action Version Fingerprint
    const latestActionUpdate = actions.reduce((max, a) => a.updatedAt > max ? a.updatedAt : max, "");
    const actionVersion = `${actions.length}|${latestActionUpdate}`;

    const kpis = calculateDebtorKPIs(
      snapshotRecords,
      previousRecords,
      transactionResult.validRecords,
      actions,
      targetDate || new Date().toISOString().split("T")[0],
      prevMetadata?.businessDate || null,
      { snapshotVersion, transactionVersion, actionVersion }
    );

    // 6. Risk Engine & Executive calculations
    const settings = await DebitorSettingsService.loadSettings();
    const riskCacheKey = `risk_summary_${snapshotVersion}_${transactionVersion}_${actionVersion}`;
    
    let cachedRisk = DebitorCache.getRisk(riskCacheKey);
    let riskResults: CustomerRiskResult[] = [];
    let executiveSummary: ExecutiveSummary;

    if (cachedRisk) {
      riskResults = cachedRisk.riskResults;
      executiveSummary = cachedRisk.executiveSummary;
    } else {
      // Resolve previous risk results to enable trend and delta calculation
      let previousRiskResults: CustomerRiskResult[] = [];
      if (prevMetadata && previousRecords.length > 0) {
        // Run KPI calculations for previous snapshot
        const prevKPIs = calculateDebtorKPIs(
          previousRecords,
          [],
          transactionResult.validRecords,
          actions,
          prevMetadata.businessDate,
          null,
          { snapshotVersion: prevMetadata.importId, transactionVersion: "none", actionVersion }
        );
        
        previousRiskResults = prevKPIs.customers.map((c) =>
          calculateCustomerRisk(
            c,
            null,
            actions,
            prevMetadata!.businessDate,
            settings
          )
        );
      }

      // Calculate current risk results
      riskResults = kpis.customers.map((c) => {
        // Find previous record balance/overdue for trend comparison
        const prevRec = previousRecords.find((r) => r.customerNumber.trim() === c.customerNo.trim());
        const previousSnapshot = prevRec ? { balance: prevRec.balance, overdue: prevRec.overdueBalance } : null;
        
        return calculateCustomerRisk(
          c,
          previousSnapshot,
          actions,
          targetDate || new Date().toISOString().split("T")[0],
          settings
        );
      });

      // Calculate executive portfolio summary
      executiveSummary = calculateExecutiveRisk(
        kpis.customers,
        riskResults,
        previousRiskResults,
        actions
      );

      // Save to independent Cache
      DebitorCache.setRisk(riskCacheKey, { riskResults, executiveSummary });
    }

    // Return the complete orchestrated result
    return {
      snapshotMetadata: metadata,
      snapshotRecords,
      transactionResult,
      actions,
      dictionariesVersion: "1.0.0",
      refreshedAt: new Date().toISOString(),
      warnings,
      kpis,
      riskResults,
      executiveSummary,
      settings,
    };
  }
}
