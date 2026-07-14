import { SalesRawRow, ImportMetadata } from "../../src/shared/types.js";
import { getWorksheetData, getImportHistory } from "../dbService.js";
import { isExcludedItem, isCashCustomer, getRowGrossProfit } from "../../src/modules/sales/calculations.js";

// Types
export type SalesAlertSeverity = "critical" | "high" | "medium";

export interface CustomerMissingThisWeekAlert {
  customerNumber: string;
  customerName: string;
  prevWeekSales: number;
  prevWeekProfit: number;
  prevWeekMargin: number;
  prevWeekInvoiceCount: number;
  prevWeekPurchaseDays: number;
  lastPurchaseDate: string;
  daysSinceLastPurchase: number;
  prevFourWeekSales: number;
  prevFourWeekAvgWeeklySales: number;
  estimatedSalesAtRisk: number;
  mainPurchasedProduct: string;
  mainLocation: string;
  severity: SalesAlertSeverity;
}

export interface CustomerInactiveTwoWeeksAlert {
  customerNumber: string;
  customerName: string;
  lastPurchaseDate: string;
  inactiveDays: number;
  lastActiveWeek: string;
  salesInLastActiveWeek: number;
  historicalAvgWeeklySales: number;
  historicalProfit: number;
  historicalMargin: number;
  totalSalesPrevEightWeeks: number;
  mostPurchasedProductHist: string;
  mainLocation: string;
  estimatedSalesAtRisk: number;
  severity: SalesAlertSeverity;
}

export interface NewCustomerAlert {
  customerNumber: string;
  customerName: string;
  firstPurchaseDate: string;
  firstInvoiceDoc: string;
  firstLocation: string;
  currentWeekSales: number;
  currentWeekProfit: number;
  currentWeekMargin: number;
  invoiceCount: number;
  purchaseDays: number;
  differentProductsCount: number;
  topPurchasedProduct: string;
  firstEmployeeName: string;
}

export interface ProductMissingThisWeekAlert {
  rank: number;
  itemNumber: string;
  productDescription: string;
  prevWeekQuantity: number;
  prevWeekSales: number;
  prevWeekProfit: number;
  prevWeekMargin: number;
  prevWeekInvoiceCount: number;
  prevWeekCustomerCount: number;
  lastSaleDate: string;
  mainCustomer: string;
  mainLocation: string;
  estimatedSalesAtRisk: number;
  avgWeeklySalesPrevFourWeeks: number;
}

export interface ReactivatedProductAlert {
  rank: number;
  itemNumber: string;
  productDescription: string;
  currentWeekQuantity: number;
  currentWeekSales: number;
  currentWeekProfit: number;
  currentWeekMargin: number;
  currentWeekInvoiceCount: number;
  currentWeekCustomerCount: number;
  firstSaleDate: string;
  inactiveDays: number;
  lastHistoricalSaleDate: string;
  mainCustomer: string;
  mainLocation: string;
}

export interface SalesAlertSummary {
  customersMissingCount: number;
  customersInactiveTwoWeeksCount: number;
  newCustomersCount: number;
  newCustomersSales: number;
  newCustomersProfit: number;
  newCustomerSalesShare: number;
  estimatedSalesAtRisk: number;
  missingTopProductsCount: number;
  reactivatedProductsCount: number;
}

export interface SalesAlertsResponse {
  week: string;
  weekStatus: "preliminary" | "confirmed";
  importedDays: number;
  expectedDays: number;
  summary: SalesAlertSummary;
  customersMissingThisWeek: CustomerMissingThisWeekAlert[];
  customersInactiveTwoWeeks: CustomerInactiveTwoWeeksAlert[];
  newCustomers: NewCustomerAlert[];
  topProductsMissingThisWeek: ProductMissingThisWeekAlert[];
  reactivatedProducts: ReactivatedProductAlert[];
}

export interface SalesAlertsFilters {
  location?: string[];
  documentType?: string[];
  customerQuery?: string;
  productQuery?: string;
  excludeCashCustomers?: boolean;
  expectedBusinessDays?: number;
  criticalRiskThreshold?: number;
}

// Memory Cache for Alerts
interface CacheEntry {
  timestamp: number;
  versionToken: string;
  data: SalesAlertsResponse;
}
const alertsCache: Record<string, CacheEntry> = {};

// Helper to calculate ISO Week and Year
export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const tempDate = new Date(date.valueOf());
  tempDate.setHours(12, 0, 0, 0);
  // Thursday in current week decides the year
  tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
  // January 4 is always in week 1
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  const diff = tempDate.getTime() - (week1.getTime() + 3 - (week1.getDay() + 6) % 7);
  const week = 1 + Math.round(diff / 604800000);
  return { week, year: tempDate.getFullYear() };
}

export function getISOWeekString(dateStr: string): string {
  // Safe parsing by forcing midday to avoid timezone shifting
  const date = new Date(dateStr + "T12:00:00");
  if (isNaN(date.getTime())) return "";
  const { week, year } = getISOWeekAndYear(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getPreviousISOWeek(weekStr: string, offset = 1): string {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return "";
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // Find first Thursday of the year
  const jan1 = new Date(Date.UTC(year, 0, 1, 12, 0, 0, 0));
  const day = jan1.getUTCDay();
  const firstThursdayOffset = (11 - day) % 7;
  const firstThursday = new Date(Date.UTC(year, 0, 1 + firstThursdayOffset, 12, 0, 0, 0));
  
  // Subtract weeks
  const targetThursday = new Date(firstThursday.getTime() + (week - 1 - offset) * 7 * 86400000);
  const { week: targetWeek, year: targetYear } = getISOWeekAndYear(targetThursday);
  return `${targetYear}-W${String(targetWeek).padStart(2, "0")}`;
}

// Check row matches filters
function matchesFilters(row: SalesRawRow, filters: SalesAlertsFilters): boolean {
  if (filters.location && filters.location.length > 0) {
    if (!filters.location.includes(row.locationCode)) return false;
  }
  if (filters.documentType && filters.documentType.length > 0) {
    if (!filters.documentType.includes(row.documentType)) return false;
  }
  if (filters.customerQuery) {
    const cq = filters.customerQuery.toLowerCase();
    if (!row.customerNumber.toLowerCase().includes(cq) && !row.customerName.toLowerCase().includes(cq)) {
      return false;
    }
  }
  if (filters.productQuery) {
    const pq = filters.productQuery.toLowerCase();
    if (!row.itemNumber.toLowerCase().includes(pq) && !row.description.toLowerCase().includes(pq)) {
      return false;
    }
  }
  return true;
}

// Difference in days between two YYYY-MM-DD date strings
function daysBetween(d1: string, d2: string): number {
  const t1 = new Date(d1 + "T12:00:00").getTime();
  const t2 = new Date(d2 + "T12:00:00").getTime();
  return Math.round(Math.abs(t1 - t2) / 86400000);
}

// Cache keys generated based on filters and import statuses
function getCacheKey(week: string, filters: SalesAlertsFilters): string {
  return `${week}_${JSON.stringify(filters)}`;
}

export async function calculateSalesAlerts(
  targetWeek: string,
  filters: SalesAlertsFilters = {}
): Promise<SalesAlertsResponse> {
  const history = await getImportHistory();
  const successImports = history.filter((h) => h.importStatus === "success");
  
  // Generate version token to auto-invalidate cache if new imports are registered
  const versionToken = successImports
    .map((h) => `${h.importId}-${h.importVersion}`)
    .sort()
    .join("|");

  const cacheKey = getCacheKey(targetWeek, filters);
  const cached = alertsCache[cacheKey];
  if (cached && cached.versionToken === versionToken && (Date.now() - cached.timestamp) < 60000) {
    console.log(`[SalesAlerts] Serving cached results for ${targetWeek}`);
    return cached.data;
  }

  console.log(`[SalesAlerts] Computing alerts for week ${targetWeek}...`);

  // Default parameters
  const excludeCash = filters.excludeCashCustomers !== false;
  const expectedDays = filters.expectedBusinessDays || 5;
  const criticalThreshold = filters.criticalRiskThreshold || 5000;

  // Group success imports by businessDate, taking the latest one
  const dateToMeta: Record<string, ImportMetadata> = {};
  successImports.forEach((h) => {
    const existing = dateToMeta[h.businessDate];
    if (!existing || h.importedAt.localeCompare(existing.importedAt) > 0) {
      dateToMeta[h.businessDate] = h;
    }
  });

  const allImportedDates = Object.keys(dateToMeta).sort();

  // Find worksheets falling into:
  // - Selected week (currentWeek)
  // - Previous week (prevWeek)
  // - 2 weeks ago (twoWeeksAgo)
  // - Prev 4 completed weeks
  // - Prev 8 completed weeks
  // - All history before selected week
  const currentWeekStr = targetWeek;
  const prevWeekStr = getPreviousISOWeek(currentWeekStr, 1);
  const twoWeeksAgoStr = getPreviousISOWeek(currentWeekStr, 2);
  
  const prev4WeeksStr = [1, 2, 3, 4].map((offset) => getPreviousISOWeek(currentWeekStr, offset));
  const prev8WeeksStr = [1, 2, 3, 4, 5, 6, 7, 8].map((offset) => getPreviousISOWeek(currentWeekStr, offset));

  const currentWeekDates: string[] = [];
  const prevWeekDates: string[] = [];
  const twoWeeksAgoDates: string[] = [];
  const prev4WeeksDates: string[] = [];
  const prev8WeeksDates: string[] = [];
  const historicalBeforeDates: string[] = [];

  allImportedDates.forEach((date) => {
    const w = getISOWeekString(date);
    if (w === currentWeekStr) {
      currentWeekDates.push(date);
    } else if (w === prevWeekStr) {
      prevWeekDates.push(date);
    } else if (w === twoWeeksAgoStr) {
      twoWeeksAgoDates.push(date);
    }
    
    if (prev4WeeksStr.includes(w)) {
      prev4WeeksDates.push(date);
    }
    if (prev8WeeksStr.includes(w)) {
      prev8WeeksDates.push(date);
    }

    // Strictly older than current week
    if (w.localeCompare(currentWeekStr) < 0) {
      historicalBeforeDates.push(date);
    }
  });

  // Load the rows. To avoid repetitive database calls, let's load all needed worksheets in parallel.
  const neededDates = Array.from(new Set([
    ...currentWeekDates,
    ...prevWeekDates,
    ...twoWeeksAgoDates,
    ...prev4WeeksDates,
    ...prev8WeeksDates,
    ...historicalBeforeDates
  ]));

  const rowsByDate: Record<string, SalesRawRow[]> = {};
  await Promise.all(
    neededDates.map(async (date) => {
      const rows = await getWorksheetData(date);
      rowsByDate[date] = rows;
    })
  );

  // Reference Date for "days since last purchase"
  // Let's use the maximum date in the selected week, or if none, today's date
  let referenceDate = new Date().toISOString().split("T")[0];
  if (currentWeekDates.length > 0) {
    referenceDate = currentWeekDates[currentWeekDates.length - 1];
  }

  // Week status handling
  const importedDays = currentWeekDates.length;
  const weekStatus = importedDays >= expectedDays ? "confirmed" : "preliminary";

  // Filter and process rows
  const processRows = (dates: string[]) => {
    const list: SalesRawRow[] = [];
    dates.forEach((d) => {
      const raw = rowsByDate[d] || [];
      raw.forEach((row) => {
        if (!row.customerNumber || !row.customerNumber.trim()) return;
        if (excludeCash && isCashCustomer(row.customerName, row.customerNumber)) return;
        if (matchesFilters(row, filters)) {
          list.push(row);
        }
      });
    });
    return list;
  };

  const currentRows = processRows(currentWeekDates);
  const prevRows = processRows(prevWeekDates);
  const twoWeeksAgoRows = processRows(twoWeeksAgoDates);
  
  // Historical mapping over past 4 and 8 weeks for baseline averages
  const prev4WeeksRows = processRows(prev4WeeksDates);
  const prev8WeeksRows = processRows(prev8WeeksDates);
  const allHistoryBeforeRows = processRows(historicalBeforeDates);

  // Group active metrics by Customer
  const getCustomerSummaryMap = (rows: SalesRawRow[]) => {
    const map = new Map<string, {
      customerNumber: string;
      customerName: string;
      sales: number;
      profit: number;
      invoiceCount: Set<string>;
      purchaseDays: Set<string>;
      products: Record<string, number>;
      locations: Record<string, number>;
      lastDate: string;
    }>();

    rows.forEach((row) => {
      const num = row.customerNumber;
      let existing = map.get(num);
      if (!existing) {
        existing = {
          customerNumber: num,
          customerName: row.customerName || "Ukendt Kunde",
          sales: 0,
          profit: 0,
          invoiceCount: new Set<string>(),
          purchaseDays: new Set<string>(),
          products: {},
          locations: {},
          lastDate: row.postingDate
        };
        map.set(num, existing);
      }

      existing.sales += row.salesAmount;
      existing.profit += getRowGrossProfit(row);
      if (row.documentNumber) existing.invoiceCount.add(row.documentNumber);
      if (row.postingDate) {
        existing.purchaseDays.add(row.postingDate);
        if (row.postingDate.localeCompare(existing.lastDate) > 0) {
          existing.lastDate = row.postingDate;
        }
      }

      if (row.description) {
        existing.products[row.description] = (existing.products[row.description] || 0) + row.salesAmount;
      }
      if (row.locationCode) {
        existing.locations[row.locationCode] = (existing.locations[row.locationCode] || 0) + row.salesAmount;
      }
    });

    return map;
  };

  const currentCustMap = getCustomerSummaryMap(currentRows);
  const prevCustMap = getCustomerSummaryMap(prevRows);
  const prev4WeeksCustMap = getCustomerSummaryMap(prev4WeeksRows);
  const prev8WeeksCustMap = getCustomerSummaryMap(prev8WeeksRows);
  const allHistoryBeforeCustMap = getCustomerSummaryMap(allHistoryBeforeRows);

  // Group active metrics by Product (respecting product exclusions)
  const getProductSummaryMap = (rows: SalesRawRow[], checkExclusion = true) => {
    const map = new Map<string, {
      itemNumber: string;
      description: string;
      quantity: number;
      sales: number;
      profit: number;
      invoices: Set<string>;
      customers: Set<string>;
      locations: Record<string, number>;
      lastDate: string;
      customersSales: Record<string, number>;
    }>();

    rows.forEach((row) => {
      if (checkExclusion && isExcludedItem(row.itemNumber, row.description)) return;

      const item = row.itemNumber || "UNKNOWN";
      let existing = map.get(item);
      if (!existing) {
        existing = {
          itemNumber: item,
          description: row.description || "Ingen beskrivelse",
          quantity: 0,
          sales: 0,
          profit: 0,
          invoices: new Set<string>(),
          customers: new Set<string>(),
          locations: {},
          lastDate: row.postingDate,
          customersSales: {}
        };
        map.set(item, existing);
      }

      existing.quantity += row.quantity;
      existing.sales += row.salesAmount;
      existing.profit += getRowGrossProfit(row);
      if (row.documentNumber) existing.invoices.add(row.documentNumber);
      if (row.customerNumber) {
        existing.customers.add(row.customerNumber);
        existing.customersSales[row.customerName] = (existing.customersSales[row.customerName] || 0) + row.salesAmount;
      }
      if (row.postingDate) {
        if (row.postingDate.localeCompare(existing.lastDate) > 0) {
          existing.lastDate = row.postingDate;
        }
      }
      if (row.locationCode) {
        existing.locations[row.locationCode] = (existing.locations[row.locationCode] || 0) + row.salesAmount;
      }
    });

    return map;
  };

  const currentProdMap = getProductSummaryMap(currentRows);
  const prevProdMap = getProductSummaryMap(prevRows);
  const prev4WeeksProdMap = getProductSummaryMap(prev4WeeksRows);
  const allHistoryBeforeProdMap = getProductSummaryMap(allHistoryBeforeRows, false);

  // Find top entity helper
  const getTopKey = (record: Record<string, number>): string => {
    let topKey = "";
    let maxVal = -Infinity;
    Object.entries(record).forEach(([k, v]) => {
      if (v > maxVal) {
        maxVal = v;
        topKey = k;
      }
    });
    return topKey;
  };

  // -------------------------------------------------------------------------
  // ALERT 1: CUSTOMERS BOUGHT LAST WEEK BUT NOT THIS WEEK
  // -------------------------------------------------------------------------
  const customersMissingThisWeek: CustomerMissingThisWeekAlert[] = [];

  // Median calculation helper
  const getMedian = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Find customers missing this week
  prevCustMap.forEach((prevCust, customerNumber) => {
    const isActiveThisWeek = currentCustMap.has(customerNumber);
    if (!isActiveThisWeek) {
      // Historical baseline for previous 4 weeks averages
      const p4WeeksData = prev4WeeksCustMap.get(customerNumber);
      const prevFourWeekSales = p4WeeksData ? p4WeeksData.sales : 0;
      
      // Determine how many weeks are actually present in the last 4 weeks dataset to average correctly
      const activeWeeksInP4 = new Set(prev4WeeksDates.map(d => getISOWeekString(d)));
      const numWeeks = activeWeeksInP4.size || 1;
      const prevFourWeekAvgWeeklySales = prevFourWeekSales / numWeeks;

      // Recommended estimated Sales at risk:
      // average weekly Sales over the previous four completed weeks.
      // If fewer than four completed weeks exist, use average of available.
      // If only the previous week exists, use previous week Sales.
      let estimatedSalesAtRisk = prevFourWeekAvgWeeklySales;
      if (numWeeks <= 1 || estimatedSalesAtRisk === 0) {
        estimatedSalesAtRisk = prevCust.sales;
      }

      const mainPurchasedProduct = getTopKey(prevCust.products) || "N/A";
      const mainLocation = getTopKey(prevCust.locations) || "N/A";

      // Days since last purchase
      // Find latest date across all history up to reference date
      let lastPurchaseDate = prevCust.lastDate;
      const olderHistory = allHistoryBeforeCustMap.get(customerNumber);
      if (olderHistory && olderHistory.lastDate.localeCompare(lastPurchaseDate) > 0) {
        lastPurchaseDate = olderHistory.lastDate;
      }

      const daysSinceLastPurchase = daysBetween(referenceDate, lastPurchaseDate);

      // Only include missing customers if inactivity is at least 7 days
      if (daysSinceLastPurchase >= 7) {
        customersMissingThisWeek.push({
          customerNumber,
          customerName: prevCust.customerName,
          prevWeekSales: prevCust.sales,
          prevWeekProfit: prevCust.profit,
          prevWeekMargin: prevCust.sales !== 0 ? (prevCust.profit / prevCust.sales) * 100 : 0,
          prevWeekInvoiceCount: prevCust.invoiceCount.size,
          prevWeekPurchaseDays: prevCust.purchaseDays.size,
          lastPurchaseDate,
          daysSinceLastPurchase,
          prevFourWeekSales,
          prevFourWeekAvgWeeklySales,
          estimatedSalesAtRisk,
          mainPurchasedProduct,
          mainLocation,
          severity: "medium" // detailed below after median
        });
      }
    }
  });

  // Calculate severity for Alert 1
  if (customersMissingThisWeek.length > 0) {
    const riskValues = customersMissingThisWeek.map(c => c.estimatedSalesAtRisk);
    const medianRisk = getMedian(riskValues);
    
    // Top 10% cutoff by historical sales
    const historicalSalesList = customersMissingThisWeek.map(c => {
      const p8 = prev8WeeksCustMap.get(c.customerNumber);
      return p8 ? p8.sales : c.prevWeekSales;
    }).sort((a, b) => b - a);
    const top10PercentCutoff = historicalSalesList[Math.floor(historicalSalesList.length * 0.1)] || Infinity;

    customersMissingThisWeek.forEach((c) => {
      const p8 = prev8WeeksCustMap.get(c.customerNumber);
      const histSales = p8 ? p8.sales : c.prevWeekSales;

      if (c.estimatedSalesAtRisk > criticalThreshold || histSales >= top10PercentCutoff) {
        c.severity = "critical";
      } else if (c.estimatedSalesAtRisk > medianRisk) {
        c.severity = "high";
      } else {
        c.severity = "medium";
      }
    });
  }

  // Sort default descending by estimated sales at risk
  customersMissingThisWeek.sort((a, b) => b.estimatedSalesAtRisk - a.estimatedSalesAtRisk);


  // -------------------------------------------------------------------------
  // ALERT 2: CUSTOMERS HAS NOT BOUGHT FOR TWO WEEKS
  // -------------------------------------------------------------------------
  const customersInactiveTwoWeeks: CustomerInactiveTwoWeeksAlert[] = [];

  // A customer qualifies when:
  // - The customer had no valid purchases during selected current week (currentCustMap)
  // - The customer had no valid purchases during immediately previous week (prevCustMap)
  // - The customer has historical purchase activity before these two weeks (allHistoryBeforeCustMap or older)
  allHistoryBeforeCustMap.forEach((histCust, customerNumber) => {
    // Make sure they have no purchases in selected current and previous week
    const hasBoughtThisWeek = currentCustMap.has(customerNumber);
    const hasBoughtLastWeek = prevCustMap.has(customerNumber);

    if (!hasBoughtThisWeek && !hasBoughtLastWeek) {
      // Find total sales in the previous 8 completed weeks
      const p8Data = prev8WeeksCustMap.get(customerNumber);
      const totalSalesPrevEightWeeks = p8Data ? p8Data.sales : 0;

      // Historical average weekly Sales over active weeks before these 2 weeks
      // Let's scan all worksheets chronologically before the two weeks ago period
      let activeWeekCount = 0;
      let totalHistSales = 0;
      let totalHistProfit = 0;
      const weekSalesMap: Record<string, number> = {};

      // Calculate total historical values
      const histData = allHistoryBeforeCustMap.get(customerNumber);
      if (histData) {
        totalHistSales = histData.sales;
        totalHistProfit = histData.profit;
        
        // Count active weeks
        const activeWeeks = new Set(historicalBeforeDates.map(d => getISOWeekString(d)));
        activeWeeks.forEach(w => {
          // If we had sales this week
          const weekDates = historicalBeforeDates.filter(d => getISOWeekString(d) === w);
          let ws = 0;
          weekDates.forEach(wd => {
            const rowList = rowsByDate[wd] || [];
            rowList.forEach(r => {
              if (r.customerNumber === customerNumber) {
                ws += r.salesAmount;
              }
            });
          });
          if (ws > 0) {
            weekSalesMap[w] = ws;
          }
        });
        activeWeekCount = Object.keys(weekSalesMap).length || 1;
      }

      const historicalAvgWeeklySales = totalHistSales / activeWeekCount;
      const estimatedSalesAtRisk = historicalAvgWeeklySales;

      // Get last purchase date and details
      let lastPurchaseDate = histCust.lastDate;
      const inactiveDays = daysBetween(referenceDate, lastPurchaseDate);
      const lastActiveWeek = getISOWeekString(lastPurchaseDate);
      const salesInLastActiveWeek = weekSalesMap[lastActiveWeek] || 0;

      const mostPurchasedProductHist = getTopKey(histCust.products) || "N/A";
      const mainLocation = getTopKey(histCust.locations) || "N/A";

      customersInactiveTwoWeeks.push({
        customerNumber,
        customerName: histCust.customerName,
        lastPurchaseDate,
        inactiveDays,
        lastActiveWeek,
        salesInLastActiveWeek,
        historicalAvgWeeklySales,
        historicalProfit: totalHistProfit,
        historicalMargin: totalHistSales !== 0 ? (totalHistProfit / totalHistSales) * 100 : 0,
        totalSalesPrevEightWeeks,
        mostPurchasedProductHist,
        mainLocation,
        estimatedSalesAtRisk,
        severity: "medium" // detailed below after median
      });
    }
  });

  // Calculate severity for Alert 2
  if (customersInactiveTwoWeeks.length > 0) {
    const riskValues = customersInactiveTwoWeeks.map(c => c.estimatedSalesAtRisk);
    const medianRisk = getMedian(riskValues);

    customersInactiveTwoWeeks.forEach((c) => {
      if (c.estimatedSalesAtRisk > criticalThreshold) {
        c.severity = "critical";
      } else if (c.estimatedSalesAtRisk > medianRisk) {
        c.severity = "high";
      } else {
        c.severity = "medium";
      }
    });
  }

  // Sort descending by estimated Sales at risk
  customersInactiveTwoWeeks.sort((a, b) => b.estimatedSalesAtRisk - a.estimatedSalesAtRisk);


  // -------------------------------------------------------------------------
  // ALERT 3: NEW CUSTOMER
  // -------------------------------------------------------------------------
  const newCustomers: NewCustomerAlert[] = [];

  // A customer is new when:
  // - Has at least one purchase in current week
  // - Does not appear in any successful historical worksheet dated BEFORE current week
  currentCustMap.forEach((currCust, customerNumber) => {
    const isHistorical = allHistoryBeforeCustMap.has(customerNumber);
    if (!isHistorical) {
      // Find first purchase date details in current week rows
      let firstPurchaseDate = "N/A";
      let firstInvoiceDoc = "N/A";
      let firstLocation = "N/A";
      let firstEmployeeName = "N/A";
      let minDate = "9999-12-31";

      currentRows.forEach((r) => {
        if (r.customerNumber === customerNumber) {
          if (r.postingDate && r.postingDate.localeCompare(minDate) < 0) {
            minDate = r.postingDate;
            firstPurchaseDate = r.postingDate;
            firstInvoiceDoc = r.documentNumber || "N/A";
            firstLocation = r.locationCode || "N/A";
            firstEmployeeName = r.employeeName || "N/A";
          }
        }
      });

      const uniqueProducts = new Set<string>();
      currentRows.forEach((r) => {
        if (r.customerNumber === customerNumber && r.itemNumber) {
          uniqueProducts.add(r.itemNumber);
        }
      });

      const topPurchasedProduct = getTopKey(currCust.products) || "N/A";

      newCustomers.push({
        customerNumber,
        customerName: currCust.customerName,
        firstPurchaseDate,
        firstInvoiceDoc,
        firstLocation,
        currentWeekSales: currCust.sales,
        currentWeekProfit: currCust.profit,
        currentWeekMargin: currCust.sales !== 0 ? (currCust.profit / currCust.sales) * 100 : 0,
        invoiceCount: currCust.invoiceCount.size,
        purchaseDays: currCust.purchaseDays.size,
        differentProductsCount: uniqueProducts.size,
        topPurchasedProduct,
        firstEmployeeName
      });
    }
  });

  // Sort descending by selected week sales
  newCustomers.sort((a, b) => b.currentWeekSales - a.currentWeekSales);

  // Summary New Customers KPIs
  const totalSelectedWeekSales = currentRows.reduce((acc, r) => acc + r.salesAmount, 0);
  const newCustomersSales = newCustomers.reduce((acc, c) => acc + c.currentWeekSales, 0);
  const newCustomersProfit = newCustomers.reduce((acc, c) => acc + c.currentWeekProfit, 0);
  const newCustomerSalesShare = totalSelectedWeekSales !== 0 ? newCustomersSales / totalSelectedWeekSales : 0;


  // -------------------------------------------------------------------------
  // ALERT 4: TOP 10 PRODUCTS SOLD LAST WEEK BUT NOT THIS WEEK
  // -------------------------------------------------------------------------
  const topProductsMissingThisWeekAll: ProductMissingThisWeekAlert[] = [];

  prevProdMap.forEach((prevProd, itemNumber) => {
    const isActiveThisWeek = currentProdMap.has(itemNumber);
    if (!isActiveThisWeek) {
      // Average weekly sales over past 4 completed weeks
      let activeWeekCount = 0;
      let totalP4Sales = 0;
      const weekSalesMap: Record<string, number> = {};

      prev4WeeksProdMap.forEach((p4Prod, pItemNum) => {
        if (pItemNum === itemNumber) {
          totalP4Sales = p4Prod.sales;
        }
      });

      const activeWeeksInP4 = new Set(prev4WeeksDates.map(d => getISOWeekString(d)));
      const numWeeks = activeWeeksInP4.size || 1;
      const avgWeeklySalesPrevFourWeeks = totalP4Sales / numWeeks;

      let estimatedSalesAtRisk = avgWeeklySalesPrevFourWeeks;
      if (numWeeks <= 1 || estimatedSalesAtRisk === 0) {
        estimatedSalesAtRisk = prevProd.sales;
      }

      // Last sale date
      let lastSaleDate = prevProd.lastDate;
      const olderHistory = allHistoryBeforeProdMap.get(itemNumber);
      if (olderHistory && olderHistory.lastDate.localeCompare(lastSaleDate) > 0) {
        lastSaleDate = olderHistory.lastDate;
      }

      const mainCustomer = getTopKey(prevProd.customersSales) || "N/A";
      const mainLocation = getTopKey(prevProd.locations) || "N/A";

      topProductsMissingThisWeekAll.push({
        rank: 0,
        itemNumber,
        productDescription: prevProd.description,
        prevWeekQuantity: prevProd.quantity,
        prevWeekSales: prevProd.sales,
        prevWeekProfit: prevProd.profit,
        prevWeekMargin: prevProd.sales !== 0 ? (prevProd.profit / prevProd.sales) * 100 : 0,
        prevWeekInvoiceCount: prevProd.invoices.size,
        prevWeekCustomerCount: prevProd.customers.size,
        lastSaleDate,
        mainCustomer,
        mainLocation,
        estimatedSalesAtRisk,
        avgWeeklySalesPrevFourWeeks
      });
    }
  });

  // Rank and limit to top 10 products
  topProductsMissingThisWeekAll.sort((a, b) => b.prevWeekSales - a.prevWeekSales);
  const topProductsMissingThisWeek = topProductsMissingThisWeekAll
    .slice(0, 10)
    .map((p, idx) => ({ ...p, rank: idx + 1 }));


  // -------------------------------------------------------------------------
  // ALERT 5: PRODUCTS NOT SOLD FOR TWO WEEKS BUT SOLD THIS WEEK (REACTIVATED)
  // -------------------------------------------------------------------------
  const reactivatedProductsAll: ReactivatedProductAlert[] = [];

  currentProdMap.forEach((currProd, itemNumber) => {
    // Check if product had zero sales in previous week AND week before that
    let hadSalesPrevWeek = false;
    let hadSalesTwoWeeksAgo = false;

    // We can check our loaded rows directly to be safe and accurate
    prevRows.forEach((r) => {
      if (r.itemNumber === itemNumber && !isExcludedItem(r.itemNumber, r.description)) {
        hadSalesPrevWeek = true;
      }
    });

    twoWeeksAgoRows.forEach((r) => {
      if (r.itemNumber === itemNumber && !isExcludedItem(r.itemNumber, r.description)) {
        hadSalesTwoWeeksAgo = true;
      }
    });

    if (!hadSalesPrevWeek && !hadSalesTwoWeeksAgo) {
      // Find first sale date in current week
      let firstSaleDate = "N/A";
      let minDate = "9999-12-31";
      currentRows.forEach((r) => {
        if (r.itemNumber === itemNumber && r.postingDate && r.postingDate.localeCompare(minDate) < 0) {
          minDate = r.postingDate;
          firstSaleDate = r.postingDate;
        }
      });

      // Find last historical sale date before these 2 weeks
      let lastHistoricalSaleDate = "N/A";
      let maxDate = "0000-00-00";
      
      // Look in older history
      const olderHistory = allHistoryBeforeProdMap.get(itemNumber);
      if (olderHistory) {
        lastHistoricalSaleDate = olderHistory.lastDate;
      }

      const inactiveDays = lastHistoricalSaleDate !== "N/A" ? daysBetween(firstSaleDate, lastHistoricalSaleDate) : 14;

      const mainCustomer = getTopKey(currProd.customersSales) || "N/A";
      const mainLocation = getTopKey(currProd.locations) || "N/A";

      reactivatedProductsAll.push({
        rank: 0,
        itemNumber,
        productDescription: currProd.description,
        currentWeekQuantity: currProd.quantity,
        currentWeekSales: currProd.sales,
        currentWeekProfit: currProd.profit,
        currentWeekMargin: currProd.sales !== 0 ? (currProd.profit / currProd.sales) * 100 : 0,
        currentWeekInvoiceCount: currProd.invoices.size,
        currentWeekCustomerCount: currProd.customers.size,
        firstSaleDate,
        inactiveDays,
        lastHistoricalSaleDate,
        mainCustomer,
        mainLocation
      });
    }
  });

  // Rank and limit to Top 5
  reactivatedProductsAll.sort((a, b) => b.currentWeekSales - a.currentWeekSales);
  const reactivatedProducts = reactivatedProductsAll
    .slice(0, 5)
    .map((p, idx) => ({ ...p, rank: idx + 1 }));


  // -------------------------------------------------------------------------
  // KPI SUMMARY CARD METRICS
  // -------------------------------------------------------------------------
  const totalCustomerSalesAtRisk = 
    customersMissingThisWeek.reduce((acc, c) => acc + c.estimatedSalesAtRisk, 0) +
    customersInactiveTwoWeeks.reduce((acc, c) => acc + c.estimatedSalesAtRisk, 0);

  const summary: SalesAlertSummary = {
    customersMissingCount: customersMissingThisWeek.length,
    customersInactiveTwoWeeksCount: customersInactiveTwoWeeks.length,
    newCustomersCount: newCustomers.length,
    newCustomersSales,
    newCustomersProfit,
    newCustomerSalesShare,
    estimatedSalesAtRisk: totalCustomerSalesAtRisk,
    missingTopProductsCount: topProductsMissingThisWeek.length,
    reactivatedProductsCount: reactivatedProducts.length
  };

  const responseData: SalesAlertsResponse = {
    week: targetWeek,
    weekStatus,
    importedDays,
    expectedDays,
    summary,
    customersMissingThisWeek,
    customersInactiveTwoWeeks,
    newCustomers,
    topProductsMissingThisWeek,
    reactivatedProducts
  };

  // Cache computed response
  alertsCache[cacheKey] = {
    timestamp: Date.now(),
    versionToken,
    data: responseData
  };

  return responseData;
}
