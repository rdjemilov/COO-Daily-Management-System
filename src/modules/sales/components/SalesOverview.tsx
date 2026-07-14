import React, { useState, useMemo, useRef } from "react";
import { Info, ChevronUp, ChevronDown, Award, TrendingUp, DollarSign, Percent, FileText, Users, ShoppingBag, Eye, X, ArrowUpDown, Calendar, HelpCircle, Check, Search, Download } from "lucide-react";
import { SalesRawRow, KPIMetric, CustomerSummary, ProductSummary } from "../../../shared/types.js";
import { formatCurrency, formatDate, formatNumber, formatPercentage, getWeekdayLabel } from "../../../shared/utils/format.js";
import { calculateSalesMetrics, getTopCustomers, getTopProducts, isCashCustomer, isExcludedItem, getComparisonDate } from "../calculations.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, AreaChart, Area, Legend } from "recharts";
import { exportElementToPDF } from "../../../shared/utils/pdfExport.ts";

interface SalesOverviewProps {
  currentRows: SalesRawRow[];
  comparisonRows: SalesRawRow[];
  comparisonDateLabel: string;
  allHistoricalRows: Record<string, SalesRawRow[]>; // Available date -> rows
  availableDates: string[];
  compareFourDatesEnabled?: boolean;
  compareDates?: string[];
  activeDocumentTypes?: string[];
  activeDate?: string;
}

interface ExtendedKPIMetric extends KPIMetric {
  weekAgoValue?: number;
  weekAgoDiffPercentage?: number;
  weekAgoDirection?: "up" | "down" | "neutral";
  weekAgoStatus?: "positive" | "negative" | "neutral";
}

export default function SalesOverview({
  currentRows,
  comparisonRows,
  comparisonDateLabel,
  allHistoricalRows,
  availableDates,
  compareFourDatesEnabled = false,
  compareDates = [],
  activeDocumentTypes = [],
  activeDate,
}: SalesOverviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    setPdfStatus("Generating PDF...");
    const dateStr = new Date().toISOString().split("T")[0];
    try {
      await exportElementToPDF(
        containerRef.current,
        `Report_Sales_Overview_${dateStr}`,
        { 
          orientation: "portrait",
          title: "DANFOODS - SALGSOVERSIGT",
          subtitle: `Rapportdato: ${activeDate || dateStr}`
        },
        (status) => setPdfStatus(status)
      );
      setPdfStatus("Download completed");
      setTimeout(() => setPdfStatus(null), 3000);
    } catch (err) {
      console.error("PDF export failed:", err);
      setPdfStatus("Fejl under eksport");
      setTimeout(() => setPdfStatus(null), 3000);
    }
  };

  const [excludeCashCustomers, setExcludeCashCustomers] = useState(false);
  const [topCustLimit, setTopCustLimit] = useState(10);
  const [custSearch, setCustSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");

  // Modals / Details drawers state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);

  // 1. Calculate Core KPI Metrics
  const currentMetrics = useMemo(() => {
    return calculateSalesMetrics(currentRows, excludeCashCustomers);
  }, [currentRows, excludeCashCustomers]);

  const comparisonMetrics = useMemo(() => {
    return calculateSalesMetrics(comparisonRows, excludeCashCustomers);
  }, [comparisonRows, excludeCashCustomers]);

  const weekAgoDate = useMemo(() => {
    const resolvedActive = activeDate || currentRows[0]?.postingDate || (availableDates[0] || "");
    if (!resolvedActive) return null;
    return getComparisonDate(resolvedActive, availableDates, "week_ago");
  }, [activeDate, currentRows, availableDates]);

  const weekAgoRows = useMemo(() => {
    if (!weekAgoDate) return [];
    return allHistoricalRows[weekAgoDate] || [];
  }, [allHistoricalRows, weekAgoDate]);

  const weekAgoMetrics = useMemo(() => {
    return calculateSalesMetrics(weekAgoRows, excludeCashCustomers);
  }, [weekAgoRows, excludeCashCustomers]);

  // 2. Generate KPI Data Models for cards (Section 20)
  const kpiCards = useMemo<ExtendedKPIMetric[]>(() => {
    const makeKpi = (
      id: string,
      label: string,
      curr: number,
      comp: number | undefined,
      formatter: (v: number) => string,
      tooltip: string,
      reverseStatus: boolean = false,
      weekAgoComp: number | undefined = undefined
    ): ExtendedKPIMetric => {
      const diffAbs = comp !== undefined ? curr - comp : 0;
      const diffPct = comp !== undefined && comp !== 0 ? (diffAbs / comp) * 100 : 0;
      
      let dir: "up" | "down" | "neutral" = "neutral";
      if (diffAbs > 0.01) dir = "up";
      else if (diffAbs < -0.01) dir = "down";

      let status: "positive" | "negative" | "neutral" = "neutral";
      if (dir === "up") {
        status = reverseStatus ? "negative" : "positive";
      } else if (dir === "down") {
        status = reverseStatus ? "positive" : "negative";
      }

      // Week ago calculations
      let weekAgoDiffPercentage: number | undefined = undefined;
      let weekAgoDirection: "up" | "down" | "neutral" = "neutral";
      let weekAgoStatus: "positive" | "negative" | "neutral" = "neutral";

      if (weekAgoComp !== undefined) {
        const waDiffAbs = curr - weekAgoComp;
        weekAgoDiffPercentage = weekAgoComp !== 0 ? parseFloat(((waDiffAbs / weekAgoComp) * 100).toFixed(1)) : 0;

        if (waDiffAbs > 0.01) weekAgoDirection = "up";
        else if (waDiffAbs < -0.01) weekAgoDirection = "down";

        if (weekAgoDirection === "up") {
          weekAgoStatus = reverseStatus ? "negative" : "positive";
        } else if (weekAgoDirection === "down") {
          weekAgoStatus = reverseStatus ? "positive" : "negative";
        }
      }

      return {
        id,
        label,
        value: curr,
        formattedValue: formatter(curr),
        comparisonValue: comp,
        formattedComparisonValue: comp !== undefined ? formatter(comp) : undefined,
        diffAbsolute: parseFloat(diffAbs.toFixed(2)),
        diffPercentage: parseFloat(diffPct.toFixed(1)),
        direction: dir,
        status,
        tooltip,
        weekAgoValue: weekAgoComp,
        weekAgoDiffPercentage,
        weekAgoDirection,
        weekAgoStatus,
      };
    };

    return [
      makeKpi(
        "sales",
        "Omsætning (Sales)",
        currentMetrics.totalSales,
        comparisonMetrics.totalSales,
        formatCurrency,
        "Total omsætning i DKK baseret på faktiske salgsbeløb, ekskluderet pant/gebyrer.",
        false,
        weekAgoMetrics.totalSales
      ),
      makeKpi(
        "profit",
        "Bruttofortjeneste",
        currentMetrics.totalGrossProfit,
        comparisonMetrics.totalGrossProfit,
        formatCurrency,
        "Omsætning minus normaliseret kostpris (absolut værdi af kostbeløb).",
        false,
        weekAgoMetrics.totalGrossProfit
      ),
      makeKpi(
        "margin",
        "Dækningsgrad (Margin %)",
        currentMetrics.grossMarginPercentage,
        comparisonMetrics.grossMarginPercentage,
        formatPercentage,
        "Bruttofortjeneste divideret med omsætning i procent.",
        false,
        weekAgoMetrics.grossMarginPercentage
      ),
      makeKpi(
        "invoices",
        "Unikke Fakturaer",
        currentMetrics.uniqueInvoices,
        comparisonMetrics.uniqueInvoices,
        (v) => formatNumber(v, 0),
        "Antal unikke bilagsnumre.",
        false,
        weekAgoMetrics.uniqueInvoices
      ),
      makeKpi(
        "customers",
        "Kunder",
        currentMetrics.uniqueCustomers,
        comparisonMetrics.uniqueCustomers,
        (v) => formatNumber(v, 0),
        "Unikke kunde kildenumre.",
        false,
        weekAgoMetrics.uniqueCustomers
      ),
      makeKpi(
        "deliveries",
        "Leveringskunder",
        currentMetrics.deliveryCustomerCount,
        comparisonMetrics.deliveryCustomerCount,
        (v) => formatNumber(v, 0),
        "Kunder med registrerede Salgsleverance leveringsbilag.",
        false,
        weekAgoMetrics.deliveryCustomerCount
      ),
      makeKpi(
        "avg_invoice",
        "Gns. Fakturaværdi",
        currentMetrics.averageInvoiceValue,
        comparisonMetrics.averageInvoiceValue,
        formatCurrency,
        "Total omsætning divideret med antal unikke fakturaer.",
        false,
        weekAgoMetrics.averageInvoiceValue
      ),
      makeKpi(
        "avg_margin",
        "Vægtet Gns. DG %",
        currentMetrics.grossMarginPercentage, // standard weighted
        comparisonMetrics.grossMarginPercentage,
        formatPercentage,
        "Total bruttofortjeneste divideret med total omsætning.",
        false,
        weekAgoMetrics.grossMarginPercentage
      ),
    ];
  }, [currentMetrics, comparisonMetrics, weekAgoMetrics]);

  // side-by-side 4 dates metrics calculation
  const fourDatesMetrics = useMemo(() => {
    if (!compareFourDatesEnabled || !compareDates) return [];
    return compareDates.map((date) => {
      const rows = allHistoricalRows[date] || [];
      const metrics = calculateSalesMetrics(rows, excludeCashCustomers);
      return {
        date,
        hasData: rows.length > 0,
        metrics,
        weekday: getWeekdayLabel(date),
      };
    });
  }, [compareFourDatesEnabled, compareDates, allHistoricalRows, excludeCashCustomers]);

  // 3. Historical Daily Trends Data for Charts (Section 22)
  const chartData = useMemo(() => {
    // Collect last 10 available days chronologically
    const sortedDates = [...availableDates].sort((a, b) => a.localeCompare(b)).slice(-10);
    return sortedDates.map((date) => {
      const rows = allHistoricalRows[date] || [];
      const metrics = calculateSalesMetrics(rows, excludeCashCustomers);
      return {
        dateLabel: formatDate(date).substring(0, 5), // DD-MM format for chart
        fullDate: date,
        Omsætning: Math.round(metrics.totalSales),
        Fortjeneste: Math.round(metrics.totalGrossProfit),
        "DG_Procent": parseFloat(metrics.grossMarginPercentage.toFixed(1)),
      };
    });
  }, [availableDates, allHistoricalRows, excludeCashCustomers]);

  // Credit note rows calculation (kime ne kadar ne kreditnota yapilmis)
  const creditNoteRows = useMemo(() => {
    return currentRows.filter((r) => r.documentType === "Salgskreditnota");
  }, [currentRows]);

  // 4. Rankings Data
  const topCustomersData = useMemo(() => {
    const list = getTopCustomers(currentRows, 100, excludeCashCustomers);
    if (!custSearch) return list.slice(0, topCustLimit);
    const searchLower = custSearch.toLowerCase();
    return list
      .filter(
        (c) =>
          c.customerName.toLowerCase().includes(searchLower) ||
          c.customerNumber.toLowerCase().includes(searchLower)
      )
      .slice(0, topCustLimit);
  }, [currentRows, excludeCashCustomers, topCustLimit, custSearch]);

  const topProductsData = useMemo(() => {
    const list = getTopProducts(currentRows, 100);
    if (!prodSearch) return list.slice(0, 10);
    const searchLower = prodSearch.toLowerCase();
    return list
      .filter(
        (p) =>
          p.description.toLowerCase().includes(searchLower) ||
          p.itemNumber.toLowerCase().includes(searchLower)
      )
      .slice(0, 10);
  }, [currentRows, prodSearch]);

  // 5. Customer Specific Details Drawer Calculations
  const customerDetails = useMemo(() => {
    if (!selectedCustomer) return null;
    const cNum = selectedCustomer.customerNumber;
    
    // Transactions inside current day
    const transactions = currentRows.filter(
      (r) => r.customerNumber === cNum && !isExcludedItem(r.itemNumber, r.description)
    );

    // Calculate customer trend over past days
    const trend = [...availableDates]
      .sort((a, b) => a.localeCompare(b))
      .slice(-6)
      .map((date) => {
        const rows = allHistoricalRows[date] || [];
        const cRows = rows.filter((r) => r.customerNumber === cNum && !isExcludedItem(r.itemNumber, r.description));
        const sales = cRows.reduce((acc, curr) => acc + curr.salesAmount, 0);
        return {
          date: formatDate(date),
          sales: parseFloat(sales.toFixed(2)),
        };
      });

    // Top products purchased by this customer
    const prodPurchases: Record<string, { desc: string; qty: number; sales: number }> = {};
    transactions.forEach((t) => {
      const existing = prodPurchases[t.itemNumber] || { desc: t.description, qty: 0, sales: 0 };
      existing.qty += t.quantity;
      existing.sales += t.salesAmount;
      prodPurchases[t.itemNumber] = existing;
    });

    const topProds = Object.entries(prodPurchases)
      .map(([num, data]) => ({
        itemNumber: num,
        description: data.desc,
        quantity: data.qty,
        salesAmount: parseFloat(data.sales.toFixed(2)),
      }))
      .sort((a, b) => b.salesAmount - a.salesAmount)
      .slice(0, 5);

    return {
      transactions,
      trend,
      topProducts: topProds,
    };
  }, [selectedCustomer, currentRows, allHistoricalRows, availableDates]);

  // 6. Product Specific Details Drawer Calculations
  const productDetails = useMemo(() => {
    if (!selectedProduct) return null;
    const itemNum = selectedProduct.itemNumber;

    // Transactions inside current day
    const transactions = currentRows.filter(
      (r) => r.itemNumber === itemNum && !isExcludedItem(r.itemNumber, r.description)
    );

    // Calculate product trend over past days
    const trend = [...availableDates]
      .sort((a, b) => a.localeCompare(b))
      .slice(-6)
      .map((date) => {
        const rows = allHistoricalRows[date] || [];
        const pRows = rows.filter((r) => r.itemNumber === itemNum && !isExcludedItem(r.itemNumber, r.description));
        const sales = pRows.reduce((acc, curr) => acc + curr.salesAmount, 0);
        return {
          date: formatDate(date),
          sales: parseFloat(sales.toFixed(2)),
        };
      });

    // Top purchasing customers
    const customerPurchases: Record<string, { name: string; qty: number; sales: number }> = {};
    transactions.forEach((t) => {
      const existing = customerPurchases[t.customerNumber] || { name: t.customerName, qty: 0, sales: 0 };
      existing.qty += t.quantity;
      existing.sales += t.salesAmount;
      customerPurchases[t.customerNumber] = existing;
    });

    const topCusts = Object.entries(customerPurchases)
      .map(([num, data]) => ({
        customerNumber: num,
        customerName: data.name,
        quantity: data.qty,
        salesAmount: parseFloat(data.sales.toFixed(2)),
      }))
      .sort((a, b) => b.salesAmount - a.salesAmount)
      .slice(0, 5);

    return {
      transactions,
      trend,
      topCustomers: topCusts,
    };
  }, [selectedProduct, currentRows, allHistoricalRows, availableDates]);

  return (
    <div ref={containerRef} className="space-y-6 p-1 bg-slate-50/30 rounded-2xl">
      {/* Top Action and Branding Header Panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-brand-light rounded-lg">
            <span className="text-xl">📊</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Executive Overview</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Filtre og KPI'er for omsætning, margin og dækningsgrad mod {comparisonDateLabel}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
              {currentRows.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-3xs">
                  Aktiv dato: {getWeekdayLabel(currentRows[0]?.postingDate || "")}
                </span>
              )}
              {comparisonRows.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 font-semibold border border-slate-200">
                  Sammenlignet med: {getWeekdayLabel(comparisonRows[0]?.postingDate || "")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Button (Hidden in Print) */}
        <div className="no-print flex items-center gap-3">
          {pdfStatus && (
            <span className="text-xs font-semibold text-brand animate-pulse">
              {pdfStatus}
            </span>
          )}
          <button
            onClick={handleExportPDF}
            disabled={!!pdfStatus}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-lg transition shadow-2xs hover:shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Eksporter PDF</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side 4 Dato Sammenligning */}
      {compareFourDatesEnabled && fourDatesMetrics.length > 0 && (
        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖️</span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Side-om-side 4 Dato Sammenligning</h3>
                <p className="text-[11px] text-gray-500">Multivariat sammenligning af de 4 valgte forretningsdatoer</p>
              </div>
            </div>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Aktiv visning
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {fourDatesMetrics.map(({ date, hasData, metrics, weekday }, idx) => {
              if (!date) {
                return (
                  <div key={idx} className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-center text-xs text-gray-400 h-48">
                    Ingen dato valgt
                  </div>
                );
              }

              const isActive = currentRows.length > 0 && date === currentRows[0]?.postingDate;

              return (
                <div 
                  key={date} 
                  className={`border rounded-xl p-4 space-y-3 shadow-2xs transition hover:shadow-xs relative overflow-hidden ${
                    isActive
                      ? "bg-blue-50/20 border-blue-200 ring-1 ring-blue-100" 
                      : "bg-white border-gray-200"
                  }`}
                >
                  {/* Card Header */}
                  <div className="border-b border-gray-100 pb-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                        Dato {idx + 1}
                      </span>
                      {isActive && (
                        <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase animate-pulse">
                          Aktiv
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-gray-950 mt-0.5">
                      {formatDate(date)}
                    </h4>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {weekday}
                    </p>
                  </div>

                  {!hasData ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-xs">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mb-2"></div>
                      <span>Henter dagsdata...</span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Metric 1: Sales */}
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 block uppercase">
                          Omsætning (Sales)
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(metrics.totalSales)}
                        </span>
                      </div>

                      {/* Metric 2: Profit */}
                      <div>
                        <span className="text-[10px] font-semibold text-gray-400 block uppercase">
                          Bruttofortjeneste
                        </span>
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(metrics.totalGrossProfit)}
                        </span>
                      </div>

                      {/* Metric 3: Margin */}
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-semibold text-gray-400 uppercase mb-0.5">
                          <span>Dækningsgrad (DG %)</span>
                          <span className="font-bold text-gray-800">{formatPercentage(metrics.grossMarginPercentage)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200/40">
                          <div 
                            className={`h-full rounded-full ${
                              metrics.grossMarginPercentage >= 40 
                                ? "bg-emerald-500" 
                                : metrics.grossMarginPercentage >= 25 
                                ? "bg-blue-500" 
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, metrics.grossMarginPercentage))}%` }}
                          />
                        </div>
                      </div>

                      {/* Mini stats grid */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 text-center">
                        <div className="bg-gray-50/50 p-1.5 rounded-lg border border-gray-100">
                          <span className="text-[9px] text-gray-400 font-bold block uppercase">
                            Fakturaer
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {formatNumber(metrics.uniqueInvoices, 0)}
                          </span>
                        </div>
                        <div className="bg-gray-50/50 p-1.5 rounded-lg border border-gray-100">
                          <span className="text-[9px] text-gray-400 font-bold block uppercase">
                            Kunder
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {formatNumber(metrics.uniqueCustomers, 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. KPI Grid Dashboard Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const isUp = kpi.direction === "up";
          const isPositive = kpi.status === "positive";
          return (
            <div
              key={kpi.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-gray-300 transition-all duration-200 group relative"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-500 uppercase tracking-wider">
                  {kpi.label}
                </span>
                <div className="text-gray-300 hover:text-gray-500 cursor-help transition">
                  <Info className="h-4 w-4" />
                  <span className="invisible group-hover:visible absolute z-50 bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg max-w-xs bottom-full mb-2 left-1/2 transform -translate-x-1/2 font-normal normal-case leading-relaxed">
                    {kpi.tooltip}
                  </span>
                </div>
              </div>

              <div className="mt-2.5">
                <h3 className="text-xl font-bold tracking-tight text-gray-900 font-sans">
                  {kpi.formattedValue}
                </h3>
              </div>

              {kpi.comparisonValue !== undefined && (
                <div className="mt-2.5 flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-50">
                  <span className="text-gray-400 font-medium truncate max-w-[120px] sm:max-w-none">
                    vs. {comparisonDateLabel} {!compareFourDatesEnabled ? "(i går)" : ""}
                  </span>
                  <div className={`flex items-center gap-1 font-semibold ${
                    kpi.direction === "neutral"
                      ? "text-gray-500"
                      : isPositive
                      ? "text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded"
                      : "text-red-600 bg-red-50 px-1 py-0.5 rounded"
                  }`}>
                    {kpi.direction !== "neutral" && (
                      isUp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                    <span>
                      {isUp ? "+" : ""}
                      {kpi.diffPercentage}%
                    </span>
                  </div>
                </div>
              )}

              {!compareFourDatesEnabled && weekAgoDate && kpi.weekAgoValue !== undefined && (
                <div className="mt-1 flex items-center justify-between text-[11px] pt-1">
                  <span className="text-gray-400 font-medium truncate max-w-[120px] sm:max-w-none">
                    vs. {formatDate(weekAgoDate)} (1 uge)
                  </span>
                  {(() => {
                    const isWaUp = kpi.weekAgoDirection === "up";
                    const isWaPositive = kpi.weekAgoStatus === "positive";
                    return (
                      <div className={`flex items-center gap-1 font-semibold ${
                        kpi.weekAgoDirection === "neutral"
                          ? "text-gray-500"
                          : isWaPositive
                          ? "text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded"
                          : "text-red-600 bg-red-50 px-1 py-0.5 rounded"
                      }`}>
                        {kpi.weekAgoDirection !== "neutral" && (
                          isWaUp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                        <span>
                          {isWaUp ? "+" : ""}
                          {kpi.weekAgoDiffPercentage}%
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. Interactive Interactive Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Gross Profit Trend */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Historisk Omsætning & Fortjeneste (Sidste 10 Dage)</h3>
              <p className="text-xs text-gray-400 mt-0.5">Daglige oversigter over omsætningsniveauer og brutoindtjeninger</p>
            </div>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" />
                <ChartTooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), ""]}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      return `Dato: ${formatDate(payload[0].payload.fullDate)}`;
                    }
                    return label;
                  }}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
                <Area name="Omsætning" type="monotone" dataKey="Omsætning" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                <Area name="Fortjeneste" type="monotone" dataKey="Fortjeneste" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dækningsgrad DG % Trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">DG % Margin Udvikling</h3>
              <p className="text-xs text-gray-400 mt-0.5">Vægtet dækningsgrad dagsudvikling</p>
            </div>
            <Percent className="h-5 w-5 text-gray-400" />
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" domain={[0, "auto"]} />
                <ChartTooltip
                  formatter={(value: any) => [formatPercentage(Number(value)), "Dækningsgrad"]}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      return `Dato: ${formatDate(payload[0].payload.fullDate)}`;
                    }
                    return label;
                  }}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                />
                <Line name="DG %" type="monotone" dataKey="DG_Procent" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Rankings Layout Grid (Customers & Products) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Customers Panel */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-500" />
                Top Kunder (Omsætning)
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Kunder sorteret efter faktureret dagsomsætning</p>
            </div>
            {/* Limit controls */}
            <div className="flex items-center gap-2">
              <select
                value={topCustLimit}
                onChange={(e) => setTopCustLimit(Number(e.target.value))}
                className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-gray-50 focus:outline-none"
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
                <option value={20}>Top 20</option>
              </select>
            </div>
          </div>

          {/* Filtering options specific to ranking */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/50 p-2.5 rounded-lg text-xs justify-between">
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                placeholder="Filtrer kunder..."
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded pl-7 pr-3 py-1 bg-white focus:outline-none"
              />
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2" />
            </div>
            
            <label className="flex items-center gap-2 font-medium text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeCashCustomers}
                onChange={(e) => setExcludeCashCustomers(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Ekskluder kontantkunder (Kontant*)
            </label>
          </div>

          <div className="overflow-auto max-h-[500px] scrollbar-thin text-xs border border-gray-100 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                  <th className="p-3 text-center w-12">Rang</th>
                  <th className="p-3">Kunde</th>
                  <th className="p-3 text-right">Omsætning</th>
                  <th className="p-3 text-right">Fortjeneste</th>
                  <th className="p-3 text-right">DG %</th>
                  <th className="p-3 text-right">Andel</th>
                  <th className="p-3 text-center no-print">Vis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topCustomersData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      Ingen kunder matcher søgningen.
                    </td>
                  </tr>
                ) : (
                  topCustomersData.map((cust, idx) => (
                    <tr
                      key={cust.customerNumber}
                      onClick={() => setSelectedCustomer(cust)}
                      className="hover:bg-blue-50/30 transition cursor-pointer"
                    >
                      <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-800">{cust.customerName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{cust.customerNumber}</div>
                      </td>
                      <td className="p-3 text-right font-medium text-gray-800">{formatCurrency(cust.salesAmount)}</td>
                      <td className="p-3 text-right text-gray-500">{formatCurrency(cust.grossProfit)}</td>
                      <td className={`p-3 text-right font-semibold ${cust.grossMargin >= 20 ? "text-emerald-600" : cust.grossMargin <= 0 ? "text-red-600" : "text-gray-600"}`}>
                        {formatPercentage(cust.grossMargin)}
                      </td>
                      <td className="p-3 text-right text-gray-400">{formatPercentage(cust.shareOfTotalSales)}</td>
                      <td className="p-3 text-center no-print">
                        <button className="p-1 text-gray-400 hover:text-blue-600 transition">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products Panel */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4 text-indigo-500" />
                Top Produkter (Omsætning)
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Produkter sorteret efter dagligt salg</p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                placeholder="Filtrer produkter..."
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded pl-7 pr-3 py-1 bg-white focus:outline-none"
              />
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2" />
            </div>
          </div>

          <div className="overflow-auto max-h-[500px] scrollbar-thin text-xs border border-gray-100 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                  <th className="p-3 text-center w-12">Rang</th>
                  <th className="p-3">Produkt</th>
                  <th className="p-3 text-right">Mængde</th>
                  <th className="p-3 text-right">Omsætning</th>
                  <th className="p-3 text-right">Fortjeneste</th>
                  <th className="p-3 text-right">DG %</th>
                  <th className="p-3 text-right">Andel</th>
                  <th className="p-3 text-center no-print">Vis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topProductsData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400">
                      Ingen produkter fundet.
                    </td>
                  </tr>
                ) : (
                  topProductsData.map((prod, idx) => (
                    <tr
                      key={prod.itemNumber}
                      onClick={() => setSelectedProduct(prod)}
                      className="hover:bg-indigo-50/30 transition cursor-pointer"
                    >
                      <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-gray-800">{prod.description}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{prod.itemNumber}</div>
                      </td>
                      <td className="p-3 text-right text-gray-500 font-mono font-medium">{formatNumber(prod.quantity)}</td>
                      <td className="p-3 text-right font-medium text-gray-800">{formatCurrency(prod.salesAmount)}</td>
                      <td className="p-3 text-right text-gray-500">{formatCurrency(prod.grossProfit)}</td>
                      <td className={`p-3 text-right font-semibold ${prod.grossMargin >= 20 ? "text-emerald-600" : prod.grossMargin <= 0 ? "text-red-600" : "text-gray-600"}`}>
                        {formatPercentage(prod.grossMargin)}
                      </td>
                      <td className="p-3 text-right text-gray-400">{formatPercentage(prod.shareOfTotalSales)}</td>
                      <td className="p-3 text-center no-print">
                        <button className="p-1 text-gray-400 hover:text-indigo-600 transition">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Customer Detail Dialog/Modal (Section 23) */}
      {selectedCustomer && customerDetails && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-slate-50">
              <div>
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded">
                  Kundeoplysninger (Customer Details)
                </span>
                <h3 className="text-lg font-bold text-gray-900 mt-2">{selectedCustomer.customerName}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">Kundenr: {selectedCustomer.customerNumber}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Core metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Omsætning</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(selectedCustomer.salesAmount)}</p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Fortjeneste</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(selectedCustomer.grossProfit)}</p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Dækningsgrad</span>
                  <p className={`text-sm font-bold mt-1 ${selectedCustomer.grossMargin >= 20 ? "text-emerald-600" : "text-gray-900"}`}>
                    {formatPercentage(selectedCustomer.grossMargin)}
                  </p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Unikke Fakturaer</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{selectedCustomer.invoiceCount}</p>
                </div>
              </div>

              {/* Charts & Top lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Product Purchase summaries */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Top Købte Produkter i Dag</h4>
                  <div className="space-y-2">
                    {customerDetails.topProducts.map((tp) => (
                      <div key={tp.itemNumber} className="flex justify-between items-center border border-gray-50 rounded-lg p-2.5">
                        <div>
                          <div className="font-semibold text-gray-800">{tp.description}</div>
                          <div className="text-[10px] text-gray-400 font-mono">Varenr: {tp.itemNumber}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900">{formatCurrency(tp.salesAmount)}</div>
                          <div className="text-[10px] text-gray-400">{tp.quantity} stk</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend Graph */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Kunde Omsætningstrend</h4>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={customerDetails.trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#e2e8f0" />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#e2e8f0" />
                        <ChartTooltip formatter={(v: any) => [formatCurrency(Number(v)), "Salg"]} />
                        <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Transactions grid list */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Transaktionslinjer</h4>
                <div className="border border-gray-100 rounded-lg overflow-auto max-h-48 scrollbar-thin text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                      <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                        <th className="p-2">Bilagsnr.</th>
                        <th className="p-2">Varenr.</th>
                        <th className="p-2">Beskrivelse</th>
                        <th className="p-2 text-right">Antal</th>
                        <th className="p-2 text-right">Salgbeløb</th>
                        <th className="p-2 text-right">Kostbeløb</th>
                        <th className="p-2 text-right">Fortjeneste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {customerDetails.transactions.map((t, tIdx) => {
                        const rowProfit = t.salesAmount - Math.abs(t.costAmount);
                        return (
                          <tr key={tIdx} className="hover:bg-gray-50/50">
                            <td className="p-2 font-mono">{t.documentNumber}</td>
                            <td className="p-2 font-mono">{t.itemNumber}</td>
                            <td className="p-2 text-gray-700">{t.description}</td>
                            <td className="p-2 text-right font-mono">{t.quantity}</td>
                            <td className="p-2 text-right font-medium text-gray-800">{formatCurrency(t.salesAmount)}</td>
                            <td className="p-2 text-right text-gray-400">{formatCurrency(Math.abs(t.costAmount))}</td>
                            <td className={`p-2 text-right font-semibold ${rowProfit < 0 ? "text-red-500" : "text-emerald-600"}`}>
                              {formatCurrency(rowProfit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Notes (Kreditnota) Section at the Bottom */}
      {creditNoteRows.length > 0 && activeDocumentTypes.includes("Salgskreditnota") && (
        <div className="bg-white border border-rose-100 rounded-xl p-5 shadow-xs space-y-4 mt-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧾</span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Udstødte Kreditnotaer (Kreditnota Detaljer)</h3>
                <p className="text-[11px] text-gray-500">
                  Kreditnotaer registreret for den valgte dato – kime ne kadar ne kreditnota yapılmış
                </p>
              </div>
            </div>
            <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-100">
              {creditNoteRows.length} kreditnotalinjer
            </span>
          </div>

          <div className="overflow-auto max-h-[500px] scrollbar-thin text-xs border border-gray-100 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                  <th className="p-3">Kunde</th>
                  <th className="p-3">Bilagsnr.</th>
                  <th className="p-3">Produkt / Beskrivelse</th>
                  <th className="p-3 text-right">Antal</th>
                  <th className="p-3 text-right">Kostbeløb impact</th>
                  <th className="p-3 text-right">Beløb (Omsætning)</th>
                  <th className="p-3 text-right">Fortjeneste impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {creditNoteRows.map((row, idx) => {
                  const profit = row.salesAmount + Math.abs(row.costAmount);
                  return (
                    <tr key={idx} className="hover:bg-rose-50/10 transition">
                      <td className="p-3">
                        <div className="font-semibold text-gray-800">{row.customerName}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{row.customerNumber}</div>
                      </td>
                      <td className="p-3 font-mono text-gray-600 font-medium">
                        {row.documentNumber}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{row.description}</div>
                        <div className="text-[10px] text-gray-400 font-mono">Varenr: {row.itemNumber}</div>
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-gray-700">
                        {formatNumber(row.quantity)}
                      </td>
                      <td className="p-3 text-right text-gray-400 font-mono">
                        {formatCurrency(Math.abs(row.costAmount))}
                      </td>
                      <td className="p-3 text-right font-bold text-rose-600 font-mono">
                        {formatCurrency(row.salesAmount)}
                      </td>
                      <td className={`p-3 text-right font-semibold font-mono ${profit < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {formatCurrency(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Product Detail Dialog/Modal (Section 24) */}
      {selectedProduct && productDetails && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-indigo-50/30">
              <div>
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-1 rounded">
                  Produktoplysninger (Product Details)
                </span>
                <h3 className="text-lg font-bold text-gray-900 mt-2">{selectedProduct.description}</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">Varenr: {selectedProduct.itemNumber}</p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Core metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Mængde solgt</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{formatNumber(selectedProduct.quantity)}</p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Omsætning</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(selectedProduct.salesAmount)}</p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Fortjeneste</span>
                  <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(selectedProduct.grossProfit)}</p>
                </div>
                <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <span className="text-gray-400 font-medium">Dækningsgrad</span>
                  <p className={`text-sm font-bold mt-1 ${selectedProduct.grossMargin >= 20 ? "text-emerald-600" : "text-gray-900"}`}>
                    {formatPercentage(selectedProduct.grossMargin)}
                  </p>
                </div>
              </div>

              {/* Charts & Top lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Purchasing Customers */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Top Købende Kunder i Dag</h4>
                  <div className="space-y-2">
                    {productDetails.topCustomers.map((tc) => (
                      <div key={tc.customerNumber} className="flex justify-between items-center border border-gray-50 rounded-lg p-2.5">
                        <div>
                          <div className="font-semibold text-gray-800">{tc.customerName}</div>
                          <div className="text-[10px] text-gray-400 font-mono">Kundenr: {tc.customerNumber}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900">{formatCurrency(tc.salesAmount)}</div>
                          <div className="text-[10px] text-gray-400">{tc.quantity} stk</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend Graph */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Produkt Omsætningstrend</h4>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={productDetails.trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#e2e8f0" />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#e2e8f0" />
                        <ChartTooltip formatter={(v: any) => [formatCurrency(Number(v)), "Salg"]} />
                        <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Transactions list */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 border-b border-gray-100 pb-1.5">Transaktionslinjer</h4>
                <div className="border border-gray-100 rounded-lg overflow-auto max-h-48 scrollbar-thin text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 shadow-xs">
                      <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                        <th className="p-2">Dato</th>
                        <th className="p-2">Bilagsnr.</th>
                        <th className="p-2">Kunde</th>
                        <th className="p-2 text-right">Antal</th>
                        <th className="p-2 text-right">Salgbeløb</th>
                        <th className="p-2 text-right">Kostbeløb</th>
                        <th className="p-2 text-right">Fortjeneste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {productDetails.transactions.map((t, tIdx) => {
                        const rowProfit = t.salesAmount - Math.abs(t.costAmount);
                        return (
                          <tr key={tIdx} className="hover:bg-gray-50/50">
                            <td className="p-2 text-gray-500">{formatDate(t.postingDate)}</td>
                            <td className="p-2 font-mono">{t.documentNumber}</td>
                            <td className="p-2">
                              <div className="font-medium">{t.customerName}</div>
                              <div className="text-[10px] text-gray-400">{t.customerNumber}</div>
                            </td>
                            <td className="p-2 text-right font-mono">{t.quantity}</td>
                            <td className="p-2 text-right font-medium text-gray-800">{formatCurrency(t.salesAmount)}</td>
                            <td className="p-2 text-right text-gray-400">{formatCurrency(Math.abs(t.costAmount))}</td>
                            <td className={`p-2 text-right font-semibold ${rowProfit < 0 ? "text-red-500" : "text-emerald-600"}`}>
                              {formatCurrency(rowProfit)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
