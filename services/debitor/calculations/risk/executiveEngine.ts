import { CustomerViewModel } from "../kpiEngine.ts";
import { CustomerRiskResult, RiskLevel, CollectionStatus } from "./riskEngine.ts";
import { DebtorAction } from "../../storage/actions.ts";

export interface DebtorAlert {
  id: string;
  type: string; // "new_overdue" | "no_payment_30_days" | "risk_increased" | "broken_promise" | "credit_stop" | "large_balance_increase" | "large_overdue_increase" | "duplicate" | "missing_credit_handling"
  priority: "Critical" | "High" | "Medium" | "Low";
  title: string;
  message: string;
  customerNo?: string;
  customerName?: string;
}

export interface ExecutiveSummary {
  // Headline KPIs
  totalExposure: number;
  totalOverdue: number;
  totalCredit: number;
  averageRiskScore: number;
  criticalCustomersCount: number;
  highRiskCustomersCount: number;
  newOverdueTotal: number;
  resolvedOverdueTotal: number;
  payments14DaysTotal: number;
  collectionRequiredCount: number;
  legalCandidatesCount: number;
  creditStopsCount: number;
  paymentPromisesCount: number;
  averageDaysSincePayment: number;
  customersWithoutPurchaseCount: number;
  customersWithoutPaymentCount: number;

  // Pipelines & Collections
  collectionPipeline: {
    needsCall: number;
    needsReminder: number;
    needsAgreement: number;
    needsCollection: number;
    legal: number;
    completed: number;
  };

  actionSummary: {
    open: number;
    completed: number;
    overdue: number;
    promised: number;
    cancelled: number;
  };

  paymentPromiseKPI: {
    openPromises: number;
    brokenPromises: number;
    completedPromises: number;
  };

  // Lists
  topExposureList: { customerNo: string; name: string; balance: number; overdue: number }[];
  topOverdueList: { customerNo: string; name: string; overdue: number; riskScore: number }[];
  largestBalanceIncrease: { customerNo: string; name: string; increase: number }[];
  largestBalanceReduction: { customerNo: string; name: string; reduction: number }[];
  topRiskList: { customerNo: string; name: string; riskScore: number; riskLevel: RiskLevel }[];
  topImprovementList: { customerNo: string; name: string; improvement: number }[]; // highest reduction in risk score compared to previous snapshot

  // Alerts
  alerts: DebtorAlert[];
  warnings: string[];
}

/**
 * Main Service: Calculate executive KPIs, collections metrics, pipeline and alerts
 */
export function calculateExecutiveRisk(
  customers: CustomerViewModel[],
  riskResults: CustomerRiskResult[],
  previousRiskResults: CustomerRiskResult[],
  actions: DebtorAction[]
): ExecutiveSummary {
  let totalExposure = 0;
  let totalOverdue = 0;
  let totalCredit = 0;
  let sumRiskScore = 0;
  let positiveBalanceCount = 0;
  let criticalCustomersCount = 0;
  let highRiskCustomersCount = 0;
  let newOverdueTotal = 0;
  let resolvedOverdueTotal = 0;
  let payments14DaysTotal = 0;
  let collectionRequiredCount = 0;
  let legalCandidatesCount = 0;
  let creditStopsCount = 0;
  let paymentPromisesCount = 0;
  let sumDaysSincePayment = 0;
  let daysSincePaymentCount = 0;
  let customersWithoutPurchaseCount = 0;
  let customersWithoutPaymentCount = 0;

  // Pipeline counters
  let needsCallCount = 0;
  let needsReminderCount = 0;
  let needsAgreementCount = 0;
  let needsCollectionCount = 0;
  let legalCount = 0;
  let completedCount = 0;

  // Map of customer risk scores for previous snapshot
  const prevRiskMap = new Map<string, CustomerRiskResult>();
  previousRiskResults.forEach((r) => prevRiskMap.set(r.customerNo, r));

  const alerts: DebtorAlert[] = [];
  const warnings: string[] = [];

  // Check duplicate customers (same name, different customer number)
  const nameMap = new Map<string, string[]>();
  customers.forEach((c) => {
    const cleanName = c.customerName.toLowerCase().trim();
    if (!nameMap.has(cleanName)) {
      nameMap.set(cleanName, []);
    }
    nameMap.get(cleanName)!.push(c.customerNo);
  });

  nameMap.forEach((nos, name) => {
    if (nos.length > 1) {
      alerts.push({
        id: `dup-${nos.join("-")}`,
        type: "duplicate",
        priority: "Low",
        title: "Kunde dublet fundet",
        message: `Kundenavnet "${name}" findes ${nos.length} gange med forskellige kundenumre: ${nos.join(", ")}`,
      });
    }
  });

  // Risk results details mapping
  riskResults.forEach((r) => {
    const cust = customers.find((c) => c.customerNo === r.customerNo);
    if (!cust) return;

    if (cust.balance > 0) {
      totalExposure += cust.balance;
      sumRiskScore += r.riskScore;
      positiveBalanceCount++;
    } else if (cust.balance < 0) {
      totalCredit += Math.abs(cust.balance);
    }

    if (cust.overdue > 0) {
      totalOverdue += cust.overdue;
    }

    if (r.riskLevel === RiskLevel.Critical || r.riskLevel === RiskLevel.VeryHigh) {
      criticalCustomersCount++;
    } else if (r.riskLevel === RiskLevel.High) {
      highRiskCustomersCount++;
    }

    if (cust.newOverdue !== null) {
      newOverdueTotal += cust.newOverdue;
    }
    if (cust.resolvedOverdue !== null) {
      resolvedOverdueTotal += cust.resolvedOverdue;
    }

    payments14DaysTotal += cust.payment14Days;

    if (r.collectionStatus !== "Nothing Required") {
      collectionRequiredCount++;
    }

    if (r.collectionStatus === "Needs Legal") {
      legalCandidatesCount++;
      legalCount++;
    } else if (r.collectionStatus === "Needs Call") {
      needsCallCount++;
    } else if (r.collectionStatus === "Needs Reminder") {
      needsReminderCount++;
    } else if (r.collectionStatus === "Needs Payment Agreement") {
      needsAgreementCount++;
    } else if (r.collectionStatus === "Needs Collection") {
      needsCollectionCount++;
    }

    const chLower = cust.creditHandling.toLowerCase().trim();
    if (chLower.includes("stop") || chLower.includes("kreditstop")) {
      creditStopsCount++;
    }

    if (r.hasActivePromise) {
      paymentPromisesCount++;
    }

    if (cust.daysSincePayment !== null) {
      sumDaysSincePayment += cust.daysSincePayment;
      daysSincePaymentCount++;
    }

    if (cust.riskInputs.noPurchase14Days) {
      customersWithoutPurchaseCount++;
    }

    if (cust.balance > 0 && cust.payment14Days === 0) {
      customersWithoutPaymentCount++;
    }

    // --- ALERT GENERATION ENGINE ---

    // 1. Credit Stop
    if (chLower.includes("stop") || chLower.includes("kreditstop")) {
      alerts.push({
        id: `alert-cs-${r.customerNo}`,
        type: "credit_stop",
        priority: "Critical",
        title: "Kreditstop Aktivt",
        message: `Kreditstop er aktivt for kunden ${cust.customerName} (${r.customerNo}).`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    // 2. Missing Credit Handling setup
    if (!cust.creditHandling || chLower === "") {
      alerts.push({
        id: `alert-mch-${r.customerNo}`,
        type: "missing_credit_handling",
        priority: "Low",
        title: "Mangler kreditstyringskode",
        message: `Kreditstyringsfeltet er tomt for kunden ${cust.customerName}.`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    // 3. Broken Promise
    if (r.hasBrokenPromise) {
      alerts.push({
        id: `alert-bp-${r.customerNo}`,
        type: "broken_promise",
        priority: "Critical",
        title: "Brudt betalingsløfte",
        message: `Kunden ${cust.customerName} har ikke overholdt sit lovede betalingstilsagn.`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    // 4. No payment 30 days
    if (cust.balance > 0 && cust.daysSincePayment !== null && cust.daysSincePayment > 30) {
      alerts.push({
        id: `alert-np30-${r.customerNo}`,
        type: "no_payment_30_days",
        priority: "High",
        title: "Ingen indbetalinger i 30+ dage",
        message: `Kunden ${cust.customerName} har en udestående saldo på ${Math.round(cust.balance).toLocaleString("da-DK")} DKK og har ikke betalt i ${cust.daysSincePayment} dage.`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    // 5. Large balance/overdue increase compared to previous
    if (cust.balanceDelta7 && cust.balanceDelta7 > 50000) {
      alerts.push({
        id: `alert-lbi-${r.customerNo}`,
        type: "large_balance_increase",
        priority: "Medium",
        title: "Stor saldoforøgelse (7 dage)",
        message: `Kundesaldoen er øget med ${Math.round(cust.balanceDelta7).toLocaleString("da-DK")} DKK på en uge.`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    if (cust.newOverdue && cust.newOverdue > 20000) {
      alerts.push({
        id: `alert-loi-${r.customerNo}`,
        type: "large_overdue_increase",
        priority: "High",
        title: "Stort ryk i overforfalden saldo",
        message: `Udestående overforfaldent beløb er øget med ${Math.round(cust.newOverdue).toLocaleString("da-DK")} DKK.`,
        customerNo: r.customerNo,
        customerName: cust.customerName,
      });
    }

    // 6. Risk Increased by more than 15 points
    const prevRisk = prevRiskMap.get(r.customerNo);
    if (prevRisk) {
      const riskDiff = r.riskScore - prevRisk.riskScore;
      if (riskDiff >= 15) {
        alerts.push({
          id: `alert-ri-${r.customerNo}`,
          type: "risk_increased",
          priority: "High",
          title: "Risikoscore markant forøget",
          message: `Risikoen for kunden er steget med +${riskDiff} point i forhold til sidste uges måling.`,
          customerNo: r.customerNo,
          customerName: cust.customerName,
        });
      }
    }
  });

  const averageRiskScore = positiveBalanceCount > 0 ? sumRiskScore / positiveBalanceCount : 0;
  const averageDaysSincePayment = daysSincePaymentCount > 0 ? sumDaysSincePayment / daysSincePaymentCount : 0;

  // --- Pipeline, Action & Promise stats ---
  const completedActions = actions.filter((a) => a.status === "completed");
  const openActionsTotal = actions.filter((a) => a.status !== "completed" && a.status !== "cancelled");
  const overdueActions = openActionsTotal.filter((a) => a.dueDate && a.dueDate < new Date().toISOString().split("T")[0]);
  const promiseActions = actions.filter((a) => a.type === "promise");

  completedCount = completedActions.length;

  const actionSummary = {
    open: openActionsTotal.length,
    completed: completedActions.length,
    overdue: overdueActions.length,
    promised: actions.filter((a) => a.type === "promise" && a.status !== "completed" && a.status !== "cancelled").length,
    cancelled: actions.filter((a) => a.status === "cancelled").length,
  };

  const paymentPromiseKPI = {
    openPromises: promiseActions.filter((a) => a.status !== "completed" && a.status !== "cancelled" && (!a.dueDate || a.dueDate >= new Date().toISOString().split("T")[0])).length,
    brokenPromises: promiseActions.filter((a) => a.status !== "completed" && a.status !== "cancelled" && a.dueDate && a.dueDate < new Date().toISOString().split("T")[0]).length,
    completedPromises: promiseActions.filter((a) => a.status === "completed").length,
  };

  // --- Sort & Limit Lists ---
  const topExposureList = [...customers]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)
    .map((c) => ({ customerNo: c.customerNo, name: c.customerName, balance: c.balance, overdue: c.overdue }));

  const topOverdueList = [...customers]
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 10)
    .map((c) => {
      const rr = riskResults.find((r) => r.customerNo === c.customerNo);
      return { customerNo: c.customerNo, name: c.customerName, overdue: c.overdue, riskScore: rr ? rr.riskScore : 0 };
    });

  const largestBalanceIncrease = [...customers]
    .filter((c) => c.balanceDelta7 !== null && c.balanceDelta7 > 0)
    .sort((a, b) => (b.balanceDelta7 || 0) - (a.balanceDelta7 || 0))
    .slice(0, 10)
    .map((c) => ({ customerNo: c.customerNo, name: c.customerName, increase: c.balanceDelta7 || 0 }));

  const largestBalanceReduction = [...customers]
    .filter((c) => c.balanceDelta7 !== null && c.balanceDelta7 < 0)
    .sort((a, b) => (a.balanceDelta7 || 0) - (b.balanceDelta7 || 0))
    .slice(0, 10)
    .map((c) => ({ customerNo: c.customerNo, name: c.customerName, reduction: Math.abs(c.balanceDelta7 || 0) }));

  const topRiskList = [...riskResults]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20)
    .map((r) => ({ customerNo: r.customerNo, name: r.customerName, riskScore: r.riskScore, riskLevel: r.riskLevel }));

  const topImprovementList = [...riskResults]
    .map((r) => {
      const prev = prevRiskMap.get(r.customerNo);
      const improvement = prev ? prev.riskScore - r.riskScore : 0;
      return { customerNo: r.customerNo, name: r.customerName, improvement };
    })
    .filter((x) => x.improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 20);

  // General warning system message
  if (paymentPromiseKPI.brokenPromises > 0) {
    warnings.push(`Der er ${paymentPromiseKPI.brokenPromises} uafklarede brudte betalingsløfter.`);
  }
  if (creditStopsCount > 0) {
    warnings.push(`Der er i øjeblikket ${creditStopsCount} aktive kreditstop i porteføljen.`);
  }

  return {
    totalExposure,
    totalOverdue,
    totalCredit,
    averageRiskScore,
    criticalCustomersCount,
    highRiskCustomersCount,
    newOverdueTotal,
    resolvedOverdueTotal,
    payments14DaysTotal,
    collectionRequiredCount,
    legalCandidatesCount,
    creditStopsCount,
    paymentPromisesCount,
    averageDaysSincePayment,
    customersWithoutPurchaseCount,
    customersWithoutPaymentCount,

    collectionPipeline: {
      needsCall: needsCallCount,
      needsReminder: needsReminderCount,
      needsAgreement: needsAgreementCount,
      needsCollection: needsCollectionCount,
      legal: legalCount,
      completed: completedCount,
    },

    actionSummary,
    paymentPromiseKPI,

    topExposureList,
    topOverdueList,
    largestBalanceIncrease,
    largestBalanceReduction,
    topRiskList,
    topImprovementList,

    alerts,
    warnings,
  };
}
