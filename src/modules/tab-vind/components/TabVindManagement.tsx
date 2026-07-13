import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  FileSpreadsheet,
  Settings,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileText,
  TrendingDown,
  TrendingUp,
  RefreshCcw,
  Check,
  ChevronDown,
  ChevronUp,
  BarChart2,
  MapPin,
  Tag,
  AlertOctagon,
  Download
} from "lucide-react";
import {
  TabVindAnalysisResult,
  TabVindMatchingConfig,
  DEFAULT_MATCHING_CONFIG,
  TabVindMatchGroup
} from "../types.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

// Helper to format Danish currency
const formatDKK = (v: number) => {
  return (
    v.toLocaleString("da-DK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " kr."
  );
};

const formatPercent = (v: number) => {
  return v.toLocaleString("da-DK", { maximumFractionDigits: 1 }) + "%";
};

export default function TabVindManagement() {
  const [analysis, setAnalysis] = useState<TabVindAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings / Tolerances state
  const [config, setConfig] = useState<TabVindMatchingConfig>(DEFAULT_MATCHING_CONFIG);
  const [showConfig, setShowConfig] = useState(false);

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<"groups" | "unmatched" | "dimensions" | "alerts">("groups");
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [locationFilter, setLocationFilter] = useState<string>("All");
  const [reasonFilter, setReasonFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Tracking expanded match groups in UI
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Convert uploaded file to base64 and send to server
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = (event.target?.result as string).split(",")[1];
          const response = await fetch("/api/tab-vind/analyse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileBase64: base64,
              fileName: file.name,
              fileSize: file.size,
              matchingConfig: config
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Analyse mislykkedes");
          }

          const result: TabVindAnalysisResult = await response.json();
          setAnalysis(result);
          
          // Pre-expand unmatched and partial groups
          const initialExpanded: Record<string, boolean> = {};
          result.groups.forEach(g => {
            if (g.status !== "Matched") {
              initialExpanded[g.id] = true;
            }
          });
          setExpandedGroups(initialExpanded);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError("Filindlæsning fejlede: " + err.message);
      setLoading(false);
    }
  };

  // Drag & drop handlers
  const [dragActive, setDragActive] = useState(false);
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Trigger PDF Generation on the server
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadPDF = async () => {
    if (!analysis) return;
    setDownloadingPdf(true);
    try {
      const response = await fetch("/api/tab-vind/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          filters: { statusFilter, locationFilter, reasonFilter },
          options: {}
        })
      });

      if (!response.ok) {
        throw new Error("Kunne ikke generere PDF på serveren.");
      }

      // Read as blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      let dateStr = analysis.detectedBusinessDate;
      if (analysis.dateRange?.min && analysis.dateRange?.max && analysis.dateRange.min !== analysis.dateRange.max) {
        dateStr = `${analysis.dateRange.min}_${analysis.dateRange.max}`;
      }
      a.download = `TabVind_Rapport_${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Fejl under PDF download: " + err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Load High-Fidelity Demo Dataset
  const handleLoadDemoData = async () => {
    setLoading(true);
    setError(null);
    try {
      // We will seed realistic rows mimicking NAV Adjustments
      const demoRawRows = [];
      const baseDate = "2026-07-13";
      
      // Let's create Stage 1 Perfect Matches (12 pairs)
      const items = ["A100", "B200", "C300", "D400", "E500"];
      const locations = ["STG-MAIN", "STG-COLD", "STG-TEMP"];
      const reasons = ["SVIND", "PROD", "REKLAMATION"];

      for (let i = 1; i <= 12; i++) {
        const item = items[i % items.length];
        const loc = locations[i % locations.length];
        const reason = reasons[i % reasons.length];
        const docNum = `BILAG-100${i}`;
        const qty = 5 * i;
        const cost = qty * 45;

        // NED Row
        demoRawRows.push({
          postingDate: baseDate,
          entryType: "Nedregulering",
          documentType: "Afgang",
          documentNumber: docNum,
          itemNumber: item,
          description: `Vare beskrivelse ${item}`,
          locationCode: loc,
          quantity: -qty,
          invoicedQuantity: -qty,
          remainingQuantity: 0,
          salesAmount: 0,
          costAmount: -cost,
          reasonCode: reason,
          sourceRowNumber: i * 2
        });

        // OP Row
        demoRawRows.push({
          postingDate: baseDate,
          entryType: "Opregulering",
          documentType: "Tilgang",
          documentNumber: docNum,
          itemNumber: item,
          description: `Vare beskrivelse ${item}`,
          locationCode: loc,
          quantity: qty,
          invoicedQuantity: qty,
          remainingQuantity: qty,
          salesAmount: 0,
          costAmount: cost,
          reasonCode: reason,
          sourceRowNumber: i * 2 + 1
        });
      }

      // Stage 2 Group matches (Same document, multiple lines balancing)
      // Doc: MULTI-001 balances 5000 DKK
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Nedregulering",
        documentType: "Afgang",
        documentNumber: "MULTI-001",
        itemNumber: "A100",
        description: "Råvare forbrug A",
        locationCode: "STG-MAIN",
        quantity: -100,
        invoicedQuantity: -100,
        remainingQuantity: 0,
        salesAmount: 0,
        costAmount: -5000,
        reasonCode: "PROD",
        sourceRowNumber: 30
      });
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Opregulering",
        documentType: "Tilgang",
        documentNumber: "MULTI-001",
        itemNumber: "PROD-X",
        description: "Færdigvare X",
        locationCode: "STG-MAIN",
        quantity: 10,
        invoicedQuantity: 10,
        remainingQuantity: 10,
        salesAmount: 0,
        costAmount: 5000,
        reasonCode: "PROD",
        sourceRowNumber: 31
      });

      // Stage 3 Sequence link (PROD-201 and PROD-202)
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Nedregulering",
        documentType: "Afgang",
        documentNumber: "PROD-201",
        itemNumber: "B200",
        description: "Afgang råvare",
        locationCode: "STG-MAIN",
        quantity: -20,
        invoicedQuantity: -20,
        remainingQuantity: 0,
        salesAmount: 0,
        costAmount: -1200,
        reasonCode: "PROD",
        sourceRowNumber: 35
      });
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Opregulering",
        documentType: "Tilgang",
        documentNumber: "PROD-202",
        itemNumber: "PROD-Y",
        description: "Tilgang færdigvare",
        locationCode: "STG-MAIN",
        quantity: 2,
        invoicedQuantity: 2,
        remainingQuantity: 2,
        salesAmount: 0,
        costAmount: 1200,
        reasonCode: "PROD",
        sourceRowNumber: 36
      });

      // Stage 5 Partial matches (Doc: ERR-999 has difference)
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Nedregulering",
        documentType: "Afgang",
        documentNumber: "ERR-999",
        itemNumber: "C300",
        description: "Svind skadet karton",
        locationCode: "STG-COLD",
        quantity: -10,
        invoicedQuantity: -10,
        remainingQuantity: 0,
        salesAmount: 0,
        costAmount: -450,
        reasonCode: "SVIND",
        sourceRowNumber: 40
      });
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Opregulering",
        documentType: "Tilgang",
        documentNumber: "ERR-999",
        itemNumber: "C300",
        description: "Svind genfunden karton",
        locationCode: "STG-COLD",
        quantity: 10,
        invoicedQuantity: 10,
        remainingQuantity: 10,
        salesAmount: 0,
        costAmount: 900, // 450 kr difference!
        reasonCode: "SVIND",
        sourceRowNumber: 41
      });

      // Stage 6 Unmatched items
      // Unmatched NED (Tab)
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Nedregulering",
        documentType: "Afgang",
        documentNumber: "UAF-550",
        itemNumber: "Z900",
        description: "Ukendt svind mælkekasser",
        locationCode: "STG-MAIN",
        quantity: -250,
        invoicedQuantity: -250,
        remainingQuantity: 0,
        salesAmount: 0,
        costAmount: -12500, // Large tab!
        reasonCode: "SVIND",
        sourceRowNumber: 50
      });
      // Unmatched OP (Vind)
      demoRawRows.push({
        postingDate: baseDate,
        entryType: "Opregulering",
        documentType: "Tilgang",
        documentNumber: "UAF-770",
        itemNumber: "Y800",
        description: "Lagertælling overskud kød",
        locationCode: "STG-COLD",
        quantity: 50,
        invoicedQuantity: 50,
        remainingQuantity: 50,
        salesAmount: 0,
        costAmount: 4800,
        reasonCode: "", // Trigger missing reason code warning!
        sourceRowNumber: 51
      });

      // POST to our server api to execute calculations and match properly
      const res = await fetch("/api/tab-vind/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: btoa(JSON.stringify(demoRawRows)),
          fileName: "Demo_Dynamics_NAV_Lagerposter.xlsx",
          fileSize: 10240,
          matchingConfig: config
        })
      });

      if (!res.ok) throw new Error("Kunne ikke analysere demodata.");
      const result: TabVindAnalysisResult = await res.json();
      setAnalysis(result);

      // Pre-expand unmatched and partial groups
      const initialExpanded: Record<string, boolean> = {};
      result.groups.forEach(g => {
        if (g.status !== "Matched") {
          initialExpanded[g.id] = true;
        }
      });
      setExpandedGroups(initialExpanded);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique locations & reason codes for filtering
  const filterOptions = useMemo(() => {
    if (!analysis) return { locations: [], reasons: [] };
    const locs = new Set<string>();
    const reas = new Set<string>();
    analysis.rawRows.forEach(r => {
      if (r.locationCode) locs.add(r.locationCode);
      if (r.reasonCode) reas.add(r.reasonCode);
    });
    return {
      locations: Array.from(locs).sort(),
      reasons: Array.from(reas).sort()
    };
  }, [analysis]);

  // Client-side filtering of match groups
  const filteredGroups = useMemo(() => {
    if (!analysis) return [];
    return analysis.groups.filter(group => {
      // 1. Status Filter
      if (statusFilter !== "All") {
        if (statusFilter === "Matched" && group.status !== "Matched") return false;
        if (statusFilter === "Unmatched" && !group.status.startsWith("Unmatched")) return false;
        if (statusFilter === "Partial" && group.status !== "Partially Matched" && group.status !== "Ambiguous") return false;
      }
      // 2. Location Filter
      if (locationFilter !== "All" && group.locationCode !== locationFilter) return false;
      // 3. Reason Code Filter
      if (reasonFilter !== "All" && group.reasonCode !== reasonFilter) return false;
      // 4. Text Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesGroup = group.id.toLowerCase().includes(query) ||
          group.documentNumber?.toLowerCase().includes(query) ||
          group.explanation.toLowerCase().includes(query);
        const matchesRows = group.nedRows.concat(group.opRows).some(row =>
          row.itemNumber.toLowerCase().includes(query) ||
          row.description.toLowerCase().includes(query) ||
          row.documentNumber.toLowerCase().includes(query)
        );
        if (!matchesGroup && !matchesRows) return false;
      }
      return true;
    });
  }, [analysis, statusFilter, locationFilter, reasonFilter, searchQuery]);

  // Aggregate dimension summaries (Recharts compatible)
  const chartData = useMemo(() => {
    if (!analysis) return [];
    const reasonsMap: Record<string, { name: string; NED: number; OP: number }> = {};
    analysis.rawRows.forEach(r => {
      const code = r.reasonCode || "BLANK";
      if (!reasonsMap[code]) {
        reasonsMap[code] = { name: code, NED: 0, OP: 0 };
      }
      if (r.entryType === "Nedregulering") {
        reasonsMap[code].NED += r.normCost;
      } else {
        reasonsMap[code].OP += r.normCost;
      }
    });
    return Object.values(reasonsMap);
  }, [analysis]);

  const pieChartData = useMemo(() => {
    if (!analysis) return [];
    let matched = 0;
    let unmatched = 0;
    analysis.groups.forEach(g => {
      if (g.status === "Matched") {
        matched += g.nedCostTotal + g.opCostTotal;
      } else {
        unmatched += g.nedCostTotal + g.opCostTotal;
      }
    });
    return [
      { name: "Afstemt (Matched)", value: matched, color: "#10B981" },
      { name: "Uafstemt (Unmatched / Diff)", value: unmatched, color: "#EF4444" }
    ];
  }, [analysis]);

  return (
    <div className="space-y-6">
      {/* 1. Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">TAB / VIND Afstemningsmodul</h1>
          <p className="text-sm text-slate-400 mt-1">
            Periodisk afstemning af negative (NED) og positive (OP) lagerreguleringer fra Dynamics NAV.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          {analysis && (
            <>
              <button
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition"
              >
                {downloadingPdf ? (
                  <>
                    <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
                    Genererer PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Eksporter PDF
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setAnalysis(null);
                  setSearchQuery("");
                  setStatusFilter("All");
                  setLocationFilter("All");
                  setReasonFilter("All");
                }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold cursor-pointer transition"
              >
                Ryd kørsel
              </button>
            </>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer transition relative"
            title="Tolerancer & Konfiguration"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* 2. Configuration Drawer (Expandable) */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border border-slate-200/80 rounded-xl bg-white shadow-xs p-5"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-400" />
              Afstemningsparametre & Tolerancer
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1.5">
                <label className="block font-medium text-slate-700">Præcis Værdi-tolerance (DKK)</label>
                <input
                  type="number"
                  step="0.05"
                  value={config.exactCostToleranceDkk}
                  onChange={e => setConfig(prev => ({ ...prev, exactCostToleranceDkk: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 outline-hidden"
                />
                <span className="text-[10px] text-slate-400">Tilladt afvigelse for direkte og bilagsmæssige matches.</span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-slate-700">Produktions-tolerance (DKK)</label>
                <input
                  type="number"
                  step="1"
                  value={config.productionCostToleranceDkk}
                  onChange={e => setConfig(prev => ({ ...prev, productionCostToleranceDkk: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 outline-hidden"
                />
                <span className="text-[10px] text-slate-400">Større tolerance ved produktionsbilag (Stage 3 & 4).</span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-slate-700">Maks. Bilagsnummer-afstand</label>
                <input
                  type="number"
                  step="1"
                  value={config.maxDocumentNumberDistance}
                  onChange={e => setConfig(prev => ({ ...prev, maxDocumentNumberDistance: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 outline-hidden"
                />
                <span className="text-[10px] text-slate-400">Nummerforskel for kobling af relaterede produktionsbilag.</span>
              </div>

              <div className="space-y-1.5 sm:col-span-2 md:col-span-1 flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none pb-2">
                  <input
                    type="checkbox"
                    checked={config.allowCrossLocationMatching}
                    onChange={e => setConfig(prev => ({ ...prev, allowCrossLocationMatching: e.target.checked }))}
                    className="rounded border-slate-200 text-slate-900 focus:ring-slate-900"
                  />
                  Tillad afstemning på tværs af lokationer
                </label>
                <span className="text-[10px] text-slate-400">Ignorer lokationskode-mismatch under Stage 3/4.</span>
              </div>
            </div>
            {analysis && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => {
                    // re-trigger analysis if loaded
                    if (analysis.fileName) {
                      // file upload case
                      alert("Værktøjstip: Upload filen på ny for at genanalysere med de nye tolerancesæt.");
                    } else {
                      // demo data case, reload demo data which uses updated config state
                      handleLoadDemoData();
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold rounded-lg cursor-pointer transition"
                >
                  Anvend på nuværende datasæt
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Empty State (No file analysed yet) */}
      {!analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-12 text-center transition-all ${
                dragActive
                  ? "border-slate-800 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {loading ? (
                <div className="space-y-3">
                  <RefreshCcw className="h-10 w-10 text-slate-600 animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">Analyserer reguleringsposter...</p>
                  <p className="text-xs text-slate-400">Dette tager et kort øjeblik.</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-sm">
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 mx-auto border border-slate-200/80">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Træk Dynamics NAV export hertil</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Eller <label className="text-slate-900 font-semibold underline cursor-pointer">vælg en fil<input type="file" onChange={handleFileUpload} accept=".xlsx,.xls,.csv" className="hidden" /></label> fra din computer
                    </p>
                  </div>
                  <div className="text-[10px] text-slate-400 border border-slate-100 bg-slate-50/50 p-2 rounded-lg">
                    Understøtter standard .XLSX filer indeholdende Poster (Posttype, Antal, Kostbeløb, Årsagskode, Bilagsnr. osv).
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Indlæsning fejlede</p>
                  <p className="mt-0.5 text-red-600/90">{error}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Hurtig Test & Simulation</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Har du ikke en Dynamics NAV fil klar? Klik på knappen nedenfor for øjeblikkeligt at indlæse en realistisk demo af et lager-afstemningssæt.
              </p>
              <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 p-3 rounded-xl">
                <p className="font-semibold text-slate-800 mb-1">Dette demosæt indeholder:</p>
                <p>● Stage 1: Præcise direkte matches</p>
                <p>● Stage 2: Balancerede bilagsgrupper</p>
                <p>● Stage 3 & 4: Produktions-konverteringer</p>
                <p>● Stage 5 & 6: Uafstemte svinds-poster</p>
              </div>
            </div>
            <button
              onClick={handleLoadDemoData}
              disabled={loading}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 shadow-xs"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Indlæs Demo TAB/VIND Poster
            </button>
          </div>
        </div>
      )}

      {/* 4. Active Analysis Workspace */}
      {analysis && (
        <div className="space-y-6">
          {/* A. Status Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 flex items-center gap-4.5 shadow-3xs">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Netto Difference (OP-NED)</p>
                <p className={`text-lg font-bold tracking-tight mt-0.5 ${
                  analysis.summary.netCostDifference < 0 ? "text-red-600" : "text-emerald-600"
                }`}>
                  {formatDKK(analysis.summary.netCostDifference)}
                </p>
                <div className="text-[10px] text-slate-400 mt-1">
                  OP: {formatDKK(analysis.summary.opCostTotal)} | NED: {formatDKK(analysis.summary.nedCostTotal)}
                </div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 flex items-center gap-4.5 shadow-3xs">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uforklaret Difference</p>
                <p className={`text-lg font-bold tracking-tight mt-0.5 ${
                  analysis.summary.absoluteUnexplainedDifference > 0 ? "text-rose-600" : "text-slate-900"
                }`}>
                  {formatDKK(analysis.summary.absoluteUnexplainedDifference)}
                </p>
                <div className="text-[10px] text-slate-400 mt-1">
                  Uafstemt kapitalbeholdning.
                </div>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 flex items-center gap-4.5 shadow-3xs">
              <div className="h-10 w-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-200/80">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dækningsgrad (Match Rate)</p>
                <p className="text-lg font-bold text-slate-900 tracking-tight mt-0.5">
                  {formatPercent(analysis.summary.valueMatchRate)}
                </p>
                <div className="text-[10px] text-slate-400 mt-1">
                  Efter værdimatch (Stage 1-4).
                </div>
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 flex items-center gap-4.5 shadow-3xs">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <AlertOctagon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aktive Advarsler</p>
                <p className="text-lg font-bold text-amber-600 tracking-tight mt-0.5">
                  {analysis.validationWarnings.length + (analysis.summary.absoluteUnexplainedDifference > 1000 ? 1 : 0)} advarsler
                </p>
                <div className="text-[10px] text-slate-400 mt-1">
                  Manglende koder eller afvigelser.
                </div>
              </div>
            </div>
          </div>

          {/* B. Filters Row */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-3xs">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Søg i bilag, varenr, beskrivelse eller gruppe-ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-800 outline-hidden"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              {/* Status Select */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium outline-hidden"
              >
                <option value="All">Alle Statusser</option>
                <option value="Matched">Afstemt (Matched)</option>
                <option value="Partial">Delvist / Ambiguous</option>
                <option value="Unmatched">Uafstemt (Unmatched)</option>
              </select>

              {/* Location Select */}
              <select
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium outline-hidden"
              >
                <option value="All">Alle Lokationer</option>
                {filterOptions.locations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>

              {/* Reason Select */}
              <select
                value={reasonFilter}
                onChange={e => setReasonFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium outline-hidden"
              >
                <option value="All">Alle Årsagskoder</option>
                {filterOptions.reasons.map(rc => (
                  <option key={rc} value={rc}>{rc || "BLANK"}</option>
                ))}
              </select>
            </div>
          </div>

          {/* C. Work Space Subtabs */}
          <div className="space-y-4">
            <div className="flex border-b border-slate-200 gap-6">
              <button
                onClick={() => setActiveTab("groups")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider relative cursor-pointer ${
                  activeTab === "groups" ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Afstemte & Uafstemte Grupper ({filteredGroups.length})
                {activeTab === "groups" && (
                  <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("dimensions")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider relative cursor-pointer ${
                  activeTab === "dimensions" ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Dimensioner (Årsager / Lokationer)
                {activeTab === "dimensions" && (
                  <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("alerts")}
                className={`pb-3 text-xs font-bold uppercase tracking-wider relative cursor-pointer ${
                  activeTab === "alerts" ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Operationelle Alarmer ({analysis.validationWarnings.length + (analysis.summary.absoluteUnexplainedDifference > 0 ? 1 : 0)})
                {activeTab === "alerts" && (
                  <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
                )}
              </button>
            </div>

            {/* TAB CONTENT 1: GROUPS */}
            {activeTab === "groups" && (
              <div className="space-y-3">
                {filteredGroups.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
                    Ingen match grupper opfylder dine filtreringskrav.
                  </div>
                ) : (
                  filteredGroups.map(group => {
                    const expanded = expandedGroups[group.id];
                    const isMatched = group.status === "Matched";
                    const isPartial = group.status === "Partially Matched" || group.status === "Ambiguous";

                    return (
                      <div
                        key={group.id}
                        className={`bg-white border rounded-xl overflow-hidden shadow-3xs transition-all ${
                          isMatched
                            ? "border-slate-200/80 hover:border-slate-300"
                            : isPartial
                            ? "border-amber-200 bg-amber-50/5 hover:border-amber-300"
                            : "border-rose-200 bg-rose-50/5 hover:border-rose-300"
                        }`}
                      >
                        {/* Group Header Row */}
                        <div
                          onClick={() => toggleGroup(group.id)}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono font-bold text-slate-400 px-1.5 py-0.5 border border-slate-200 rounded">
                              {group.id}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${
                                  isMatched ? "text-slate-900" : isPartial ? "text-amber-800" : "text-rose-800"
                                }`}>
                                  {group.method}
                                </span>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                  isMatched
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    : isPartial
                                    ? "bg-amber-50 text-amber-700 border border-amber-100"
                                    : "bg-rose-50 text-rose-700 border border-rose-100"
                                }`}>
                                  {group.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {group.explanation}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-5">
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Afsæt (Delta)</p>
                              <p className={`text-xs font-bold ${
                                Math.abs(group.costDifference) < 0.1
                                  ? "text-slate-900"
                                  : group.costDifference < 0
                                  ? "text-rose-600"
                                  : "text-emerald-600"
                              }`}>
                                {formatDKK(group.costDifference)}
                              </p>
                            </div>

                            <button className="text-slate-400 hover:text-slate-600">
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Group Expanded Details (Sub-table) */}
                        {expanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] text-slate-500 bg-white p-3 border border-slate-200/60 rounded-lg">
                              <div>
                                <p><span className="font-semibold text-slate-700">Bogføringsdato:</span> {group.date}</p>
                                <p className="mt-0.5"><span className="font-semibold text-slate-700">Lokationskode:</span> {group.locationCode}</p>
                              </div>
                              <div>
                                <p><span className="font-semibold text-slate-700">Årsagskode:</span> {group.reasonCode || "Uoplyst"}</p>
                                <p className="mt-0.5"><span className="font-semibold text-slate-700">Konfidensscore:</span> {group.confidence}%</p>
                              </div>
                            </div>

                            {/* NED & OP Rows listing */}
                            <div className="space-y-2">
                              {/* NED rows */}
                              {group.nedRows.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1.5">
                                    <TrendingDown className="h-3 w-3" />
                                    Nedreguleringsposter (NED - Afgang)
                                  </p>
                                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                                          <th className="p-2">Varenr</th>
                                          <th className="p-2">Beskrivelse</th>
                                          <th className="p-2">Bilag</th>
                                          <th className="p-2 text-right">Mængde</th>
                                          <th className="p-2 text-right">Normaliseret mængde</th>
                                          <th className="p-2 text-right">Værdi (Kost)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-600">
                                        {group.nedRows.map(row => (
                                          <tr key={row.sourceRowNumber} className="hover:bg-slate-50/50">
                                            <td className="p-2 font-semibold text-slate-800">{row.itemNumber}</td>
                                            <td className="p-2">{row.description}</td>
                                            <td className="p-2 font-mono text-slate-400">{row.documentNumber}</td>
                                            <td className="p-2 text-right font-mono text-red-500">{row.quantity}</td>
                                            <td className="p-2 text-right font-mono">{row.normQty}</td>
                                            <td className="p-2 text-right font-semibold font-mono text-slate-900">{formatDKK(row.normCost)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* OP rows */}
                              {group.opRows.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                                    <TrendingUp className="h-3 w-3" />
                                    Opreguleringsposter (OP - Tilgang)
                                  </p>
                                  <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                                          <th className="p-2">Varenr</th>
                                          <th className="p-2">Beskrivelse</th>
                                          <th className="p-2">Bilag</th>
                                          <th className="p-2 text-right">Mængde</th>
                                          <th className="p-2 text-right">Normaliseret mængde</th>
                                          <th className="p-2 text-right">Værdi (Kost)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-600">
                                        {group.opRows.map(row => (
                                          <tr key={row.sourceRowNumber} className="hover:bg-slate-50/50">
                                            <td className="p-2 font-semibold text-slate-800">{row.itemNumber}</td>
                                            <td className="p-2">{row.description}</td>
                                            <td className="p-2 font-mono text-slate-400">{row.documentNumber}</td>
                                            <td className="p-2 text-right font-mono text-emerald-500">{row.quantity}</td>
                                            <td className="p-2 text-right font-mono">{row.normQty}</td>
                                            <td className="p-2 text-right font-semibold font-mono text-slate-900">{formatDKK(row.normCost)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB CONTENT 2: DIMENSIONS */}
            {activeTab === "dimensions" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Reason code summaries */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-3xs">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Tag className="h-4.5 w-4.5 text-slate-400" />
                    Afstemning pr. Årsagskode
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip formatter={(value) => formatDKK(Number(value))} />
                        <Legend />
                        <Bar dataKey="NED" name="Nedregulering (NED)" fill="#F43F5E" />
                        <Bar dataKey="OP" name="Opregulering (OP)" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Match balance distribution */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-3xs">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 className="h-4.5 w-4.5 text-slate-400" />
                    Samlet værdiafstemningsfordeling
                  </h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatDKK(Number(value))} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: ALERTS */}
            {activeTab === "alerts" && (
              <div className="space-y-3">
                {/* High priority unexplained delta alert */}
                {analysis.summary.absoluteUnexplainedDifference > 0 && (
                  <div className="bg-red-50/50 border border-red-200 rounded-xl p-4 flex items-start gap-3.5">
                    <div className="h-8 w-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center border border-red-200 shrink-0 mt-0.5">
                      <AlertOctagon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Uforklaret Difference på dagsopgørelse</h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Lagerbeholdningen har {formatDKK(analysis.summary.absoluteUnexplainedDifference)} i uforklaret difference, som ikke kan mod-bogføres automatisk indenfor dine indstillede tolerancer. Dette repræsenterer mulige fysiske svindsscenarier.
                      </p>
                    </div>
                  </div>
                )}

                {analysis.validationWarnings.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
                    Ingen datavalideringsfejl fundet. Datakvaliteten er i top!
                  </div>
                ) : (
                  analysis.validationWarnings.map((warning, idx) => (
                    <div key={idx} className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 flex items-start gap-3.5">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0 mt-0.5">
                        <AlertTriangle className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Datakvalitet advarsel</h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {warning}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
