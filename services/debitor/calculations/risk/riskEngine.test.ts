import {
  calculateCustomerRisk,
  RiskLevel,
  CollectionPriority,
  CustomerStatus,
} from "./riskEngine.ts";
import {
  calculateExecutiveRisk,
} from "./executiveEngine.ts";
import { DEFAULT_SETTINGS } from "./settingsService.ts";
import { CustomerViewModel } from "../kpiEngine.ts";
import { DebtorAction } from "../../storage/actions.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}. Expected ${expected}, but got ${actual}`);
  }
  console.log(`PASS: ${message}`);
}

function assertGreaterOrEqual(actual: number, threshold: number, message: string) {
  if (actual < threshold) {
    throw new Error(`FAIL: ${message}. Expected >= ${threshold}, but got ${actual}`);
  }
  console.log(`PASS: ${message}`);
}

function runRiskTests() {
  console.log("=== RUNNING RISK & EXECUTIVE ENGINE UNIT TESTS ===");

  // Mock Customer View Model 1
  const mockCustomer1: CustomerViewModel = {
    customerNo: "C101",
    customerName: "Nordic Foods",
    balance: 500000,
    overdue: 200000,
    paymentTerms: "Netto 14",
    lastInvoice: "2026-07-01",
    lastPayment: "2026-06-20",
    daysSincePayment: 25,
    payment14Days: 0,
    balanceDelta7: 50000,
    newOverdue: 30000,
    resolvedOverdue: 0,
    creditHandling: "Normal",
    location: "Sjælland",
    salesperson: "Rasim Beytula",
    seller: "Rasim Beytula",
    latestAction: null,
    riskInputs: {
      overdueShare: 0.4,
      daysSinceLastPayment: 25,
      noPayment14Days: true,
      noPurchase14Days: false,
      riskScore: 40,
      riskLevel: "medium",
    },
    notesSummary: "",
  };

  const prevSnapshot1 = { balance: 450000, overdue: 170000 };

  // 1. Basic Risk Calculation test
  console.log("\n--- Case 1: Standard customer with overdue & balance increase ---");
  const result1 = calculateCustomerRisk(
    mockCustomer1,
    prevSnapshot1,
    [],
    "2026-07-15",
    DEFAULT_SETTINGS
  );

  console.log(`Calculated Risk Score: ${result1.riskScore}, Level: ${result1.riskLevel}`);
  assertGreaterOrEqual(result1.riskScore, 20, "Should have medium or high risk score");
  assertEqual(result1.balanceTrend, "Increasing", "Balance trend should be Increasing");
  assertEqual(result1.overdueTrend, "Increasing", "Overdue trend should be Increasing");

  // 2. Credit Stop -> Critical Range
  console.log("\n--- Case 2: Credit Stop check ---");
  const stopCustomer = { ...mockCustomer1, creditHandling: "Kreditstop" };
  const resultStop = calculateCustomerRisk(
    stopCustomer,
    prevSnapshot1,
    [],
    "2026-07-15",
    DEFAULT_SETTINGS
  );
  assertEqual(resultStop.riskLevel, RiskLevel.Critical, "Credit stop must force Critical Risk Level");
  assertEqual(resultStop.customerStatus, CustomerStatus.Critical, "Customer status should be Critical");

  // 3. Payment Promise Unbroken vs Broken
  console.log("\n--- Case 3: Payment Promise check ---");
  const activePromise: DebtorAction = {
    id: "ACT-P1",
    customerNumber: "C101",
    type: "promise",
    status: "open",
    priority: "medium",
    owner: "rb@danfoods.dk",
    dueDate: "2026-07-20", // In future relative to 2026-07-15
    comment: "Lover at betale d. 20",
    createdBy: "rb@danfoods.dk",
    createdAt: "2026-07-14T12:00:00Z",
    updatedBy: null,
    updatedAt: "2026-07-14T12:00:00Z",
    closedAt: null,
    promisedPaymentDate: "2026-07-20",
    reference: null,
  };

  // Active Unbroken Promise
  const resultPromiseActive = calculateCustomerRisk(
    mockCustomer1,
    prevSnapshot1,
    [activePromise],
    "2026-07-15",
    DEFAULT_SETTINGS
  );
  assertEqual(resultPromiseActive.hasActivePromise, true, "Should identify active unbroken promise");
  assertEqual(resultPromiseActive.hasBrokenPromise, false, "Should not be broken");

  // Broken Promise
  const brokenPromise = { ...activePromise, dueDate: "2026-07-10" }; // Passed due date
  const resultPromiseBroken = calculateCustomerRisk(
    mockCustomer1,
    prevSnapshot1,
    [brokenPromise],
    "2026-07-15",
    DEFAULT_SETTINGS
  );
  assertEqual(resultPromiseBroken.hasActivePromise, false, "Should not be active");
  assertEqual(resultPromiseBroken.hasBrokenPromise, true, "Should identify broken promise");

  // 4. Recommendation & Collection Priority
  console.log("\n--- Case 4: Recommendation Engine rules ---");
  const recCustomer: CustomerViewModel = {
    ...mockCustomer1,
    overdue: 60000,
    daysSincePayment: 75,
  };
  const resultRec = calculateCustomerRisk(
    recCustomer,
    prevSnapshot1,
    [],
    "2026-07-15",
    DEFAULT_SETTINGS
  );
  assertEqual(resultRec.collectionStatus, "Needs Collection", "Should recommend external collection since overdue > 25000 and daysSincePayment > 60");
  assertEqual(resultRec.recommendation, "Overfør kunden til ekstern inkasso", "Recommendation string check");

  // 5. Executive calculations and alerts
  console.log("\n--- Case 5: Executive summary & Alert generator ---");
  const execSummary = calculateExecutiveRisk(
    [mockCustomer1],
    [resultPromiseBroken],
    [],
    [brokenPromise]
  );

  assertEqual(execSummary.totalExposure, 500000, "Total exposure is 500000");
  assertEqual(execSummary.totalOverdue, 200000, "Total overdue is 200000");
  
  const brokenPromiseAlert = execSummary.alerts.find((a) => a.type === "broken_promise");
  assertEqual(!!brokenPromiseAlert, true, "Should generate a Broken Promise Alert");
  assertEqual(brokenPromiseAlert?.priority, "Critical", "Broken promise alert priority should be Critical");

  console.log("\n=== ALL RISK & EXECUTIVE ENGINE UNIT TESTS PASSED SUCCESSFULLY! ===");
}

try {
  runRiskTests();
  process.exit(0);
} catch (err: any) {
  console.error("\n!!! UNIT TESTS FAILURE !!!");
  console.error(err.message || err);
  process.exit(1);
}
