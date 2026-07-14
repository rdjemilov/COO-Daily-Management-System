import { DebitorRawRow } from "../../../types/debitor/index.ts";
import { DebtorTransactionRecord } from "../import/transactions.ts";
import { DebtorAction } from "../storage/actions.ts";

export interface RiskInputs {
  overdueShare: number | null;
  daysSinceLastPayment: number | null;
  noPayment14Days: boolean;
  noPurchase14Days: boolean;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface CustomerViewModel {
  customerNo: string;
  customerName: string;
  balance: number;
  overdue: number;
  paymentTerms: string;
  lastInvoice: string | null;
  lastPayment: string | null;
  daysSincePayment: number | null;
  payment14Days: number;
  balanceDelta7: number | null;
  newOverdue: number | null;
  resolvedOverdue: number | null;
  creditHandling: string;
  location: string;
  salesperson: string;
  seller: string;
  latestAction: DebtorAction | null;
  riskInputs: RiskInputs;
  notesSummary: string;
}

export interface DashboardKPISummary {
  totalBalance: number;          // Total Positive Balance
  totalOverdue: number;          // Total Positive Overdue
  creditBalance: number;          // Total Credit Balance (absolute value of negative balances)
  netBalance: number;             // Total Net Balance (signed)
  debtorsWithBalanceCount: number;
  debtorsWithOverdueCount: number;
  payments14DaysCount: number;    // Sum of Payment14Days across customers
  customersWithoutPaymentCount: number;
  customersWithoutPurchaseCount: number;
  newOverdueCount: number;        // Sum of NewOverdue
  resolvedOverdueCount: number;   // Sum of ResolvedOverdue
  customersWithIncreasedBalanceCount: number;
  customersWithReducedBalanceCount: number;
  pbsCount: number;               // Count of overdue customers starting with PBS / PBSNET
  pbsOverdueAmount: number;       // Sum of overdue for PBS customers
  underThresholdCount: number;    // Count of positive balances under threshold
  averageBalance: number;
  averageOverdue: number;
  top10Balances: CustomerViewModel[];
  top10Overdue: CustomerViewModel[];
}

export interface KPIEngineResult {
  currentSnapshotDate: string;
  comparisonSnapshotDate: string | null;
  customers: CustomerViewModel[];
  summary: DashboardKPISummary;
}

// Memory Cache structure as requested in Section 40
interface KPICacheEntry {
  cacheKey: string;
  result: KPIEngineResult;
}

let kpiCache: KPICacheEntry | null = null;

/**
 * Safe helper to subtract days from a YYYY-MM-DD date string
 */
export function getDaysAgo(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Safe helper to calculate positive days difference between two YYYY-MM-DD date strings
 */
export function getDaysBetween(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split("-").map(Number);
  const [y2, m2, d2] = dateStr2.split("-").map(Number);
  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);
  const diffTime = date1.getTime() - date2.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if document type is a payment (case insensitive)
 */
export function isPaymentDocument(docType: string): boolean {
  const normalized = docType.toLowerCase().trim();
  return normalized === "betaling" || normalized === "payment" || normalized === "repayment";
}

/**
 * Calculate risk inputs and score for a customer
 */
export function calculateRiskInputs(
  balance: number,
  overdue: number,
  daysSincePayment: number | null,
  noPayment14Days: boolean,
  noPurchase14Days: boolean
): RiskInputs {
  if (balance <= 0) {
    return {
      overdueShare: null,
      daysSinceLastPayment: daysSincePayment,
      noPayment14Days,
      noPurchase14Days,
      riskScore: 0,
      riskLevel: "low",
    };
  }

  const overdueShare = overdue / balance;
  
  // Scoring logic:
  // Overdue share: up to 50 points
  let score = overdueShare * 50;

  // Days since last payment: up to 30 points
  if (daysSincePayment !== null) {
    if (daysSincePayment > 90) {
      score += 30;
    } else if (daysSincePayment > 60) {
      score += 20;
    } else if (daysSincePayment > 30) {
      score += 10;
    }
  } else {
    // No payment registered is considered risky
    score += 15;
  }

  // Behavior metrics: up to 20 points
  if (noPayment14Days) score += 10;
  if (noPurchase14Days) score += 10;

  score = Math.min(Math.max(Math.round(score), 0), 100);

  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (score >= 80) {
    riskLevel = "critical";
  } else if (score >= 50) {
    riskLevel = "high";
  } else if (score >= 20) {
    riskLevel = "medium";
  }

  return {
    overdueShare,
    daysSinceLastPayment: daysSincePayment,
    noPayment14Days,
    noPurchase14Days,
    riskScore: score,
    riskLevel,
  };
}

/**
 * Build Payment Index (Section 38)
 * Dictionary: CustomerNumber -> Transactions[]
 */
export function buildPaymentIndex(transactions: DebtorTransactionRecord[]): Map<string, DebtorTransactionRecord[]> {
  const map = new Map<string, DebtorTransactionRecord[]>();
  transactions.forEach((tx) => {
    if (!tx.customerNumber) return;
    const key = tx.customerNumber.trim();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(tx);
  });
  return map;
}

/**
 * Build Snapshot Index (Section 39)
 * Dictionary: CustomerNumber -> SnapshotRecord
 */
export function buildSnapshotIndex(rows: DebitorRawRow[]): Map<string, DebitorRawRow> {
  const map = new Map<string, DebitorRawRow>();
  rows.forEach((row) => {
    if (!row.customerNumber) return;
    map.set(row.customerNumber.trim(), row);
  });
  return map;
}

/**
 * Calculate historical changes for a single customer compared to previous snapshot
 */
export function calculateHistoricalChanges(
  current: { balance: number; overdue: number },
  previous: { balance: number; overdue: number } | null
) {
  if (!previous) {
    return {
      balanceDelta7: null,
      newOverdue: null,
      resolvedOverdue: null,
    };
  }

  const balanceDelta7Raw = current.balance - previous.balance;
  // Section 10: "Never return zero." -> If delta is 0, return null
  const balanceDelta7 = balanceDelta7Raw === 0 ? null : balanceDelta7Raw;

  const overdueDelta = current.overdue - previous.overdue;

  // Section 12: New Overdue = MAX(CurrentOverdue - PreviousOverdue, 0)
  const newOverdue = Math.max(overdueDelta, 0);

  // Section 13: Resolved Overdue = MAX(PreviousOverdue - CurrentOverdue, 0)
  const resolvedOverdue = Math.max(previous.overdue - current.overdue, 0);

  return {
    balanceDelta7,
    newOverdue,
    resolvedOverdue,
  };
}

/**
 * Calculate payment metrics for a customer based on transactions index
 */
export function calculatePaymentMetrics(
  customerNo: string,
  snapshotDate: string,
  paymentIndex: Map<string, DebtorTransactionRecord[]>
) {
  const customerTx = paymentIndex.get(customerNo.trim()) || [];
  
  // Section 6: Payment Last 14 Days
  // Filter PostingDate between SnapshotDate - 13 days and SnapshotDate inclusive
  const daysAgo13 = getDaysAgo(snapshotDate, 13);
  const paymentTx14Days = customerTx.filter((tx) => {
    return (
      isPaymentDocument(tx.documentType) &&
      tx.postingDate >= daysAgo13 &&
      tx.postingDate <= snapshotDate
    );
  });

  const payment14Days = paymentTx14Days.reduce((sum, tx) => {
    // Normalize amount: ABS(amount). In Kroner: amountOre / 100
    const amt = Math.abs(tx.amountOre) / 100;
    return sum + amt;
  }, 0);

  // Section 7: Last Payment Date
  const paymentTx = customerTx.filter((tx) => isPaymentDocument(tx.documentType));
  let lastPayment: string | null = null;
  paymentTx.forEach((tx) => {
    if (tx.postingDate && (!lastPayment || tx.postingDate > lastPayment)) {
      lastPayment = tx.postingDate;
    }
  });

  // Section 8: Days Since Last Payment
  let daysSincePayment: number | null = null;
  if (lastPayment) {
    daysSincePayment = getDaysBetween(snapshotDate, lastPayment);
  }

  return {
    payment14Days,
    lastPayment,
    daysSincePayment,
  };
}

/**
 * Core engine to calculate view models for all customers
 */
export function calculateCustomerKPIs(
  currentRows: DebitorRawRow[],
  previousRows: DebitorRawRow[],
  transactions: DebtorTransactionRecord[],
  actions: DebtorAction[],
  snapshotDate: string
): CustomerViewModel[] {
  const paymentIndex = buildPaymentIndex(transactions);
  const previousIndex = buildSnapshotIndex(previousRows);

  // Actions Index
  const actionsMap = new Map<string, DebtorAction[]>();
  actions.forEach((a) => {
    const key = a.customerNumber.trim();
    if (!actionsMap.has(key)) {
      actionsMap.set(key, []);
    }
    actionsMap.get(key)!.push(a);
  });

  return currentRows.map((row) => {
    const customerNo = row.customerNumber.trim();
    const prevRow = previousIndex.get(customerNo) || null;

    // 1. Current Balance & Overdue (Sections 4 & 5)
    const balance = row.balance;
    const overdue = row.overdueBalance;

    // 2. Payments Metrics (Sections 6, 7 & 8)
    const { payment14Days, lastPayment, daysSincePayment } = calculatePaymentMetrics(
      row.customerNumber,
      snapshotDate,
      paymentIndex
    );

    // 3. Historical Changes (Sections 10, 11, 12, 13)
    const prevData = prevRow ? { balance: prevRow.balance, overdue: prevRow.overdueBalance } : null;
    const { balanceDelta7, newOverdue, resolvedOverdue } = calculateHistoricalChanges(
      { balance, overdue },
      prevData
    );

    // 4. Activity Flags
    const noPayment14Days = balance > 0 && payment14Days === 0;
    
    let noPurchase14Days = false;
    if (balance > 0 && row.lastInvoice) {
      noPurchase14Days = getDaysBetween(snapshotDate, row.lastInvoice) > 14;
    }

    // 5. Risk Inputs (Section 1)
    const riskInputs = calculateRiskInputs(
      balance,
      overdue,
      daysSincePayment,
      noPayment14Days,
      noPurchase14Days
    );

    // 6. Latest Action and Note Summary
    const customerActions = actionsMap.get(customerNo) || [];
    let latestAction: DebtorAction | null = null;
    if (customerActions.length > 0) {
      latestAction = [...customerActions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    }

    const notesSummary = customerActions
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => `[${a.createdAt.split("T")[0]} - ${a.type}]: ${a.comment}`)
      .join("\n");

    return {
      customerNo: row.customerNumber,
      customerName: row.customerName,
      balance,
      overdue,
      paymentTerms: row.paymentTerms,
      lastInvoice: row.lastInvoice || null,
      lastPayment,
      daysSincePayment,
      payment14Days,
      balanceDelta7,
      newOverdue,
      resolvedOverdue,
      creditHandling: row.creditHandling,
      location: row.location,
      salesperson: row.salesperson,
      seller: row.seller || "Uspecificeret",
      latestAction,
      riskInputs,
      notesSummary,
    };
  });
}

/**
 * Calculate Dashboard KPIs Summary
 */
export function calculateDashboardSummary(
  customers: CustomerViewModel[],
  under50kThreshold = 50000
): DashboardKPISummary {
  let totalBalance = 0;
  let totalOverdue = 0;
  let creditBalance = 0;
  let netBalance = 0;
  let debtorsWithBalanceCount = 0;
  let debtorsWithOverdueCount = 0;
  let payments14DaysCount = 0;
  let customersWithoutPaymentCount = 0;
  let customersWithoutPurchaseCount = 0;
  let newOverdueCount = 0;
  let resolvedOverdueCount = 0;
  let customersWithIncreasedBalanceCount = 0;
  let customersWithReducedBalanceCount = 0;
  let pbsCount = 0;
  let pbsOverdueAmount = 0;
  let underThresholdCount = 0;

  customers.forEach((c) => {
    // Total Positive Balance
    if (c.balance > 0) {
      totalBalance += c.balance;
      debtorsWithBalanceCount++;
    }

    // Credit Balance (negative balances)
    if (c.balance < 0) {
      creditBalance += Math.abs(c.balance);
    }

    // Net Balance
    netBalance += c.balance;

    // Total Overdue
    if (c.overdue > 0) {
      totalOverdue += c.overdue;
      debtorsWithOverdueCount++;

      // PBS KPI (Section 32)
      const ptLower = c.paymentTerms.toLowerCase().trim();
      if (ptLower.startsWith("pbs") || ptLower.startsWith("pbsnet")) {
        pbsCount++;
        pbsOverdueAmount += c.overdue;
      }
    }

    // Payments Last 14 Days Sum
    payments14DaysCount += c.payment14Days;

    // Customers Without Payment
    if (c.balance > 0 && c.payment14Days === 0) {
      customersWithoutPaymentCount++;
    }

    // Customers Without Purchase (Section 25)
    if (c.riskInputs.noPurchase14Days) {
      customersWithoutPurchaseCount++;
    }

    // Sum New Overdue & Resolved Overdue
    if (c.newOverdue !== null) {
      newOverdueCount += c.newOverdue;
    }
    if (c.resolvedOverdue !== null) {
      resolvedOverdueCount += c.resolvedOverdue;
    }

    // Customers with Balance change
    if (c.balanceDelta7 !== null) {
      if (c.balanceDelta7 > 0) {
        customersWithIncreasedBalanceCount++;
      } else if (c.balanceDelta7 < 0) {
        customersWithReducedBalanceCount++;
      }
    }

    // Under 50k threshold (Section 34)
    if (c.balance > 0 && c.balance < under50kThreshold) {
      underThresholdCount++;
    }
  });

  // Averages
  const averageBalance = debtorsWithBalanceCount > 0 ? totalBalance / debtorsWithBalanceCount : 0;
  const averageOverdue = debtorsWithOverdueCount > 0 ? totalOverdue / debtorsWithOverdueCount : 0;

  // Top 10 lists
  const top10Balances = [...customers]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  const top10Overdue = [...customers]
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 10);

  return {
    totalBalance,
    totalOverdue,
    creditBalance,
    netBalance,
    debtorsWithBalanceCount,
    debtorsWithOverdueCount,
    payments14DaysCount,
    customersWithoutPaymentCount,
    customersWithoutPurchaseCount,
    newOverdueCount,
    resolvedOverdueCount,
    customersWithIncreasedBalanceCount,
    customersWithReducedBalanceCount,
    pbsCount,
    pbsOverdueAmount,
    underThresholdCount,
    averageBalance,
    averageOverdue,
    top10Balances,
    top10Overdue,
  };
}

/**
 * Top-level Orchestrator for calculations with KPI Cache (Section 40)
 */
export function calculateDebtorKPIs(
  currentRows: DebitorRawRow[],
  previousRows: DebitorRawRow[],
  transactions: DebtorTransactionRecord[],
  actions: DebtorAction[],
  snapshotDate: string,
  comparisonSnapshotDate: string | null,
  versions: { snapshotVersion: string; transactionVersion: string; actionVersion: string },
  under50kThreshold = 50000
): KPIEngineResult {
  const cacheKey = `${versions.snapshotVersion}|${versions.transactionVersion}|${versions.actionVersion}|${snapshotDate}|${comparisonSnapshotDate || "null"}|${under50kThreshold}`;

  // Check cache (Section 40)
  if (kpiCache && kpiCache.cacheKey === cacheKey) {
    return kpiCache.result;
  }

  // 1. Calculate Customer metrics
  const customers = calculateCustomerKPIs(
    currentRows,
    previousRows,
    transactions,
    actions,
    snapshotDate
  );

  // 2. Calculate Dashboard Summary
  const summary = calculateDashboardSummary(customers, under50kThreshold);

  const result: KPIEngineResult = {
    currentSnapshotDate: snapshotDate,
    comparisonSnapshotDate,
    customers,
    summary,
  };

  // Cache the result
  kpiCache = {
    cacheKey,
    result,
  };

  return result;
}
