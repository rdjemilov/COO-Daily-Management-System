import { CustomerViewModel } from "../kpiEngine.ts";
import { DebtorAction } from "../../storage/actions.ts";
import { getDaysBetween } from "../kpiEngine.ts";
import { DebitorSettings } from "./settingsService.ts";

export enum RiskLevel {
  Low = "Low",
  Medium = "Medium",
  High = "High",
  VeryHigh = "VeryHigh",
  Critical = "Critical",
}

export enum CollectionPriority {
  Priority1 = "Priority1",
  Priority2 = "Priority2",
  Priority3 = "Priority3",
  Priority4 = "Priority4",
  Priority5 = "Priority5",
  Priority6 = "Priority6",
}

export type CollectionStatus =
  | "Needs Call"
  | "Needs Email"
  | "Needs Reminder"
  | "Needs Payment Agreement"
  | "Needs Credit Review"
  | "Needs Collection"
  | "Needs Legal"
  | "Nothing Required";

export enum CustomerStatus {
  Healthy = "Healthy",
  Monitor = "Monitor",
  Attention = "Attention",
  Critical = "Critical",
  Closed = "Closed",
  Credit = "Credit",
}

export interface CustomerRiskResult {
  customerNo: string;
  customerName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  collectionPriority: CollectionPriority;
  collectionStatus: CollectionStatus;
  recommendation: string;
  riskReasons: string[];
  balanceTrend: "Increasing" | "Stable" | "Reducing";
  overdueTrend: "Increasing" | "Stable" | "Reducing";
  paymentTrend: "Improving" | "Stable" | "Declining";
  customerStatus: CustomerStatus;
  hasActivePromise: boolean;
  hasBrokenPromise: boolean;
}

/**
 * Main Service: Calculate risk, priorities, trends, recommendations for a single customer
 */
export function calculateCustomerRisk(
  customer: CustomerViewModel,
  previousSnapshot: { balance: number; overdue: number } | null,
  actions: DebtorAction[],
  snapshotDate: string,
  settings: DebitorSettings
): CustomerRiskResult {
  const riskReasons: string[] = [];

  // --- 1. Subscore calculations ---

  // A. Overdue Factor (Largest Weight, default 35%)
  let overdueSubscore = 0;
  if (customer.overdue > 0) {
    // If we have an overdue balance, the ratio to overall balance forms the base overdue risk
    const ratio = customer.balance > 0 ? customer.overdue / customer.balance : 1;
    overdueSubscore = Math.min(ratio * 100, 100);
    riskReasons.push(`Overforfalden saldo: ${Math.round(customer.overdue).toLocaleString("da-DK")} DKK`);
  }

  // B. Balance Factor (default 15%)
  let balanceSubscore = 0;
  if (customer.balance > 0) {
    balanceSubscore = Math.min((customer.balance / settings.thresholdBalanceScale) * 100, 100);
    if (customer.balance > settings.thresholdBalanceScale * 0.5) {
      riskReasons.push(`Høj samlet eksponering: ${Math.round(customer.balance).toLocaleString("da-DK")} DKK`);
    }
  }

  // C. Payment Behaviour Factor (default 20%)
  // Split into DaysSinceLastPayment and Payment14Days reduction
  let daysSincePaymentSubscore = 100;
  if (customer.daysSincePayment !== null) {
    daysSincePaymentSubscore = Math.min((customer.daysSincePayment / settings.thresholdNoPaymentDays) * 100, 100);
    if (customer.daysSincePayment > settings.thresholdNoPaymentDays) {
      riskReasons.push(`Ingen betaling registreret i ${customer.daysSincePayment} dage`);
    }
  } else if (customer.balance > 0) {
    riskReasons.push("Ingen registreret betaling i historikken");
  }

  let payment14DaysSubscore = 100;
  if (customer.payment14Days > 0) {
    const payRatio = customer.overdue > 0 ? customer.payment14Days / customer.overdue : customer.payment14Days / customer.balance;
    payment14DaysSubscore = Math.max(0, 100 - Math.min(payRatio * 100, 100));
  }
  const paymentSubscore = (daysSincePaymentSubscore + payment14DaysSubscore) / 2;

  // D. Purchase Behaviour Factor (default 10%)
  let purchaseSubscore = 0;
  if (customer.balance > 0 && customer.lastInvoice) {
    const daysSinceInvoice = getDaysBetween(snapshotDate, customer.lastInvoice);
    if (daysSinceInvoice > 14) {
      purchaseSubscore = 100;
      riskReasons.push(`Kunde stoppet med at købe (ingen køb i ${daysSinceInvoice} dage)`);
    }
  } else if (customer.balance > 0) {
    purchaseSubscore = 50; // Neutral if no invoice found
  }

  // E. Historical Trend Factor (default 10%)
  let historySubscore = 0;
  if (previousSnapshot) {
    if (customer.overdue > previousSnapshot.overdue) {
      const diff = customer.overdue - previousSnapshot.overdue;
      historySubscore = Math.min((diff / (previousSnapshot.overdue || 1)) * 100, 100);
      riskReasons.push("Overforfalden saldo er steget i forhold til sidste uge");
    } else if (customer.resolvedOverdue && customer.resolvedOverdue > 0) {
      historySubscore = 0; // Risk reduced
    }
  } else {
    historySubscore = 50; // Neutral if no previous snapshot
  }

  // F. Open Actions Factor (default 5%)
  let actionsSubscore = 0;
  const customerActions = actions.filter((a) => a.customerNumber === customer.customerNo);
  const openActions = customerActions.filter((a) => a.status !== "completed" && a.status !== "cancelled");
  const overdueOpenActions = openActions.filter((a) => a.dueDate && a.dueDate < snapshotDate);

  if (overdueOpenActions.length > 0) {
    actionsSubscore = 100;
    riskReasons.push(`Har ${overdueOpenActions.length} overskredne opfølgningsaktiviteter`);
  } else if (openActions.length > 0) {
    actionsSubscore = 50;
  }

  // G. Credit Handling Factor (default 5%)
  let creditSubscore = 0;
  const chLower = customer.creditHandling.toLowerCase();
  const isCreditStop = chLower.includes("stop") || chLower.includes("kreditstop");
  const isManualReview = chLower.includes("review") || chLower.includes("manuel") || chLower.includes("vurdering");

  if (isCreditStop) {
    creditSubscore = 100;
    riskReasons.push("Kreditstop er aktivt på kunden");
  } else if (isManualReview) {
    creditSubscore = 75;
    riskReasons.push("Kunden er markeret til manuel kreditvurdering");
  }

  // --- 2. Calculate Weighted Raw Score ---
  let rawScore =
    overdueSubscore * settings.weightOverdue +
    balanceSubscore * settings.weightBalance +
    paymentSubscore * settings.weightPayment +
    purchaseSubscore * settings.weightPurchase +
    historySubscore * settings.weightHistory +
    actionsSubscore * settings.weightActions +
    creditSubscore * settings.weightCredit;

  // --- 3. Payment Promise Adjustments ---
  // If active unbroken promise exists, reduce score. If expired broken promise, increase significantly.
  let hasActivePromise = false;
  let hasBrokenPromise = false;

  const promiseActions = openActions.filter((a) => a.type === "promise");
  promiseActions.forEach((p) => {
    if (p.dueDate) {
      if (p.dueDate >= snapshotDate) {
        hasActivePromise = true;
      } else {
        hasBrokenPromise = true;
      }
    }
  });

  if (hasActivePromise) {
    rawScore = Math.max(rawScore - 20, 0);
    riskReasons.push("Aktivt betalingsløfte modtaget (nedsat midlertidig risiko)");
  } else if (hasBrokenPromise) {
    rawScore = Math.min(rawScore + 30, 100);
    riskReasons.push("Brudt betalingsløfte!");
  }

  // Override / Minimum Score for Credit Stop
  if (isCreditStop) {
    rawScore = Math.max(rawScore, 95); // Ensure it maps to Critical
  }

  const finalScore = Math.min(Math.max(Math.round(rawScore), 0), 100);

  // --- 4. Risk Level mapping ---
  let riskLevel = RiskLevel.Low;
  if (finalScore >= 81) riskLevel = RiskLevel.Critical;
  else if (finalScore >= 61) riskLevel = RiskLevel.VeryHigh;
  else if (finalScore >= 41) riskLevel = RiskLevel.High;
  else if (finalScore >= 21) riskLevel = RiskLevel.Medium;

  // --- 5. Customer Status mapping ---
  let customerStatus = CustomerStatus.Healthy;
  if (customer.balance <= 0) {
    if (customer.balance < 0) {
      customerStatus = CustomerStatus.Credit;
    } else {
      customerStatus = CustomerStatus.Closed;
    }
  } else if (isCreditStop || riskLevel === RiskLevel.Critical || riskLevel === RiskLevel.VeryHigh) {
    customerStatus = CustomerStatus.Critical;
  } else if (riskLevel === RiskLevel.High) {
    customerStatus = CustomerStatus.Attention;
  } else if (riskLevel === RiskLevel.Medium || customer.overdue > 0) {
    customerStatus = CustomerStatus.Monitor;
  }

  // --- 6. Collection Priority mapping ---
  let collectionPriority = CollectionPriority.Priority4; // Default Low Risk
  if (customer.balance < 0) {
    collectionPriority = CollectionPriority.Priority6; // Credit Balance
  } else if (customer.balance === 0) {
    collectionPriority = CollectionPriority.Priority5; // Balance only / closed
  } else if (customer.overdue === 0 && customer.balance > 0) {
    collectionPriority = CollectionPriority.Priority5; // Balance only
  } else if (riskLevel === RiskLevel.Critical && customer.overdue > 10000) {
    collectionPriority = CollectionPriority.Priority1; // Critical & High Overdue
  } else if (riskLevel === RiskLevel.VeryHigh || riskLevel === RiskLevel.Critical) {
    collectionPriority = CollectionPriority.Priority2; // High Risk
  } else if (riskLevel === RiskLevel.High || riskLevel === RiskLevel.Medium) {
    collectionPriority = CollectionPriority.Priority3; // Medium Risk
  }

  // --- 7. Collection Status mapping ---
  let collectionStatus: CollectionStatus = "Nothing Required";
  if (customer.balance > 0) {
    if (isCreditStop) {
      collectionStatus = "Needs Credit Review";
    } else if (riskLevel === RiskLevel.Critical && customer.overdue > 50000) {
      collectionStatus = "Needs Legal";
    } else if (customer.overdue > 25000 && customer.daysSincePayment !== null && customer.daysSincePayment > 60) {
      collectionStatus = "Needs Collection";
    } else if (hasBrokenPromise) {
      collectionStatus = "Needs Payment Agreement";
    } else if (customer.overdue > 10000 && !customer.lastPayment) {
      collectionStatus = "Needs Call";
    } else if (customer.overdue > 5000) {
      collectionStatus = "Needs Email";
    } else if (customer.overdue > 0) {
      collectionStatus = "Needs Reminder";
    }
  }

  // --- 8. Automatic Recommendation Engine (Rule-based, no AI) ---
  let recommendation = "Ingen opfølgning påkrævet";
  if (customer.balance > 0) {
    if (collectionStatus === "Needs Legal") {
      recommendation = "Send til retslig inkasso / juridisk vurdering";
    } else if (collectionStatus === "Needs Credit Review" || isCreditStop) {
      recommendation = "Gennemgå kreditgrænse og overvej frigivelse af leverancer";
    } else if (collectionStatus === "Needs Collection") {
      recommendation = "Overfør kunden til ekstern inkasso";
    } else if (collectionStatus === "Needs Payment Agreement" || hasBrokenPromise) {
      recommendation = "Kontakt kunde for at genforhandle betalingsaftale";
    } else if (collectionStatus === "Needs Call") {
      recommendation = "Ring til kunden angående ubetalt saldo";
    } else if (collectionStatus === "Needs Email") {
      recommendation = "Send opfølgende e-mail med kontoudtog";
    } else if (collectionStatus === "Needs Reminder") {
      recommendation = "Send rykker 1 eller 2";
    } else if (hasActivePromise) {
      recommendation = "Afvent indbetaling i henhold til betalingsløfte";
    }
  }

  // --- 9. Trend detection (7 day comparison) ---
  let balanceTrend: "Increasing" | "Stable" | "Reducing" = "Stable";
  if (customer.balanceDelta7 !== null) {
    if (customer.balanceDelta7 > 0) balanceTrend = "Increasing";
    else if (customer.balanceDelta7 < 0) balanceTrend = "Reducing";
  }

  let overdueTrend: "Increasing" | "Stable" | "Reducing" = "Stable";
  if (previousSnapshot) {
    const ovDiff = customer.overdue - previousSnapshot.overdue;
    if (ovDiff > 0) overdueTrend = "Increasing";
    else if (ovDiff < 0) overdueTrend = "Reducing";
  }

  let paymentTrend: "Improving" | "Stable" | "Declining" = "Stable";
  if (customer.payment14Days > 0) {
    paymentTrend = "Improving";
  } else if (customer.daysSincePayment !== null && customer.daysSincePayment > 30) {
    paymentTrend = "Declining";
  }

  return {
    customerNo: customer.customerNo,
    customerName: customer.customerName,
    riskScore: finalScore,
    riskLevel,
    collectionPriority,
    collectionStatus,
    recommendation,
    riskReasons: riskReasons.slice(0, 5), // Cap at 5 reasons as requested
    balanceTrend,
    overdueTrend,
    paymentTrend,
    customerStatus,
    hasActivePromise,
    hasBrokenPromise,
  };
}
