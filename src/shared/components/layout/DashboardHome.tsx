import React, { useMemo } from "react";
import { Database, FileSpreadsheet, BarChart3, TrendingUp, AlertCircle, ArrowRight, Zap } from "lucide-react";
import { SalesRawRow, ImportMetadata } from "../../../shared/types.js";
import { calculateSalesMetrics } from "../../../modules/sales/calculations.js";
import { formatCurrency, formatDate, formatPercentage, formatNumber } from "../../utils/format.js";

interface DashboardHomeProps {
  importHistory: ImportMetadata[];
  latestWorksheetDate: string;
  latestWorksheetRows: SalesRawRow[];
  onNavigate: (module: string) => void;
}

export default function DashboardHome({
  importHistory,
  latestWorksheetDate,
  latestWorksheetRows,
  onNavigate,
}: DashboardHomeProps) {

  const latestSuccessImport = useMemo(() => {
    return importHistory.find((m) => m.importStatus === "success");
  }, [importHistory]);

  const latestMetrics = useMemo(() => {
    return calculateSalesMetrics(latestWorksheetRows);
  }, [latestWorksheetRows]);

  // Determine freshness status
  const freshnessStatus = useMemo(() => {
    if (!latestWorksheetDate) return { label: "Ingen data tilgængelig", color: "text-red-500 bg-red-50" };
    // In our local timeline (set in metadata as 2026-07-10)
    // If today is July 10, 2026, and the latest is July 10, it's fresh!
    if (latestWorksheetDate === "2026-07-10") {
      return { label: "Data er fuldt opdateret", color: "text-emerald-700 bg-emerald-50 border-emerald-100" };
    }
    return { label: "Historisk visning aktiv", color: "text-amber-700 bg-amber-50 border-amber-100" };
  }, [latestWorksheetDate]);

  return (
    <div className="space-y-6">
      {/* Welcome Hero Banner */}
      <div className="bg-slate-900 rounded-xl p-6 text-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/30 via-transparent to-transparent opacity-50" />
        <div className="space-y-2 relative z-10">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Zap className="h-3 w-3 animate-pulse" /> Velkommen til DMS
          </span>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Daily Management System</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            Dit dashboardsystem til uforanderlig ledelsesrapportering og rentabilitetsstyring i fødevareengros.
          </p>
        </div>
        <button
          onClick={() => onNavigate("database")}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-900 text-xs font-semibold rounded-lg hover:bg-slate-100 transition shrink-0 cursor-pointer relative z-10"
        >
          <Database className="h-4 w-4" />
          Administrer datakilder
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Module overview and Quick links */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-base font-semibold text-slate-900">Forretningsmoduler</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Sales Module Card */}
            <div className="border border-slate-200 bg-white rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition h-48">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  {latestWorksheetDate && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Fane: {formatDate(latestWorksheetDate)}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800">Salg & Profitabilitet (Sales)</h3>
                <p className="text-gray-400">
                  Analyser salgs-KPI'er, bruttofortjeneste, dækningsgrad, salg uden fortjeneste og overvåg topkunder.
                </p>
              </div>

              <button
                onClick={() => onNavigate("sales")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-4 cursor-pointer"
              >
                Åbn Salgsmodul
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Inventory Module (Future Architectural Mock) */}
            <div className="border border-slate-100 bg-slate-50/50 rounded-xl p-5 shadow-xs flex flex-col justify-between h-48 opacity-75">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-gray-100 text-gray-400 rounded-lg">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    Mangler data fane
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-400">Lager & Optælling (Inventory)</h3>
                <p className="text-slate-400/80">
                  Fremtidigt udvidelsespunkt. Modulet vil integrere med lagerbeholdninger og daglig svindkontrol uden at forstyrre salgsstrukturen.
                </p>
              </div>

              <span className="text-xs font-semibold text-slate-400 mt-4 italic">
                Inaktiv i denne fase
              </span>
            </div>
          </div>

          {/* KPI Mini Summary of latest day */}
          {latestWorksheetDate && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Seneste nøgletal ({formatDate(latestWorksheetDate)})</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${freshnessStatus.color}`}>
                  {freshnessStatus.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs pt-1">
                <div className="space-y-1">
                  <span className="text-gray-400 font-medium">Omsætning (Sales)</span>
                  <p className="text-base font-bold text-slate-800">{formatCurrency(latestMetrics.totalSales)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400 font-medium">Bruttofortjeneste</span>
                  <p className="text-base font-bold text-slate-800">{formatCurrency(latestMetrics.totalGrossProfit)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400 font-medium">Dækningsgrad (Margin)</span>
                  <p className="text-base font-bold text-slate-800">{formatPercentage(latestMetrics.grossMarginPercentage)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: System status & history overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs h-fit space-y-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-gray-400" />
            Import Status
          </h2>

          <div className="space-y-3.5 text-xs">
            {latestSuccessImport ? (
              <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                  <span className="font-semibold text-slate-800">Seneste Upload</span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-mono text-[9px] rounded font-bold uppercase">
                    Status: OK
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500 font-medium truncate" title={latestSuccessImport.uploadedFileName}>
                    Fil: {latestSuccessImport.uploadedFileName}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Omsætningsdato: {formatDate(latestSuccessImport.businessDate)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Antal rækker importeret: {formatNumber(latestSuccessImport.importedRowCount)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                <AlertCircle className="h-6 w-6 text-gray-400 mx-auto mb-1.5" />
                Ingen registrerede uploads endnu.
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => onNavigate("database")}
                className="w-full text-center px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
              >
                Gå til import-oversigt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
