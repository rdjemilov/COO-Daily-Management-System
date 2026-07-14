import {
  calculateHistoricalChanges,
  calculatePaymentMetrics,
  calculateRiskInputs,
  calculateDashboardSummary,
  calculateCustomerKPIs,
  buildPaymentIndex,
  buildSnapshotIndex,
  getDaysAgo,
  getDaysBetween,
} from "./kpiEngine.ts";
import { DebitorRawRow } from "../../../types/debitor/index.ts";
import { DebtorTransactionRecord } from "../import/transactions.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}. Expected ${expected}, but got ${actual}`);
  }
  console.log(`PASS: ${message}`);
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}. Expected ${expectedStr}, but got ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

function runTests() {
  console.log("=== RUNNING KPI ENGINE UNIT TESTS ===");

  // 1. Balance Delta tests
  console.log("\n--- Testing Balance Delta ---");
  const delta1 = calculateHistoricalChanges({ balance: 100, overdue: 0 }, { balance: 80, overdue: 0 });
  assertEqual(delta1.balanceDelta7, 20, "Current 100, Previous 80 -> Delta 20");

  const delta2 = calculateHistoricalChanges({ balance: 80, overdue: 0 }, { balance: 100, overdue: 0 });
  assertEqual(delta2.balanceDelta7, -20, "Current 80, Previous 100 -> Delta -20");

  const delta3 = calculateHistoricalChanges({ balance: 100, overdue: 0 }, null);
  assertEqual(delta3.balanceDelta7, null, "No comparison snapshot -> Delta NULL");

  // Section 10: "Never return zero" -> Delta 0 returns null
  const deltaZero = calculateHistoricalChanges({ balance: 100, overdue: 0 }, { balance: 100, overdue: 0 });
  assertEqual(deltaZero.balanceDelta7, null, "Current 100, Previous 100 -> Delta NULL (Never return zero)");

  // 2. Payments (ABS calculation)
  console.log("\n--- Testing Payments Absolute Amount ---");
  const paymentIdx = buildPaymentIndex([
    {
      postingDate: "2026-07-10",
      documentType: "Betaling",
      documentNumber: "B123",
      customerNumber: "C001",
      description: "Payment",
      departmentCode: null,
      salespersonCode: null,
      amountOre: -2500000, // -25000 DKK in øre
      remainingAmountOre: null,
      creditAmountOre: null,
      dueDate: null,
      paymentMethodCode: null,
      sourceRowNumber: 2,
      fingerprint: "fp1",
      isValid: true,
      validationWarnings: [],
    },
  ]);
  const metrics = calculatePaymentMetrics("C001", "2026-07-15", paymentIdx);
  assertEqual(metrics.payment14Days, 25000, "Payment of -25000 DKK -> ABS 25000 DKK");

  // 3. Overdue Tests
  console.log("\n--- Testing Overdue (New and Resolved) ---");
  // Overdue 10000, Previous 6000 -> NewOverdue 4000
  const overdueDiff1 = calculateHistoricalChanges({ balance: 10000, overdue: 10000 }, { balance: 10000, overdue: 6000 });
  assertEqual(overdueDiff1.newOverdue, 4000, "Overdue 10000, Previous 6000 -> NewOverdue 4000");

  // Resolved 6000, Current 2000 -> 4000
  const overdueDiff2 = calculateHistoricalChanges({ balance: 10000, overdue: 2000 }, { balance: 10000, overdue: 6000 });
  assertEqual(overdueDiff2.resolvedOverdue, 4000, "Resolved 6000, Current 2000 -> ResolvedOverdue 4000");

  // No comparison snapshot -> NULL
  const overdueDiff3 = calculateHistoricalChanges({ balance: 10000, overdue: 2000 }, null);
  assertEqual(overdueDiff3.newOverdue, null, "No comparison snapshot -> NewOverdue NULL");
  assertEqual(overdueDiff3.resolvedOverdue, null, "No comparison snapshot -> ResolvedOverdue NULL");

  // 4. No payment -> DaysSincePayment NULL
  console.log("\n--- Testing Days Since Last Payment ---");
  const emptyPaymentIdx = buildPaymentIndex([]);
  const metricsEmpty = calculatePaymentMetrics("C001", "2026-07-15", emptyPaymentIdx);
  assertEqual(metricsEmpty.daysSincePayment, null, "No payment -> DaysSincePayment NULL");

  // 5. High-level summary calculations
  console.log("\n--- Testing Dashboard Summary ---");
  const rawCurrent: DebitorRawRow[] = [
    { customerNumber: "C01", customerName: "A", balance: 1000, overdueBalance: 500, paymentTerms: "PBS", lastInvoice: "2026-07-10", creditHandling: "Normal", salesperson: "SP1", location: "L1", seller: "SP1" },
    { customerNumber: "C02", customerName: "B", balance: -200, overdueBalance: 0, paymentTerms: "Netto 14", lastInvoice: "2026-07-01", creditHandling: "Normal", salesperson: "SP1", location: "L1", seller: "SP1" },
    { customerNumber: "C03", customerName: "C", balance: 500, overdueBalance: 100, paymentTerms: "PBSNET", lastInvoice: "2026-06-25", creditHandling: "Normal", salesperson: "SP2", location: "L2", seller: "SP2" },
  ];

  const rawPrevious: DebitorRawRow[] = [
    { customerNumber: "C01", customerName: "A", balance: 800, overdueBalance: 300, paymentTerms: "PBS", lastInvoice: "2026-07-01", creditHandling: "Normal", salesperson: "SP1", location: "L1", seller: "SP1" },
    { customerNumber: "C02", customerName: "B", balance: -200, overdueBalance: 0, paymentTerms: "Netto 14", lastInvoice: "2026-07-01", creditHandling: "Normal", salesperson: "SP1", location: "L1", seller: "SP1" },
    { customerNumber: "C03", customerName: "C", balance: 500, overdueBalance: 200, paymentTerms: "PBSNET", lastInvoice: "2026-06-25", creditHandling: "Normal", salesperson: "SP2", location: "L2", seller: "SP2" },
  ];

  const txs: DebtorTransactionRecord[] = [
    {
      postingDate: "2026-07-12",
      documentType: "Betaling",
      documentNumber: "TX1",
      customerNumber: "C01",
      description: null,
      departmentCode: null,
      salespersonCode: null,
      amountOre: -30000, // -300 DKK
      remainingAmountOre: null,
      creditAmountOre: null,
      dueDate: null,
      paymentMethodCode: null,
      sourceRowNumber: 1,
      fingerprint: "f1",
      isValid: true,
      validationWarnings: [],
    },
  ];

  const customers = calculateCustomerKPIs(rawCurrent, rawPrevious, txs, [], "2026-07-15");
  const summary = calculateDashboardSummary(customers, 1000);

  // Check counts
  assertEqual(summary.totalBalance, 1500, "Total positive balance (1000 + 500)");
  assertEqual(summary.creditBalance, 200, "Total credit balance absolute (200)");
  assertEqual(summary.netBalance, 1300, "Net balance (1000 - 200 + 500)");
  assertEqual(summary.totalOverdue, 600, "Total positive overdue (500 + 100)");
  assertEqual(summary.debtorsWithBalanceCount, 2, "Debtors with positive balance count is 2 (C01 and C03)");
  assertEqual(summary.debtorsWithOverdueCount, 2, "Debtors with overdue count is 2");
  assertEqual(summary.pbsCount, 2, "PBS customers with overdue count is 2 (C01 starts with PBS, C03 starts with PBSNET)");
  assertEqual(summary.pbsOverdueAmount, 600, "PBS overdue amount is 600");
  assertEqual(summary.underThresholdCount, 1, "Under 1000 threshold count is 1 (C03 balance is 500)");

  console.log("\n=== ALL KPI ENGINE UNIT TESTS PASSED SUCCESSFULLY! ===");
}

try {
  runTests();
  process.exit(0);
} catch (e: any) {
  console.error("\n!!! TEST SUITE FAILED !!!");
  console.error(e.message || e);
  process.exit(1);
}
