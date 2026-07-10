import React, { useState, useMemo, useRef } from "react";
import { 
  AlertOctagon, 
  TrendingDown, 
  FileText, 
  Users, 
  ShoppingBag, 
  Download, 
  ArrowUpDown, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  AlertTriangle, 
  Eye, 
  HelpCircle,
  Maximize2,
  Minimize2
} from "lucide-react";
import { SalesRawRow, SalesWithoutProfitRow } from "../../../shared/types.js";
import { formatCurrency, formatDate, formatNumber, formatPercentage } from "../../../shared/utils/format.js";
import { getSalesWithoutProfit, isExcludedItem } from "../calculations.js";
import { exportElementToPDF } from "../../../shared/utils/pdfExport.ts";

interface SalesWithoutProfitProps {
  currentRows: SalesRawRow[];
  filterLocation: string[];
}

export default function SalesWithoutProfit({
  currentRows,
  filterLocation,
}: SalesWithoutProfitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    setPdfStatus("Forbereder PDF...");
    try {
      await exportElementToPDF(
        containerRef.current,
        `danfoods_salg_uden_fortjeneste_${new Date().toISOString().split("T")[0]}`,
        { orientation: "landscape" },
        (status) => setPdfStatus(status)
      );
      setPdfStatus(null);
    } catch (err) {
      setPdfStatus("Fejl under eksport");
      setTimeout(() => setPdfStatus(null), 3000);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"products" | "customers" | "flat">("products");
  
  // Collapsible Groups States
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Pagination & Sorting States for flat view
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortField, setSortField] = useState<keyof SalesWithoutProfitRow>("lossAmount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Sorting for Product tab
  const [prodSortField, setProdSortField] = useState<"itemNumber" | "quantity" | "salesAmount" | "costAmount" | "profit">("profit");
  const [prodSortDirection, setProdSortDirection] = useState<"asc" | "desc">("asc"); // asc by default to show biggest loss (most negative)

  // Sorting for Customer tab
  const [custSortField, setCustSortField] = useState<"customerName" | "quantity" | "salesUnitPrice" | "costUnitPrice" | "profitMargin">("profitMargin");
  const [custSortDirection, setCustSortDirection] = useState<"asc" | "desc">("asc"); // asc by default to show lowest/most negative margin

  // 1. Calculate All Sales Without Profit lines
  const rawProfitlessRows = useMemo(() => {
    return getSalesWithoutProfit(currentRows);
  }, [currentRows]);

  // 2. Apply Location Filter to raw lines
  const filteredRawRows = useMemo(() => {
    let result = [...rawProfitlessRows];
    if (filterLocation.length > 0) {
      result = result.filter((r) => filterLocation.includes(r.locationCode));
    }
    return result;
  }, [rawProfitlessRows, filterLocation]);

  // 3. Flat View data (Apply severity, search, sorting)
  const filteredFlatRows = useMemo(() => {
    let result = [...filteredRawRows];

    // Severity Filter
    if (severityFilter !== "all") {
      result = result.filter((r) => r.severity === severityFilter);
    }

    // Search Term Filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.description.toLowerCase().includes(q) ||
          r.itemNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.customerNumber.toLowerCase().includes(q) ||
          r.documentNumber.toLowerCase().includes(q)
      );
    }

    // Apply Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === "string") {
        return sortDirection === "asc"
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      } else {
        return sortDirection === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [filteredRawRows, severityFilter, searchTerm, sortField, sortDirection]);

  // 4. Calculate Summary Cards metrics
  const summaryMetrics = useMemo(() => {
    let totalLoss = 0;
    const uniqueDocs = new Set<string>();
    const uniqueCusts = new Set<string>();
    const uniqueProds = new Set<string>();
    let largestLoss = 0;

    filteredRawRows.forEach((row) => {
      totalLoss += row.lossAmount;
      uniqueDocs.add(row.documentNumber);
      uniqueCusts.add(row.customerNumber);
      uniqueProds.add(row.itemNumber);
      if (row.lossAmount > largestLoss) {
        largestLoss = row.lossAmount;
      }
    });

    return {
      totalLoss,
      lineCount: filteredRawRows.length,
      docCount: uniqueDocs.size,
      custCount: uniqueCusts.size,
      prodCount: uniqueProds.size,
      largestLoss,
    };
  }, [filteredRawRows]);

  // 5. Product Grouping View
  const productGroups = useMemo(() => {
    const groups: Record<string, {
      itemNumber: string;
      description: string;
      quantity: number;
      salesAmount: number;
      costAmount: number;
      profit: number;
      items: {
        customerName: string;
        customerNumber: string;
        quantity: number;
        salesAmount: number;
        costAmount: number;
        profit: number;
      }[];
    }> = {};

    filteredRawRows.forEach((row) => {
      const key = row.itemNumber;
      if (!groups[key]) {
        groups[key] = {
          itemNumber: row.itemNumber,
          description: row.description,
          quantity: 0,
          salesAmount: 0,
          costAmount: 0,
          profit: 0,
          items: []
        };
      }

      const group = groups[key];
      group.quantity += row.quantity;
      group.salesAmount += row.salesAmount;
      group.costAmount += row.costAmount;
      group.profit += row.grossProfit; // row.grossProfit is negative/zero
      
      group.items.push({
        customerName: row.customerName,
        customerNumber: row.customerNumber,
        quantity: row.quantity,
        salesAmount: row.salesAmount,
        costAmount: row.costAmount,
        profit: row.grossProfit
      });
    });

    // Convert to array
    const list = Object.values(groups);

    // Apply sorting to products
    list.sort((a, b) => {
      let multiplier = prodSortDirection === "asc" ? 1 : -1;
      if (prodSortField === "itemNumber") {
        return multiplier * a.description.localeCompare(b.description);
      } else {
        return multiplier * (a[prodSortField] - b[prodSortField]);
      }
    });

    return list;
  }, [filteredRawRows, prodSortField, prodSortDirection]);

  // Apply search to product groups
  const searchedProductGroups = useMemo(() => {
    let result = [...productGroups];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (g) =>
          g.itemNumber.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.items.some(
            (item) =>
              item.customerName.toLowerCase().includes(q) ||
              item.customerNumber.toLowerCase().includes(q)
          )
      );
    }
    return result;
  }, [productGroups, searchTerm]);

  // 6. Customer Grouping View (Düşük Kârlı Müşteriler)
  const customerGroups = useMemo(() => {
    const groups: Record<string, {
      customerNumber: string;
      customerName: string;
      quantity: number;
      salesAmount: number;
      costAmount: number;
      profit: number;
      profitMargin: number;
      items: {
        itemNumber: string;
        description: string;
        quantity: number;
        salesAmount: number;
        costAmount: number;
        profit: number;
        profitMargin: number;
      }[];
    }> = {};

    currentRows.forEach((row) => {
      if (row.documentType !== "Faktura" && row.documentType !== "Salgsfaktura") return;
      if (isExcludedItem(row.itemNumber, row.description)) return;
      
      // Apply Location filter to customer rows
      if (filterLocation.length > 0 && !filterLocation.includes(row.locationCode)) {
        return;
      }

      const custKey = row.customerNumber || "KONTANT";
      if (!groups[custKey]) {
        groups[custKey] = {
          customerNumber: row.customerNumber,
          customerName: row.customerName,
          quantity: 0,
          salesAmount: 0,
          costAmount: 0,
          profit: 0,
          profitMargin: 0,
          items: []
        };
      }

      const group = groups[custKey];
      const rowCost = Math.abs(row.costAmount);
      const rowProfit = row.salesAmount - rowCost;

      group.quantity += row.quantity;
      group.salesAmount += row.salesAmount;
      group.costAmount += rowCost;
      group.profit += rowProfit;

      // Inner item aggregation
      const itemKey = row.itemNumber;
      const existingItem = group.items.find((i) => i.itemNumber === itemKey);
      if (existingItem) {
        existingItem.quantity += row.quantity;
        existingItem.salesAmount += row.salesAmount;
        existingItem.costAmount += rowCost;
        existingItem.profit += rowProfit;
      } else {
        group.items.push({
          itemNumber: row.itemNumber,
          description: row.description,
          quantity: row.quantity,
          salesAmount: row.salesAmount,
          costAmount: rowCost,
          profit: rowProfit,
          profitMargin: 0
        });
      }
    });

    // Calculate margins and filter
    const list = Object.values(groups)
      .map((g) => {
        g.profitMargin = g.salesAmount !== 0 ? (g.profit / g.salesAmount) * 100 : 0;
        
        g.items = g.items.map((item) => {
          item.profitMargin = item.salesAmount !== 0 ? (item.profit / item.salesAmount) * 100 : 0;
          return item;
        }).sort((a, b) => a.profitMargin - b.profitMargin); // Worst margin items first

        return g;
      })
      // Only keep customers with low margins (<= 15%) or that contain at least one unprofitable product
      .filter((g) => g.profitMargin <= 15 || g.items.some((item) => item.profitMargin <= 0));

    // Apply sorting to customers
    list.sort((a, b) => {
      let multiplier = custSortDirection === "asc" ? 1 : -1;
      
      if (custSortField === "customerName") {
        return multiplier * a.customerName.localeCompare(b.customerName);
      } else if (custSortField === "salesUnitPrice") {
        const priceA = a.quantity !== 0 ? a.salesAmount / a.quantity : 0;
        const priceB = b.quantity !== 0 ? b.salesAmount / b.quantity : 0;
        return multiplier * (priceA - priceB);
      } else if (custSortField === "costUnitPrice") {
        const costA = a.quantity !== 0 ? a.costAmount / a.quantity : 0;
        const costB = b.quantity !== 0 ? b.costAmount / b.quantity : 0;
        return multiplier * (costA - costB);
      } else {
        return multiplier * (a[custSortField] - b[custSortField]);
      }
    });

    return list;
  }, [currentRows, filterLocation, custSortField, custSortDirection]);

  // Apply search to customer groups
  const searchedCustomerGroups = useMemo(() => {
    let result = [...customerGroups];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (g) =>
          g.customerName.toLowerCase().includes(q) ||
          g.customerNumber.toLowerCase().includes(q) ||
          g.items.some(
            (item) =>
              item.description.toLowerCase().includes(q) ||
              item.itemNumber.toLowerCase().includes(q)
          )
      );
    }
    return result;
  }, [customerGroups, searchTerm]);

  // Expand / Collapse All Helpers
  const handleExpandAllProducts = () => {
    setExpandedProducts(new Set(searchedProductGroups.map((g) => g.itemNumber)));
  };

  const handleCollapseAllProducts = () => {
    setExpandedProducts(new Set());
  };

  const handleExpandAllCustomers = () => {
    setExpandedCustomers(new Set(searchedCustomerGroups.map((g) => g.customerNumber)));
  };

  const handleCollapseAllCustomers = () => {
    setExpandedCustomers(new Set());
  };

  // Toggle Single Row
  const toggleProduct = (itemNumber: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(itemNumber)) {
        next.delete(itemNumber);
      } else {
        next.add(itemNumber);
      }
      return next;
    });
  };

  const toggleCustomer = (customerNumber: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerNumber)) {
        next.delete(customerNumber);
      } else {
        next.add(customerNumber);
      }
      return next;
    });
  };

  // Sort Triggers
  const handleSortFlat = (field: keyof SalesWithoutProfitRow) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const handleSortProd = (field: typeof prodSortField) => {
    if (prodSortField === field) {
      setProdSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setProdSortField(field);
      setProdSortDirection(field === "itemNumber" ? "asc" : "desc");
    }
  };

  const handleSortCust = (field: typeof custSortField) => {
    if (custSortField === field) {
      setCustSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setCustSortField(field);
      setCustSortDirection(field === "customerName" ? "asc" : "desc");
    }
  };

  // Flat View Pagination
  const paginatedFlatRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredFlatRows.slice(startIndex, startIndex + pageSize);
  }, [filteredFlatRows, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredFlatRows.length / pageSize) || 1;

  // Export CSV
  const exportCSV = () => {
    const headers = [
      "Dato",
      "Bilagsnummer",
      "Kundenummer",
      "Kundenavn",
      "Varenummer",
      "Beskrivelse",
      "Lokation",
      "Antal",
      "Salgsbeløb",
      "Kostbeløb",
      "Brutto profit",
      "Tab",
      "Margin %"
    ];

    const csvContent = [
      headers.join(";"),
      ...filteredRawRows.map((r) =>
        [
          r.date,
          r.documentNumber,
          r.customerNumber,
          `"${r.customerName.replace(/"/g, '""')}"`,
          r.itemNumber,
          `"${r.description.replace(/"/g, '""')}"`,
          r.locationCode,
          r.quantity,
          r.salesAmount,
          r.costAmount,
          r.grossProfit,
          r.lossAmount,
          r.grossMargin,
        ].join(";")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Salg_uden_fortjeneste_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div ref={containerRef} className="space-y-6 p-1 bg-slate-50/30 rounded-2xl" id="sales-without-profit-module">
      {/* Overview Intro Banner */}
      <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 text-xs text-amber-950 flex items-start gap-3">
        <AlertOctagon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" id="alert-octagon-icon" />
        <div>
          <h4 className="font-semibold text-sm">Formål: Salg uden fortjeneste (Unprofitable & Low Margin Sales)</h4>
          <p className="mt-1 leading-relaxed">
            Denne rapport identificerer produkter solgt med negativ dækningsgrad, samt B2B-kunder med kritisk lav dækningsgrad (Margin ≤ 15%). 
            Brug fanebladene nedenfor til at skifte mellem <strong>Varer (Produkter)</strong> og <strong>Kunder (Kunder)</strong> som vist i det oprindelige system.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4" id="metrics-summary-grid">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Samlet Tab (Loss)</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatCurrency(summaryMetrics.totalLoss)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Under kostpris i alt</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Berørte Linjer</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.lineCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Salgslinjer med tab</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Fakturaer</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.docCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Berørte bilagsnumre</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tabskunder</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.custCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Unikke tabsgivende kunder</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tabsprodukter</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.prodCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Tabsramte varekoder</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Største Enkelt-Tab</span>
          <h3 className="text-base font-bold text-gray-900 mt-1">{formatCurrency(summaryMetrics.largestLoss)}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Maks. tab på én række</p>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="no-print flex border-b border-gray-200 bg-white p-1 rounded-xl shadow-xs" id="navigation-tabs-container">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer ${
            activeTab === "products"
              ? "bg-sky-50 text-sky-800 shadow-2xs border border-sky-200/40"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
          id="tab-products-trigger"
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShoppingBag className="h-4 w-4" />
            Varer (Zararlı Ürünler)
            <span className="ml-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-sky-100 text-sky-700">
              {productGroups.length}
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("customers")}
          className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer ${
            activeTab === "customers"
              ? "bg-emerald-50 text-emerald-800 shadow-2xs border border-emerald-200/40"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
          id="tab-customers-trigger"
        >
          <div className="flex items-center justify-center gap-1.5">
            <Users className="h-4 w-4" />
            Kunder (Düşük Kârlı Müşteriler)
            <span className="ml-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-700">
              {customerGroups.length}
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("flat")}
          className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer ${
            activeTab === "flat"
              ? "bg-gray-100 text-gray-800 shadow-2xs border border-gray-200"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
          id="tab-flat-trigger"
        >
          <div className="flex items-center justify-center gap-1.5">
            <FileText className="h-4 w-4" />
            Rå Transaktioner
            <span className="ml-1 px-2 py-0.5 text-[9px] font-bold rounded-full bg-gray-200 text-gray-700">
              {filteredRawRows.length}
            </span>
          </div>
        </button>
      </div>

      {/* Search and Action Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="search-action-bar">
        <div className="no-print flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:max-w-xs text-xs">
            <input
              type="text"
              placeholder={
                activeTab === "products" 
                  ? "Søg efter varenummer eller beskrivelse..." 
                  : activeTab === "customers" 
                    ? "Søg efter kundenavn eller nummer..."
                    : "Søg i flad transaktionsliste..."
              }
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 bg-gray-50/30 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
              id="search-input"
            />
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Severity selector (only for Flat view) */}
          {activeTab === "flat" && (
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
              id="severity-selector"
            >
              <option value="all">Alvorlighed: Alle niveauer</option>
              <option value="critical">🔴 Kritiske tab (&gt; 150 kr.)</option>
              <option value="loss">🟠 Normale tab</option>
              <option value="zero">⚪ Nulfortjeneste (0 kr.)</option>
            </select>
          )}

          {/* Expand/Collapse All buttons (for Grouped Views) */}
          {activeTab === "products" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExpandAllProducts}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition cursor-pointer"
                id="btn-expand-all-products"
              >
                <Maximize2 className="h-3 w-3" /> Fold alle ud
              </button>
              <button
                onClick={handleCollapseAllProducts}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition cursor-pointer"
                id="btn-collapse-all-products"
              >
                <Minimize2 className="h-3 w-3" /> Fold alle sammen
              </button>
            </div>
          )}

          {activeTab === "customers" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExpandAllCustomers}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition cursor-pointer"
                id="btn-expand-all-customers"
              >
                <Maximize2 className="h-3 w-3" /> Fold alle ud
              </button>
              <button
                onClick={handleCollapseAllCustomers}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition cursor-pointer"
                id="btn-collapse-all-customers"
              >
                <Minimize2 className="h-3 w-3" /> Fold alle sammen
              </button>
            </div>
          )}
        </div>

        {/* Export action */}
        <div className="no-print flex items-center gap-2">
          {pdfStatus && (
            <span className="text-xs font-semibold text-brand animate-pulse mr-2">
              {pdfStatus}
            </span>
          )}
          <button
            onClick={handleExportPDF}
            disabled={!!pdfStatus}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg transition shrink-0 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            Eksporter PDF
          </button>
          
          <button
            onClick={exportCSV}
            disabled={filteredRawRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            id="btn-export-csv"
          >
            <Download className="h-3.5 w-3.5 text-gray-500" />
            Eksporter CSV
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === "products" && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden text-xs" id="products-tab-content">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-gray-200 font-semibold text-gray-700">
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortProd("itemNumber")}>
                    <div className="flex items-center gap-1.5">Varer <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[100px]" onClick={() => handleSortProd("quantity")}>
                    <div className="flex items-center justify-end gap-1.5">Antal <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortProd("salesAmount")}>
                    <div className="flex items-center justify-end gap-1.5">Salgsbeløb <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortProd("costAmount")}>
                    <div className="flex items-center justify-end gap-1.5">Kostbeløb <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortProd("profit")}>
                    <div className="flex items-center justify-end gap-1.5">Profit <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchedProductGroups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-400">
                      Ingen tabsgivende varer fundet for de valgte filtre.
                    </td>
                  </tr>
                ) : (
                  searchedProductGroups.map((group) => {
                    const isExpanded = expandedProducts.has(group.itemNumber);
                    return (
                      <React.Fragment key={group.itemNumber}>
                        {/* Parent Product Row */}
                        <tr 
                          onClick={() => toggleProduct(group.itemNumber)}
                          className="bg-sky-50/50 hover:bg-sky-100/60 transition duration-150 font-bold text-slate-800 cursor-pointer select-none border-b border-sky-100"
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-sky-700 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-sky-600 shrink-0" />
                              )}
                              <span className="font-mono text-sky-900 bg-sky-100 px-2 py-0.5 rounded text-[10px]">{group.itemNumber}</span>
                              <span className="truncate max-w-[400px]">{group.description}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono">{formatNumber(group.quantity, 2)}</td>
                          <td className="p-3 text-right">{formatCurrency(group.salesAmount)}</td>
                          <td className="p-3 text-right">{formatCurrency(group.costAmount)}</td>
                          <td className="p-3 text-right text-red-600">{formatCurrency(group.profit)}</td>
                        </tr>

                        {/* Child Customer Breakdown Rows */}
                        {isExpanded && (
                          <>
                            {group.items.map((child, idx) => (
                              <tr 
                                key={`${group.itemNumber}-child-${idx}`}
                                className="bg-white hover:bg-slate-50/50 transition duration-150 text-slate-600 border-b border-gray-50"
                              >
                                <td className="p-2.5 pl-10">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                    <span className="font-mono text-[10px] text-gray-400">{child.customerNumber}</span>
                                    <span className="font-semibold text-gray-700">{child.customerName}</span>
                                  </div>
                                </td>
                                <td className="p-2.5 text-right font-mono text-gray-500">{formatNumber(child.quantity, 2)}</td>
                                <td className="p-2.5 text-right text-gray-500">{formatCurrency(child.salesAmount)}</td>
                                <td className="p-2.5 text-right text-gray-500">{formatCurrency(child.costAmount)}</td>
                                <td className="p-2.5 text-right font-semibold text-red-500">{formatCurrency(child.profit)}</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden text-xs" id="customers-tab-content">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-gray-200 font-semibold text-gray-700">
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortCust("customerName")}>
                    <div className="flex items-center gap-1.5">Kunder <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[100px]" onClick={() => handleSortCust("quantity")}>
                    <div className="flex items-center justify-end gap-1.5">Antal <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortCust("salesUnitPrice")}>
                    <div className="flex items-center justify-end gap-1.5">Salgspris pr.enhed <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortCust("costUnitPrice")}>
                    <div className="flex items-center justify-end gap-1.5">Kostbeløb pr.enhed <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none w-[140px]" onClick={() => handleSortCust("profitMargin")}>
                    <div className="flex items-center justify-end gap-1.5">Profit % <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchedCustomerGroups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-400">
                      Ingen lav-profit kunder fundet for de valgte filtre.
                    </td>
                  </tr>
                ) : (
                  searchedCustomerGroups.map((group) => {
                    const isExpanded = expandedCustomers.has(group.customerNumber);
                    const avgUnitPrice = group.quantity !== 0 ? group.salesAmount / group.quantity : 0;
                    const avgCostPrice = group.quantity !== 0 ? group.costAmount / group.quantity : 0;

                    return (
                      <React.Fragment key={group.customerNumber}>
                        {/* Parent Customer Row */}
                        <tr 
                          onClick={() => toggleCustomer(group.customerNumber)}
                          className="bg-emerald-50/50 hover:bg-emerald-100/60 transition duration-150 font-bold text-slate-800 cursor-pointer select-none border-b border-emerald-100"
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-emerald-700 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-emerald-600 shrink-0" />
                              )}
                              <span className="font-mono text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">{group.customerNumber}</span>
                              <span className="truncate max-w-[400px]">{group.customerName}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono">{formatNumber(group.quantity, 2)}</td>
                          <td className="p-3 text-right">{formatCurrency(avgUnitPrice)}</td>
                          <td className="p-3 text-right">{formatCurrency(avgCostPrice)}</td>
                          <td className={`p-3 text-right ${group.profitMargin <= 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {formatPercentage(group.profitMargin)}
                          </td>
                        </tr>

                        {/* Child Product Breakdown Rows */}
                        {isExpanded && (
                          <>
                            {group.items.map((child, idx) => {
                              const childAvgUnitPrice = child.quantity !== 0 ? child.salesAmount / child.quantity : 0;
                              const childAvgCostPrice = child.quantity !== 0 ? child.costAmount / child.quantity : 0;
                              return (
                                <tr 
                                  key={`${group.customerNumber}-child-${idx}`}
                                  className="bg-white hover:bg-slate-50/50 transition duration-150 text-slate-600 border-b border-gray-50"
                                >
                                  <td className="p-2.5 pl-10">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full ${child.profitMargin <= 0 ? "bg-red-400" : "bg-orange-300"}`}></span>
                                      <span className="font-mono text-[10px] text-gray-400">{child.itemNumber}</span>
                                      <span className="font-semibold text-gray-700">{child.description}</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right font-mono text-gray-500">{formatNumber(child.quantity, 2)}</td>
                                  <td className="p-2.5 text-right text-gray-500">{formatCurrency(childAvgUnitPrice)}</td>
                                  <td className="p-2.5 text-right text-gray-500">{formatCurrency(childAvgCostPrice)}</td>
                                  <td className={`p-2.5 text-right font-semibold ${child.profitMargin <= 0 ? "text-red-500" : "text-amber-600"}`}>
                                    {formatPercentage(child.profitMargin)}
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "flat" && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden text-xs" id="flat-tab-content">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortFlat("date")}>
                    <div className="flex items-center gap-1.5">Dato <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortFlat("documentNumber")}>
                    <div className="flex items-center gap-1.5">Fakturanr. <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortFlat("customerName")}>
                    <div className="flex items-center gap-1.5">Kunde <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 cursor-pointer select-none" onClick={() => handleSortFlat("description")}>
                    <div className="flex items-center gap-1.5">Produkt <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-center">Lok.</th>
                  <th className="p-3 text-right">Antal</th>
                  <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSortFlat("salesAmount")}>
                    <div className="flex items-center justify-end gap-1.5">Salg <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSortFlat("costAmount")}>
                    <div className="flex items-center justify-end gap-1.5">Kostpris <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none text-red-600" onClick={() => handleSortFlat("grossProfit")}>
                    <div className="flex items-center justify-end gap-1.5">Brutto profit <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-right cursor-pointer select-none text-orange-600" onClick={() => handleSortFlat("lossAmount")}>
                    <div className="flex items-center justify-end gap-1.5">Tabbeløb <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-3 text-center">Niveau</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedFlatRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-gray-400">
                      Ingen tabsgivende salg fundet for de valgte filtre.
                    </td>
                  </tr>
                ) : (
                  paginatedFlatRows.map((row, idx) => {
                    return (
                      <tr key={idx} className="hover:bg-gray-50/50 transition duration-150">
                        <td className="p-3 text-gray-500 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="p-3 font-mono font-medium text-gray-900">{row.documentNumber}</td>
                        <td className="p-3">
                          <div className="font-semibold text-gray-800 truncate max-w-[140px]" title={row.customerName}>
                            {row.customerName}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">{row.customerNumber}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-gray-800 truncate max-w-[160px]" title={row.description}>
                            {row.description}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">Varenr: {row.itemNumber}</div>
                        </td>
                        <td className="p-3 text-center font-semibold text-gray-500">{row.locationCode}</td>
                        <td className="p-3 text-right font-mono text-gray-500 font-medium">{formatNumber(row.quantity)}</td>
                        <td className="p-3 text-right font-medium text-gray-800">{formatCurrency(row.salesAmount)}</td>
                        <td className="p-3 text-right text-gray-400">{formatCurrency(row.costAmount)}</td>
                        <td className="p-3 text-right font-bold text-red-600">{formatCurrency(row.grossProfit)}</td>
                        <td className="p-3 text-right font-bold text-orange-600">{formatCurrency(row.lossAmount)}</td>
                        <td className="p-3 text-center">
                          {row.severity === "critical" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                              Critical
                            </span>
                          ) : row.severity === "loss" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-100 text-orange-700 uppercase tracking-wide">
                              Tab
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wide">
                              Nul
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredFlatRows.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-xs text-gray-500 font-medium">
                Viser {formatNumber((currentPage - 1) * pageSize + 1)} til{" "}
                {formatNumber(Math.min(currentPage * pageSize, filteredFlatRows.length))} af{" "}
                {formatNumber(filteredFlatRows.length)} tabslinjer
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="p-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold text-gray-700">
                  Side {currentPage} af {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="p-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
