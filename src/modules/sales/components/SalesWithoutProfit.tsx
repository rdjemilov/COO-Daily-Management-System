import React, { useState, useMemo } from "react";
import { AlertOctagon, TrendingDown, FileText, Users, ShoppingBag, Download, ArrowUpDown, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Eye, HelpCircle } from "lucide-react";
import { SalesRawRow, SalesWithoutProfitRow } from "../../../shared/types.js";
import { formatCurrency, formatDate, formatNumber, formatPercentage } from "../../../shared/utils/format.js";
import { getSalesWithoutProfit } from "../calculations.js";

interface SalesWithoutProfitProps {
  currentRows: SalesRawRow[];
  filterLocation: string[];
}

export default function SalesWithoutProfit({
  currentRows,
  filterLocation,
}: SalesWithoutProfitProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  
  // Pagination & Sorting States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortField, setSortField] = useState<keyof SalesWithoutProfitRow>("lossAmount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // 1. Calculate All Sales Without Profit lines
  const rawProfitlessRows = useMemo(() => {
    return getSalesWithoutProfit(currentRows);
  }, [currentRows]);

  // 2. Apply Page & Table specific Filters
  const filteredRows = useMemo(() => {
    let result = [...rawProfitlessRows];

    // Filter by location (comes from parent global filters)
    if (filterLocation.length > 0) {
      result = result.filter((r) => filterLocation.includes(r.locationCode));
    }

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
  }, [rawProfitlessRows, filterLocation, severityFilter, searchTerm, sortField, sortDirection]);

  // 3. Calculate Summary Cards metrics
  const summaryMetrics = useMemo(() => {
    let totalLoss = 0;
    const uniqueDocs = new Set<string>();
    const uniqueCusts = new Set<string>();
    const uniqueProds = new Set<string>();
    let largestLoss = 0;

    filteredRows.forEach((row) => {
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
      lineCount: filteredRows.length,
      docCount: uniqueDocs.size,
      custCount: uniqueCusts.size,
      prodCount: uniqueProds.size,
      largestLoss,
    };
  }, [filteredRows]);

  // 4. Handle Column Sorting triggers
  const handleSort = (field: keyof SalesWithoutProfitRow) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  // 5. Pagination calculation
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;

  // 6. CSV Exporter (Section 25)
  const exportCSV = () => {
    const headers = [
      "Dato",
      "Bilagstype",
      "Bilagsnummer",
      "Kundenummer",
      "Kundenavn",
      "Varenummer",
      "Beskrivelse",
      "Lokation",
      "Antal",
      "Salgsbelob",
      "Kostbelob",
      "Gross Profit",
      "Tab",
      "DG %",
      "Alvorlighed",
    ];

    const csvContent = [
      headers.join(";"), // Semicolon standard separator for Danish Excel imports
      ...filteredRows.map((r) =>
        [
          r.date,
          r.documentType,
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
          r.severity,
        ].join(";")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" }); // utf-8 BOM for danish characters
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Salg_uden_fortjeneste_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Overview/Goal intro panel */}
      <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 text-xs text-amber-950 flex items-start gap-3">
        <AlertOctagon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-sm">Formål: Salg uden fortjeneste (Salg uden fortjeneste)</h4>
          <p className="mt-1 leading-relaxed">
            Denne rapport identificerer transaktionslinjer fra salgsfakturaer, hvor dækningsgraden er nul eller negativ (Gross Profit ≤ 0 DKK). 
            Systemet hjælper ledelsen med at spore tabsgivende ordrer, prisfejl eller ufordelagtige kundeaftaler.
          </p>
        </div>
      </div>

      {/* 1. Summary Cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Total loss */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-red-500 uppercase tracking-wider block">Samlet Tab (Loss)</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(summaryMetrics.totalLoss)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Akkumuleret undertryk</p>
        </div>

        {/* Lines count */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Berørte Linjer</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.lineCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Salgslinjer i alt</p>
        </div>

        {/* Affected Docs */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Fakturaer</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.docCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Unikke bilagsnumre</p>
        </div>

        {/* Affected Customers */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Kunder</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.custCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Unikke tabsgivende kunder</p>
        </div>

        {/* Affected Products */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Produkter</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatNumber(summaryMetrics.prodCount)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Tabsramte varekoder</p>
        </div>

        {/* Largest single loss */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider block">Største Enkelt-Tab</span>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(summaryMetrics.largestLoss)}</h3>
          <p className="text-[10px] text-gray-400 mt-1">Maks. afvigelse på rækkeniveau</p>
        </div>
      </div>

      {/* 2. Controls / Filtering Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative w-full sm:max-w-xs text-xs">
            <input
              type="text"
              placeholder="Søg i tabsrapporten..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 bg-gray-50/30 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
            />
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Severity selector */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            <option value="all">Alvorlighed: Alle niveauer</option>
            <option value="critical">🔴 Kritiske tab (&gt; 150 kr.)</option>
            <option value="loss">🟠 Normale tab</option>
            <option value="zero">⚪ Nulfortjeneste (0 kr.)</option>
          </select>
        </div>

        {/* Export action */}
        <button
          onClick={exportCSV}
          disabled={filteredRows.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-3.5 w-3.5 text-gray-500" />
          Eksporter CSV
        </button>
      </div>

      {/* 3. Main Data Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-600">
                <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("date")}>
                  <div className="flex items-center gap-1.5">Dato <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("documentNumber")}>
                  <div className="flex items-center gap-1.5">Fakturanr. <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("customerName")}>
                  <div className="flex items-center gap-1.5">Kunde <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 cursor-pointer select-none" onClick={() => handleSort("description")}>
                  <div className="flex items-center gap-1.5">Produkt <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 text-center">Lok.</th>
                <th className="p-3 text-right">Antal</th>
                <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort("salesAmount")}>
                  <div className="flex items-center justify-end gap-1.5">Salg <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 text-right cursor-pointer select-none" onClick={() => handleSort("costAmount")}>
                  <div className="flex items-center justify-end gap-1.5">Kostpris <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 text-right cursor-pointer select-none text-red-600" onClick={() => handleSort("grossProfit")}>
                  <div className="flex items-center justify-end gap-1.5">Brutto profit <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 text-right cursor-pointer select-none text-orange-600" onClick={() => handleSort("lossAmount")}>
                  <div className="flex items-center justify-end gap-1.5">Tabbeløb <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="p-3 text-center">Niveau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-gray-400">
                    Ingen tabsgivende salg fundet for de valgte filtre.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
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

        {/* 4. Table Pagination Controls */}
        {filteredRows.length > 0 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-xs text-gray-500 font-medium">
              Viser {formatNumber((currentPage - 1) * pageSize + 1)} til{" "}
              {formatNumber(Math.min(currentPage * pageSize, filteredRows.length))} af{" "}
              {formatNumber(filteredRows.length)} tabslinjer
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
    </div>
  );
}
