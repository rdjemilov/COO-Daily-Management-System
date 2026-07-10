import { SalesRawRow, SalesWithoutProfitRow, CustomerSummary, ProductSummary } from "../../shared/types.js";

// Exclusion rules (Section 18)
export function isExcludedItem(itemNumber: string, description: string): boolean {
  const normNum = itemNumber.trim().toUpperCase();
  const normDesc = description.trim().toLowerCase();

  if (normNum.startsWith("PANT")) return true;
  if (normDesc.startsWith("kasse med")) return true;
  if (normDesc === "kortgebyr") return true;
  if (normDesc.startsWith("indbetaling")) return true;

  return false;
}

// Cash Customer check (Section 19)
export function isCashCustomer(customerName: string, customerNumber: string): boolean {
  const name = customerName.trim().toLowerCase();
  const num = customerNumber.trim().toLowerCase();
  return name.startsWith("kontant") || num.startsWith("kontant");
}

// Normalized Cost & Gross Profit Calculations (Section 17)
export function getRowGrossProfit(row: SalesRawRow): number {
  if (isExcludedItem(row.itemNumber, row.description)) {
    return 0; // Excluded items contribute 0 gross profit
  }
  // Normalised Cost = absolute value of cost amount
  const normalisedCost = Math.abs(row.costAmount);
  return row.salesAmount - normalisedCost;
}

// Process and aggregate all metrics from raw Sales lines
export interface AggregatedMetrics {
  totalSales: number;
  totalCost: number;
  totalGrossProfit: number;
  grossMarginPercentage: number;
  uniqueInvoices: number;
  uniqueCustomers: number;
  deliveryCustomerCount: number;
  averageInvoiceValue: number;
  salesWithoutProfitCount: number;
  salesWithoutProfitLoss: number;
}

export function calculateSalesMetrics(rows: SalesRawRow[], excludeCash: boolean = false): AggregatedMetrics {
  let totalSales = 0;
  let totalCost = 0;
  let totalGrossProfit = 0;

  const invoiceNumbers = new Set<string>();
  const customerNumbers = new Set<string>();
  const deliveryCustomers = new Set<string>();

  let lossCount = 0;
  let totalLossAmount = 0;

  rows.forEach((row) => {
    // Check exclusions
    const isExcluded = isExcludedItem(row.itemNumber, row.description);
    if (isExcluded) return;

    // Check cash customer exclusions for metrics if toggled
    const isCash = isCashCustomer(row.customerName, row.customerNumber);
    if (excludeCash && isCash) return;

    // Add Sales & Cost
    totalSales += row.salesAmount;
    
    const rowCost = Math.abs(row.costAmount);
    totalCost += rowCost;

    const rowProfit = row.salesAmount - rowCost;
    totalGrossProfit += rowProfit;

    // Loss calculations
    if (rowProfit <= 0 && row.documentType === "Faktura") {
      lossCount++;
      totalLossAmount += Math.abs(rowProfit);
    }

    // Document & Customer counts
    if (row.documentNumber) {
      invoiceNumbers.add(row.documentNumber);
    }

    if (row.customerNumber) {
      customerNumbers.add(row.customerNumber);
      
      // Delivery Customers: Salgsleverance documents
      if (row.documentType === "Salgsleverance") {
        deliveryCustomers.add(row.customerNumber);
      }
    }
  });

  const grossMarginPercentage = totalSales !== 0 ? (totalGrossProfit / totalSales) * 100 : 0;
  const uniqueInvoices = invoiceNumbers.size;
  const uniqueCustomers = customerNumbers.size;
  const deliveryCustomerCount = deliveryCustomers.size;
  const averageInvoiceValue = uniqueInvoices !== 0 ? totalSales / uniqueInvoices : 0;

  return {
    totalSales,
    totalCost,
    totalGrossProfit,
    grossMarginPercentage,
    uniqueInvoices,
    uniqueCustomers,
    deliveryCustomerCount,
    averageInvoiceValue,
    salesWithoutProfitCount: lossCount,
    salesWithoutProfitLoss: totalLossAmount,
  };
}

// Generate Top Customers list
export function getTopCustomers(rows: SalesRawRow[], limit: number = 10, excludeCash: boolean = false): CustomerSummary[] {
  const customerMap = new Map<string, {
    name: string;
    sales: number;
    cost: number;
    profit: number;
    invoices: Set<string>;
  }>();

  let grandTotalSales = 0;

  rows.forEach((row) => {
    if (isExcludedItem(row.itemNumber, row.description)) return;
    
    const isCash = isCashCustomer(row.customerName, row.customerNumber);
    if (excludeCash && isCash) return;

    grandTotalSales += row.salesAmount;

    const custNum = row.customerNumber || "UNKNOWN";
    const existing = customerMap.get(custNum) || {
      name: row.customerName || "Ukendt",
      sales: 0,
      cost: 0,
      profit: 0,
      invoices: new Set<string>()
    };

    existing.sales += row.salesAmount;
    existing.cost += Math.abs(row.costAmount);
    existing.profit += (row.salesAmount - Math.abs(row.costAmount));
    if (row.documentNumber) {
      existing.invoices.add(row.documentNumber);
    }

    customerMap.set(custNum, existing);
  });

  const list: CustomerSummary[] = Array.from(customerMap.entries()).map(([num, data]) => {
    const grossMargin = data.sales !== 0 ? (data.profit / data.sales) * 100 : 0;
    const invoiceCount = data.invoices.size;
    const averageInvoiceValue = invoiceCount !== 0 ? data.sales / invoiceCount : 0;
    const shareOfTotalSales = grandTotalSales !== 0 ? (data.sales / grandTotalSales) * 100 : 0;

    return {
      customerNumber: num,
      customerName: data.name,
      salesAmount: parseFloat(data.sales.toFixed(2)),
      costAmount: parseFloat(data.cost.toFixed(2)),
      grossProfit: parseFloat(data.profit.toFixed(2)),
      grossMargin: parseFloat(grossMargin.toFixed(1)),
      invoiceCount,
      averageInvoiceValue: parseFloat(averageInvoiceValue.toFixed(2)),
      shareOfTotalSales: parseFloat(shareOfTotalSales.toFixed(1))
    };
  });

  // Sort by sales descending
  return list.sort((a, b) => b.salesAmount - a.salesAmount).slice(0, limit);
}

// Generate Top Products list
export function getTopProducts(rows: SalesRawRow[], limit: number = 10): ProductSummary[] {
  const productMap = new Map<string, {
    description: string;
    quantity: number;
    sales: number;
    cost: number;
    profit: number;
    invoices: Set<string>;
    customers: Set<string>;
  }>();

  let grandTotalSales = 0;

  rows.forEach((row) => {
    if (isExcludedItem(row.itemNumber, row.description)) return;

    grandTotalSales += row.salesAmount;

    const itemNum = row.itemNumber || "UNKNOWN";
    const existing = productMap.get(itemNum) || {
      description: row.description || "Ingen beskrivelse",
      quantity: 0,
      sales: 0,
      cost: 0,
      profit: 0,
      invoices: new Set<string>(),
      customers: new Set<string>()
    };

    existing.quantity += row.quantity;
    existing.sales += row.salesAmount;
    existing.cost += Math.abs(row.costAmount);
    existing.profit += (row.salesAmount - Math.abs(row.costAmount));
    
    if (row.documentNumber) {
      existing.invoices.add(row.documentNumber);
    }
    if (row.customerNumber) {
      existing.customers.add(row.customerNumber);
    }

    productMap.set(itemNum, existing);
  });

  const list: ProductSummary[] = Array.from(productMap.entries()).map(([num, data]) => {
    const grossMargin = data.sales !== 0 ? (data.profit / data.sales) * 100 : 0;
    const shareOfTotalSales = grandTotalSales !== 0 ? (data.sales / grandTotalSales) * 100 : 0;

    return {
      itemNumber: num,
      description: data.description,
      quantity: data.quantity,
      salesAmount: parseFloat(data.sales.toFixed(2)),
      costAmount: parseFloat(data.cost.toFixed(2)),
      grossProfit: parseFloat(data.profit.toFixed(2)),
      grossMargin: parseFloat(grossMargin.toFixed(1)),
      invoiceCount: data.invoices.size,
      customerCount: data.customers.size,
      shareOfTotalSales: parseFloat(shareOfTotalSales.toFixed(1))
    };
  });

  return list.sort((a, b) => b.salesAmount - a.salesAmount).slice(0, limit);
}

// Generate Sales Without Profit List (Section 25)
export function getSalesWithoutProfit(rows: SalesRawRow[]): SalesWithoutProfitRow[] {
  const list: SalesWithoutProfitRow[] = [];

  rows.forEach((row) => {
    // Only consider sales invoices or relevant positive quantity transactions
    if (row.documentType !== "Faktura") return;
    if (isExcludedItem(row.itemNumber, row.description)) return;

    const normalisedCost = Math.abs(row.costAmount);
    const grossProfit = row.salesAmount - normalisedCost;

    // Sales Without Profit = Gross Profit <= 0
    if (grossProfit <= 0) {
      const lossAmount = Math.abs(grossProfit);
      const grossMargin = row.salesAmount !== 0 ? (grossProfit / row.salesAmount) * 100 : 0;
      
      // Severity: critical if loss > 100 DKK, loss if below zero, zero if exactly zero
      let severity: "critical" | "loss" | "zero" = "loss";
      if (grossProfit === 0) {
        severity = "zero";
      } else if (lossAmount > 150) {
        severity = "critical";
      }

      list.push({
        date: row.postingDate,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        customerNumber: row.customerNumber,
        customerName: row.customerName,
        itemNumber: row.itemNumber,
        description: row.description,
        locationCode: row.locationCode,
        quantity: row.quantity,
        salesAmount: parseFloat(row.salesAmount.toFixed(2)),
        costAmount: parseFloat(normalisedCost.toFixed(2)),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        lossAmount: parseFloat(lossAmount.toFixed(2)),
        grossMargin: parseFloat(grossMargin.toFixed(1)),
        severity
      });
    }
  });

  // Sort by loss amount descending
  return list.sort((a, b) => b.lossAmount - a.lossAmount);
}

// Historical Comparison worksheet discovery (Section 21)
export function getComparisonDate(
  currentDate: string,
  availableDates: string[],
  mode: "previous" | "week_ago" | "two_weeks_ago"
): string | null {
  const sorted = [...availableDates].sort((a, b) => b.localeCompare(a)); // newest first
  const currentIdx = sorted.indexOf(currentDate);
  if (currentIdx === -1) return null;

  if (mode === "previous") {
    return currentIdx + 1 < sorted.length ? sorted[currentIdx + 1] : null;
  }

  const currentD = new Date(currentDate);
  const currentDay = currentD.getDay();

  if (mode === "week_ago") {
    // Look for a date that is between 5 and 9 days older with same weekday
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      const d = new Date(sorted[i]);
      const diffTime = currentD.getTime() - d.getTime();
      const diffDays = diffTime / (1000 * 3600 * 24);
      if (diffDays >= 5 && diffDays <= 9 && d.getDay() === currentDay) {
        return sorted[i];
      }
    }
    // Fallback: exactly 7 days older
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      const d = new Date(sorted[i]);
      const diffTime = currentD.getTime() - d.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      if (diffDays === 7) return sorted[i];
    }
  }

  if (mode === "two_weeks_ago") {
    // Look for a date that is between 12 and 16 days older with same weekday
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      const d = new Date(sorted[i]);
      const diffTime = currentD.getTime() - d.getTime();
      const diffDays = diffTime / (1000 * 3600 * 24);
      if (diffDays >= 12 && diffDays <= 16 && d.getDay() === currentDay) {
        return sorted[i];
      }
    }
    // Fallback: exactly 14 days older
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      const d = new Date(sorted[i]);
      const diffTime = currentD.getTime() - d.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      if (diffDays === 14) return sorted[i];
    }
  }

  return null;
}
