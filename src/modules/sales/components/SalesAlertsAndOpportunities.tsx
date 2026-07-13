import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  AlertTriangle, 
  TrendingUp, 
  UserMinus, 
  UserPlus, 
  PackageX, 
  PackageCheck, 
  Download, 
  Info, 
  Search, 
  AlertCircle, 
  Sparkles, 
  Clock,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronDown,
  RefreshCw,
  MapPin,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SalesFilter } from "../../../shared/types.js";
import { formatDate } from "../../../shared/utils/format.js";
import { exportElementToPDF } from "../../../shared/utils/pdfExport.ts";

// Import types from the service definitions (or redefine locally if shared)
import { 
  SalesAlertsResponse, 
  CustomerMissingThisWeekAlert,
  CustomerInactiveTwoWeeksAlert,
  NewCustomerAlert,
  ProductMissingThisWeekAlert,
  ReactivatedProductAlert
} from "../../../../server/alerts/sales-alerts.service.js";

interface SalesAlertsProps {
  filter: SalesFilter;
}

type TabType = "missing-customers" | "inactive-customers" | "new-customers" | "missing-products" | "reactivated-products";

export default function SalesAlertsAndOpportunities({ filter }: SalesAlertsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    setPdfStatus("Generating PDF...");
    const dateStr = new Date().toISOString().split("T")[0];
    try {
      await exportElementToPDF(
        containerRef.current,
        `Report_Sales_Alerts_${dateStr}`,
        { 
          orientation: "portrait",
          title: "DANFOODS - ALERTS & MULIGHEDER",
          subtitle: `Rapportdato: ${filter.businessDate || dateStr}`
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

  const [data, setData] = useState<SalesAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("missing-customers");
  
  // Local Settings
  const [showSettings, setShowSettings] = useState(false);
  const [expectedDays, setExpectedDays] = useState(5);
  const [criticalThreshold, setCriticalThreshold] = useState(5000);
  const [excludeCash, setExcludeCash] = useState(true);

  // Search & Sort within active tab
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch alerts from API
  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      // Format query params
      const params = new URLSearchParams();
      if (filter.businessDate) {
        // We let the server derive the week from the selected businessDate, or we can compute it
        // The server-side API handles week parameter or derives it. Let's send the selected businessDate's week if possible
        // But the server's API default is week of latest worksheet if none is sent, or we can send businessDate
        params.append("businessDate", filter.businessDate);
      }
      
      // Pass other active filters so alerts are contextual
      if (filter.location && filter.location.length > 0) {
        params.append("location", filter.location.join(","));
      }
      if (filter.documentType && filter.documentType.length > 0) {
        params.append("documentType", filter.documentType.join(","));
      }
      if (filter.customerQuery) {
        params.append("customerQuery", filter.customerQuery);
      }
      if (filter.productQuery) {
        params.append("productQuery", filter.productQuery);
      }

      // Settings
      params.append("excludeCashCustomers", String(excludeCash));
      params.append("expectedBusinessDays", String(expectedDays));
      params.append("criticalRiskThreshold", String(criticalThreshold));

      const response = await fetch(`/api/sales/alerts?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Kunne ikke hente salgsalarmer");
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Der opstod en fejl under beregning af salgsalarmer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter, excludeCash, expectedDays, criticalThreshold]);

  // Reset search when changing tabs
  useEffect(() => {
    setSearchTerm("");
    setSortField("");
    setSortAsc(false);
  }, [activeTab]);

  // Utility to format Danish Currency
  const formatDKK = (v: number) => {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency: "DKK",
      maximumFractionDigits: 0
    }).format(v);
  };

  const formatPercent = (v: number) => {
    return new Intl.NumberFormat("da-DK", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(v / 100);
  };

  // Handle Sort Change
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Filter and Sort Data lists
  const filteredAndSortedList = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();

    const getFieldVal = (obj: any, path: string): any => {
      return path.split(".").reduce((acc, part) => acc && acc[part], obj);
    };

    const sortList = (list: any[]) => {
      if (!sortField) return list;
      return [...list].sort((a, b) => {
        let valA = getFieldVal(a, sortField);
        let valB = getFieldVal(b, sortField);

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    };

    switch (activeTab) {
      case "missing-customers": {
        const list = data.customersMissingThisWeek.filter(
          (c) =>
            c.customerNumber.toLowerCase().includes(term) ||
            c.customerName.toLowerCase().includes(term) ||
            c.mainPurchasedProduct.toLowerCase().includes(term)
        );
        return sortList(list);
      }
      case "inactive-customers": {
        const list = data.customersInactiveTwoWeeks.filter(
          (c) =>
            c.customerNumber.toLowerCase().includes(term) ||
            c.customerName.toLowerCase().includes(term) ||
            c.mostPurchasedProductHist.toLowerCase().includes(term)
        );
        return sortList(list);
      }
      case "new-customers": {
        const list = data.newCustomers.filter(
          (c) =>
            c.customerNumber.toLowerCase().includes(term) ||
            c.customerName.toLowerCase().includes(term) ||
            c.topPurchasedProduct.toLowerCase().includes(term)
        );
        return sortList(list);
      }
      case "missing-products": {
        const list = data.topProductsMissingThisWeek.filter(
          (p) =>
            p.itemNumber.toLowerCase().includes(term) ||
            p.productDescription.toLowerCase().includes(term) ||
            p.mainCustomer.toLowerCase().includes(term)
        );
        return sortList(list);
      }
      case "reactivated-products": {
        const list = data.reactivatedProducts.filter(
          (p) =>
            p.itemNumber.toLowerCase().includes(term) ||
            p.productDescription.toLowerCase().includes(term) ||
            p.mainCustomer.toLowerCase().includes(term)
        );
        return sortList(list);
      }
    }
  }, [data, activeTab, searchTerm, sortField, sortAsc]);

  // Export CSV Action
  const handleExportCSV = () => {
    if (!data || filteredAndSortedList.length === 0) return;

    let headers: string[] = [];
    let rows: any[] = [];
    let filePrefix = "";

    switch (activeTab) {
      case "missing-customers":
        headers = ["Kundenummer", "Kundenavn", "Sidste Uges Salg", "Sidste Uges Profit", "Dækningsgrad %", "Antal Fakturaer", "Sidste Købsdato", "Dage Siden Sidste Køb", "Salg i Risiko DKK", "Mest Købte Vare", "Lokation", "Alvorsgrad"];
        rows = (filteredAndSortedList as CustomerMissingThisWeekAlert[]).map(c => [
          c.customerNumber,
          c.customerName,
          c.prevWeekSales,
          c.prevWeekProfit,
          c.prevWeekMargin.toFixed(2),
          c.prevWeekInvoiceCount,
          c.lastPurchaseDate,
          c.daysSinceLastPurchase,
          c.estimatedSalesAtRisk,
          c.mainPurchasedProduct,
          c.mainLocation,
          c.severity
        ]);
        filePrefix = "Manglende_Kunder";
        break;

      case "inactive-customers":
        headers = ["Kundenummer", "Kundenavn", "Sidste Købsdato", "Inaktive Dage", "Sidste Aktive Uge", "Salgsbeløb Sidste Aktive Uge", "Hist. Gns Ugesalg", "Hist. Profit", "Hist. Margin %", "Salg i Risiko DKK", "Historisk Mest Købte Vare", "Alvorsgrad"];
        rows = (filteredAndSortedList as CustomerInactiveTwoWeeksAlert[]).map(c => [
          c.customerNumber,
          c.customerName,
          c.lastPurchaseDate,
          c.inactiveDays,
          c.lastActiveWeek,
          c.salesInLastActiveWeek,
          c.historicalAvgWeeklySales,
          c.historicalProfit,
          c.historicalMargin.toFixed(2),
          c.estimatedSalesAtRisk,
          c.mostPurchasedProductHist,
          c.severity
        ]);
        filePrefix = "Inaktive_Kunder_2_Uger";
        break;

      case "new-customers":
        headers = ["Kundenummer", "Kundenavn", "Første Købsdato", "Første Bilagsnr", "Første Lokation", "Ugens Salg", "Ugens Profit", "Ugens Margin %", "Antal Fakturaer", "Forskellige Produkter", "Top Vare", "Første Medarbejder"];
        rows = (filteredAndSortedList as NewCustomerAlert[]).map(c => [
          c.customerNumber,
          c.customerName,
          c.firstPurchaseDate,
          c.firstInvoiceDoc,
          c.firstLocation,
          c.currentWeekSales,
          c.currentWeekProfit,
          c.currentWeekMargin.toFixed(2),
          c.invoiceCount,
          c.differentProductsCount,
          c.topPurchasedProduct,
          c.firstEmployeeName
        ]);
        filePrefix = "Nye_Kunder";
        break;

      case "missing-products":
        headers = ["Rangering", "Varenummer", "Beskrivelse", "Salg Sidste Uge DKK", "Profit Sidste Uge DKK", "Dækningsgrad Sidste Uge %", "Sidste Salgsdato", "Hovedkunde", "Hovedlokation", "Salg i Risiko DKK"];
        rows = (filteredAndSortedList as ProductMissingThisWeekAlert[]).map(p => [
          p.rank,
          p.itemNumber,
          p.productDescription,
          p.prevWeekSales,
          p.prevWeekProfit,
          p.prevWeekMargin.toFixed(2),
          p.lastSaleDate,
          p.mainCustomer,
          p.mainLocation,
          p.estimatedSalesAtRisk
        ]);
        filePrefix = "Top_Varer_Uden_Salg";
        break;

      case "reactivated-products":
        headers = ["Rangering", "Varenummer", "Beskrivelse", "Salg Denne Uge DKK", "Profit Denne Uge DKK", "Dækningsgrad Denne Uge %", "Første Salgsdato", "Inaktive Dage", "Sidste Hist. Salgsdato", "Hovedkunde", "Hovedlokation"];
        rows = (filteredAndSortedList as ReactivatedProductAlert[]).map(p => [
          p.rank,
          p.itemNumber,
          p.productDescription,
          p.currentWeekSales,
          p.currentWeekProfit,
          p.currentWeekMargin.toFixed(2),
          p.firstSaleDate,
          p.inactiveDays,
          p.lastHistoricalSaleDate,
          p.mainCustomer,
          p.mainLocation
        ]);
        filePrefix = "Genaktiverede_Varer";
        break;
    }

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(val => {
        if (typeof val === "string") {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SalesAlerts_${filePrefix}_${data.week}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <RefreshCw className="h-10 w-10 text-blue-600 animate-spin mb-4" />
        <p className="text-sm font-semibold">Beregner salgsalarmer og identificerer muligheder...</p>
        <p className="text-xs text-gray-400 mt-1">Dette kan tage et kort øjeblik da historiske uger analyseres.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-12 border border-red-200 bg-red-50 text-red-800 rounded-xl p-6 shadow-xs text-center">
        <AlertTriangle className="h-10 w-10 text-red-600 mx-auto mb-3" />
        <h3 className="font-bold">Fejl i Salgsalarmer</h3>
        <p className="text-xs mt-1 text-gray-600">{error || "Kunne ikke indlæse data"}</p>
        <button
          onClick={fetchAlerts}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer"
        >
          Prøv igen
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-6 p-1 bg-slate-50/30 rounded-2xl">
      {/* Week and Completeness Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Analyseuge</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold uppercase ${
                data.weekStatus === "confirmed" 
                  ? "bg-green-50 text-green-700 border border-green-100" 
                  : "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse"
              }`}>
                <Clock className="h-3 w-3" />
                {data.weekStatus === "confirmed" ? "Bekræftet" : "Foreløbig"}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">{data.week}</h2>
          </div>
        </div>

        {/* Action Controls & Settings toggle */}
        <div className="no-print flex flex-wrap items-center gap-2">
          {pdfStatus && (
            <span className="text-xs font-semibold text-brand animate-pulse mr-2">
              {pdfStatus}
            </span>
          )}
          <button
            onClick={handleExportPDF}
            disabled={!!pdfStatus}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-brand hover:bg-brand-hover text-white rounded-lg transition cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Eksporter PDF
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold border rounded-lg transition cursor-pointer ${
              showSettings 
                ? "bg-blue-50 border-blue-200 text-blue-700" 
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Konfigurer grænser
          </button>
          
          <button
            onClick={fetchAlerts}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Opdater data
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-blue-600" />
              Salgskonfiguration & Alarmeringsgrænser
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Forventede hverdage i ugen:
                </label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={expectedDays}
                  onChange={(e) => setExpectedDays(Math.max(1, parseInt(e.target.value) || 5))}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
                <span className="text-3xs text-gray-400 mt-0.5 block">
                  Definerer hvornår ugen anses for fuldt importeret (Standard: 5).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Kritisk grænseværdi (DKK risiko):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={criticalThreshold}
                    onChange={(e) => setCriticalThreshold(Math.max(0, parseFloat(e.target.value) || 5000))}
                    className="w-full bg-white border border-gray-200 rounded-lg pl-3 pr-10 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-semibold text-gray-400">
                    DKK
                  </div>
                </div>
                <span className="text-3xs text-gray-400 mt-0.5 block">
                  Kunder over denne ugentlige risikoværdi markeres som "Kritisk".
                </span>
              </div>

              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer mt-1 select-none">
                  <input
                    type="checkbox"
                    checked={excludeCash}
                    onChange={(e) => setExcludeCash(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-gray-700">Udeluk kontantkunder</span>
                    <span className="text-3xs text-gray-400 block">
                      Springer kunder over der starter med "Kontant" i alarmer.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Week Completeness Warning */}
      {data.weekStatus === "preliminary" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex gap-3 shadow-2xs">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">Uge under opbygning ({data.importedDays} ud af {data.expectedDays} hverdage)</h4>
            <p className="text-xs text-amber-700 mt-1">
              Data for denne uge er ufuldstændig. De manglende kunder og produkter kan potentielt nå at foretage køb i de resterende dage. Alarmer bør tolkes med forbehold indtil alle ugens Dynamics NAV-filer er uploadet til Google Spreadsheet.
            </p>
          </div>
        </div>
      )}

      {/* Summary KPIs Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs relative overflow-hidden group hover:border-blue-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Manglende Kunder</span>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg group-hover:scale-105 transition">
              <UserMinus className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900">{data.summary.customersMissingCount}</div>
            <p className="text-2xs text-gray-400 mt-1">Købte sidste uge, men ikke denne uge</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs relative overflow-hidden group hover:border-blue-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inaktive Kunder</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:scale-105 transition">
              <Clock className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900">{data.summary.customersInactiveTwoWeeksCount}</div>
            <p className="text-2xs text-gray-400 mt-1">Ingen registrerede køb i 2 hele uger</p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs relative overflow-hidden group hover:border-blue-200 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nye Kunder</span>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg group-hover:scale-105 transition">
              <UserPlus className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900">{data.summary.newCustomersCount}</div>
            <p className="text-2xs text-gray-400 mt-1">
              Omsætning: <span className="font-semibold text-green-600">{formatDKK(data.summary.newCustomersSales)}</span> ({formatPercent(data.summary.newCustomerSalesShare * 100)})
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs relative overflow-hidden group hover:border-blue-200 transition bg-linear-to-br from-white to-blue-50/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Omsætning i Risiko</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-105 transition">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-blue-700">{formatDKK(data.summary.estimatedSalesAtRisk)}</div>
            <p className="text-2xs text-gray-400 mt-1">Estimeret ugentlig omsætningstab</p>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden">
        {/* Tab Headers */}
        <div className="no-print flex flex-wrap border-b border-gray-100 bg-gray-50/50 p-1.5 gap-1">
          <button
            onClick={() => setActiveTab("missing-customers")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "missing-customers"
                ? "bg-white text-gray-900 shadow-3xs border border-gray-200/50"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <UserMinus className="h-4 w-4 text-red-500" />
            Manglende Kunder
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-red-50 text-red-600">
              {data.summary.customersMissingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("inactive-customers")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "inactive-customers"
                ? "bg-white text-gray-900 shadow-3xs border border-gray-200/50"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Clock className="h-4 w-4 text-amber-500" />
            Inaktive Kunder (2 uger)
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 text-amber-600">
              {data.summary.customersInactiveTwoWeeksCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("new-customers")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "new-customers"
                ? "bg-white text-gray-900 shadow-3xs border border-gray-200/50"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <UserPlus className="h-4 w-4 text-green-500" />
            Nye Kunder
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-green-50 text-green-600">
              {data.summary.newCustomersCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("missing-products")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "missing-products"
                ? "bg-white text-gray-900 shadow-3xs border border-gray-200/50"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <PackageX className="h-4 w-4 text-rose-500" />
            Topvarer uden Salg
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-rose-50 text-rose-600">
              {data.summary.missingTopProductsCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("reactivated-products")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "reactivated-products"
                ? "bg-white text-gray-900 shadow-3xs border border-gray-200/50"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <PackageCheck className="h-4 w-4 text-blue-500" />
            Genaktiverede Varer
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-blue-50 text-blue-600">
              {data.summary.reactivatedProductsCount}
            </span>
          </button>
        </div>

        {/* Tab Actions & Search Filter */}
        <div className="no-print p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Søg i denne liste..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xs text-gray-400 font-medium">
              Viser {filteredAndSortedList.length} af {
                activeTab === "missing-customers" ? data.customersMissingThisWeek.length :
                activeTab === "inactive-customers" ? data.customersInactiveTwoWeeks.length :
                activeTab === "new-customers" ? data.newCustomers.length :
                activeTab === "missing-products" ? data.topProductsMissingThisWeek.length :
                data.reactivatedProducts.length
              } poster
            </span>
            <button
              onClick={handleExportCSV}
              disabled={filteredAndSortedList.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Eksporter tabel (CSV)
            </button>
          </div>
        </div>

        {/* Tab Detail View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* Missing Customers Table */}
            {activeTab === "missing-customers" && (
              <>
                <thead>
                  <tr className="bg-gray-50/50 text-3xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 select-none">
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerNumber")}>
                      Kundenr. <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerName")}>
                      Kundenavn <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekSales")}>
                      Salgsbeløb Sidste Uge <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekMargin")}>
                      Dækningsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekInvoiceCount")}>
                      Fakturaer <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("daysSinceLastPurchase")}>
                      Inaktivitet <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("estimatedSalesAtRisk")}>
                      Est. Omsætning i Risiko <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("mainPurchasedProduct")}>
                      Hovedvare <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort("severity")}>
                      Status <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-600">
                  {filteredAndSortedList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        <UserMinus className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        Ingen manglende kunder fundet for denne uge.
                      </td>
                    </tr>
                  ) : (
                    (filteredAndSortedList as CustomerMissingThisWeekAlert[]).map((c) => (
                      <tr key={c.customerNumber} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-mono text-gray-900">{c.customerNumber}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-xs truncate">{c.customerName}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatDKK(c.prevWeekSales)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{formatPercent(c.prevWeekMargin)}</td>
                        <td className="px-4 py-3 text-right">{c.prevWeekInvoiceCount}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-gray-900">{c.daysSinceLastPurchase} dage</div>
                          <div className="text-3xs text-gray-400 font-normal">Købte {c.lastPurchaseDate}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{formatDKK(c.estimatedSalesAtRisk)}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-2xs truncate font-normal">{c.mainPurchasedProduct}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${
                            c.severity === "critical" ? "bg-red-50 text-red-700" :
                            c.severity === "high" ? "bg-amber-50 text-amber-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>
                            {c.severity}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}

            {/* Inactive Customers Table */}
            {activeTab === "inactive-customers" && (
              <>
                <thead>
                  <tr className="bg-gray-50/50 text-3xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 select-none">
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerNumber")}>
                      Kundenr. <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerName")}>
                      Kundenavn <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("inactiveDays")}>
                      Inaktivitet <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("lastActiveWeek")}>
                      Sidste Aktive Uge <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("salesInLastActiveWeek")}>
                      Omsætning Sidste Køb <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("historicalAvgWeeklySales")}>
                      Hist. Gns Ugesalg <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("historicalMargin")}>
                      Dækningsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("estimatedSalesAtRisk")}>
                      Tab i Risiko <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort("severity")}>
                      Alvorsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-600">
                  {filteredAndSortedList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        Ingen 2-ugers inaktive kunder identificeret.
                      </td>
                    </tr>
                  ) : (
                    (filteredAndSortedList as CustomerInactiveTwoWeeksAlert[]).map((c) => (
                      <tr key={c.customerNumber} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-mono text-gray-900">{c.customerNumber}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-xs truncate">{c.customerName}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-gray-900 font-semibold text-red-600">{c.inactiveDays} dage</div>
                          <div className="text-3xs text-gray-400 font-normal">Sidste køb: {c.lastPurchaseDate}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-900">{c.lastActiveWeek}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatDKK(c.salesInLastActiveWeek)}</td>
                        <td className="px-4 py-3 text-right">{formatDKK(c.historicalAvgWeeklySales)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatPercent(c.historicalMargin)}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{formatDKK(c.estimatedSalesAtRisk)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider ${
                            c.severity === "critical" ? "bg-red-50 text-red-700" :
                            c.severity === "high" ? "bg-amber-50 text-amber-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>
                            {c.severity}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}

            {/* New Customers Table */}
            {activeTab === "new-customers" && (
              <>
                <thead>
                  <tr className="bg-gray-50/50 text-3xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 select-none">
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerNumber")}>
                      Kundenr. <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("customerName")}>
                      Kundenavn <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("firstPurchaseDate")}>
                      Første Køb <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekSales")}>
                      Omsætning Denne Uge <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekProfit")}>
                      Profit Denne Uge <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekMargin")}>
                      Dækningsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("differentProductsCount")}>
                      Unikke Varer <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("topPurchasedProduct")}>
                      Mest Købte Vare <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("firstEmployeeName")}>
                      Medarbejder <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-600">
                  {filteredAndSortedList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        <UserPlus className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        Ingen nye kunder oprettet i denne uge.
                      </td>
                    </tr>
                  ) : (
                    (filteredAndSortedList as NewCustomerAlert[]).map((c) => (
                      <tr key={c.customerNumber} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 font-mono text-gray-900">{c.customerNumber}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-xs truncate">{c.customerName}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 font-bold text-green-600">{c.firstPurchaseDate}</div>
                          <div className="text-3xs text-gray-400 font-normal">Bilag: {c.firstInvoiceDoc}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatDKK(c.currentWeekSales)}</td>
                        <td className="px-4 py-3 text-right text-emerald-700">{formatDKK(c.currentWeekProfit)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{formatPercent(c.currentWeekMargin)}</td>
                        <td className="px-4 py-3 text-right">{c.differentProductsCount}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-xs truncate font-normal">{c.topPurchasedProduct}</td>
                        <td className="px-4 py-3 text-gray-500 font-normal">{c.firstEmployeeName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}

            {/* Top Products Missing Table */}
            {activeTab === "missing-products" && (
              <>
                <thead>
                  <tr className="bg-gray-50/50 text-3xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 select-none">
                    <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort("rank")}>
                      Rank <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("itemNumber")}>
                      Varenr. <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("productDescription")}>
                      Beskrivelse <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekSales")}>
                      Salgsbeløb Sidste Uge <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekMargin")}>
                      Dækningsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("prevWeekCustomerCount")}>
                      Kunder <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("lastSaleDate")}>
                      Sidste Salgsdato <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("mainCustomer")}>
                      Hovedkunde <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("mainLocation")}>
                      Hovedlokation <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("estimatedSalesAtRisk")}>
                      Risikobeløb <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-600">
                  {filteredAndSortedList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-gray-400">
                        <PackageX className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        Ingen manglende top produkter fundet for denne uge.
                      </td>
                    </tr>
                  ) : (
                    (filteredAndSortedList as ProductMissingThisWeekAlert[]).map((p) => (
                      <tr key={p.itemNumber} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{p.rank}</td>
                        <td className="px-4 py-3 font-mono text-gray-900">{p.itemNumber}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-xs truncate">{p.productDescription}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatDKK(p.prevWeekSales)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatPercent(p.prevWeekMargin)}</td>
                        <td className="px-4 py-3 text-right">{p.prevWeekCustomerCount}</td>
                        <td className="px-4 py-3 text-right">{p.lastSaleDate}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate font-normal">{p.mainCustomer}</td>
                        <td className="px-4 py-3 text-gray-400 font-normal">{p.mainLocation}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{formatDKK(p.estimatedSalesAtRisk)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}

            {/* Reactivated Products Table */}
            {activeTab === "reactivated-products" && (
              <>
                <thead>
                  <tr className="bg-gray-50/50 text-3xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 select-none">
                    <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-50" onClick={() => handleSort("rank")}>
                      Rank <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("itemNumber")}>
                      Varenr. <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("productDescription")}>
                      Beskrivelse <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekSales")}>
                      Salgsbeløb Ugens Køb <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekMargin")}>
                      Dækningsgrad <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("currentWeekCustomerCount")}>
                      Kunder <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("firstSaleDate")}>
                      Reaktivering <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort("inactiveDays")}>
                      Inaktivitet <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("mainCustomer")}>
                      Hovedkunde <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => handleSort("mainLocation")}>
                      Lokation <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-600">
                  {filteredAndSortedList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-gray-400">
                        <PackageCheck className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        Ingen genaktiverede varer identificeret i denne uge.
                      </td>
                    </tr>
                  ) : (
                    (filteredAndSortedList as ReactivatedProductAlert[]).map((p) => (
                      <tr key={p.itemNumber} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{p.rank}</td>
                        <td className="px-4 py-3 font-mono text-gray-900">{p.itemNumber}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 max-w-xs truncate">{p.productDescription}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatDKK(p.currentWeekSales)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatPercent(p.currentWeekMargin)}</td>
                        <td className="px-4 py-3 text-right">{p.currentWeekCustomerCount}</td>
                        <td className="px-4 py-3 text-green-600 font-bold">{p.firstSaleDate}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-gray-900 font-semibold">{p.inactiveDays} dage</div>
                          <div className="text-3xs text-gray-400 font-normal">Sidst solgt: {p.lastHistoricalSaleDate}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate font-normal">{p.mainCustomer}</td>
                        <td className="px-4 py-3 text-gray-400 font-normal">{p.mainLocation}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            )}
          </table>
        </div>

        {/* Tab Explainer Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-start gap-2.5">
          <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-3xs text-gray-500 leading-relaxed">
            {activeTab === "missing-customers" && "Kunder, der har foretaget et køb i den foregående kalenderuge, men som ikke har nogen registrerede køb i den aktuelle uge. Omsætning i risiko beregnes som et gennemsnit af kundens ugentlige køb de seneste 4 afsluttede uger."}
            {activeTab === "inactive-customers" && "Kunder, som tidligere har været aktive, men som ikke har købt noget hverken i denne uge eller den forrige. Tab i risiko er baseret på kundens gennemsnitlige historiske omsætning."}
            {activeTab === "new-customers" && "Kunder med gyldige køb i den aktuelle uge, som aldrig tidligere har optrådt i systemet før den valgte uges start."}
            {activeTab === "missing-products" && "Varer, der var blandt de mest solgte i den forrige uge, men som slet ikke er blevet solgt i denne uge. Rangeret efter omsætning i forrige uge."}
            {activeTab === "reactivated-products" && "Produkter, der er blevet solgt i denne uge efter at have været inaktive i de foregående 2 uger, men som historisk set har været solgt før inaktivitetsperioden."}
          </p>
        </div>
      </div>
    </div>
  );
}
