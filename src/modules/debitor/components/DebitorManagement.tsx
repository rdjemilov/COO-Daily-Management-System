import React, { useState, useEffect, useMemo, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Search,
  Check,
  ChevronUp,
  ChevronDown,
  Eye,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  Activity,
  AlertTriangle,
  Users,
  ShoppingBag,
  DollarSign,
  FileWarning,
  Scale,
  Octagon,
  Inbox,
  ArrowRight
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from "recharts";
import { formatCurrency, formatDate } from "../../../shared/utils/format.ts";
import CustomerCard from "./CustomerCard.tsx";

// --- CUSTOM ACCESSIBLE TOOLTIP COMPONENT ---
interface TooltipProps {
  children: React.ReactNode;
  text: string;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text }) => {
  return (
    <div className="relative group inline-block">
      {children}
      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-52 p-2.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl font-normal leading-normal text-center pointer-events-none transition-all duration-200 border border-slate-800">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
      </div>
    </div>
  );
};

// --- DATA TYPES ---
interface CustomerRiskResult {
  customerNo: string;
  customerName: string;
  riskScore: number;
  riskLevel: "Low" | "Medium" | "High" | "VeryHigh" | "Critical";
  collectionPriority: "Priority1" | "Priority2" | "Priority3" | "Priority4" | "Priority5" | "Priority6";
  collectionStatus: string;
  recommendation: string;
  riskReasons: string[];
  balanceTrend: "Increasing" | "Stable" | "Reducing";
  overdueTrend: "Increasing" | "Stable" | "Reducing";
  paymentTrend: "Improving" | "Stable" | "Declining";
  customerStatus: string;
  hasActivePromise: boolean;
  hasBrokenPromise: boolean;
}

interface DebtorAlert {
  id: string;
  type: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  title: string;
  message: string;
  customerNo?: string;
  customerName?: string;
}

interface ExecutiveSummary {
  totalExposure: number;
  totalOverdue: number;
  totalCredit: number;
  averageRiskScore: number;
  criticalCustomersCount: number;
  highRiskCustomersCount: number;
  newOverdueTotal: number;
  resolvedOverdueTotal: number;
  payments14DaysTotal: number;
  collectionRequiredCount: number;
  legalCandidatesCount: number;
  creditStopsCount: number;
  paymentPromisesCount: number;
  averageDaysSincePayment: number;
  customersWithoutPurchaseCount: number;
  customersWithoutPaymentCount: number;
  collectionPipeline: {
    needsCall: number;
    needsReminder: number;
    needsAgreement: number;
    needsCollection: number;
    legal: number;
    completed: number;
  };
  actionSummary: {
    open: number;
    completed: number;
    overdue: number;
    promised: number;
    cancelled: number;
  };
  paymentPromiseKPI: {
    openPromises: number;
    brokenPromises: number;
    completedPromises: number;
  };
  topExposureList: { customerNo: string; name: string; balance: number; overdue: number }[];
  topOverdueList: { customerNo: string; name: string; overdue: number; riskScore: number }[];
  largestBalanceIncrease: { customerNo: string; name: string; increase: number }[];
  largestBalanceReduction: { customerNo: string; name: string; reduction: number }[];
  topRiskList: { customerNo: string; name: string; riskScore: number; riskLevel: string }[];
  alerts: DebtorAlert[];
  warnings: string[];
}

interface CustomerViewModel {
  customerNo: string;
  customerName: string;
  balance: number;
  overdue: number;
  paymentTerms: string;
  lastInvoice: string | null;
  lastPayment: string | null;
  daysSincePayment: number | null;
  payment14Days: number;
  balanceDelta7: number | null;
  newOverdue: number | null;
  resolvedOverdue: number | null;
  creditHandling: string;
  location: string;
  salesperson: string;
  seller: string;
  latestAction: any | null;
  riskInputs: {
    overdueShare: number | null;
    daysSinceLastPayment: number | null;
    noPayment14Days: boolean;
    noPurchase14Days: boolean;
    riskScore: number;
    riskLevel: string;
  };
  notesSummary: string;
}

interface RefreshResult {
  success: boolean;
  snapshotMetadata: any;
  refreshedAt: string;
  warnings: string[];
  kpis: {
    customers: CustomerViewModel[];
    summary: {
      debtorsWithBalanceCount: number;
      debtorsWithOverdueCount: number;
    };
  };
  riskResults: CustomerRiskResult[];
  executiveSummary: ExecutiveSummary;
  settings: any;
}

// --- TABLE ROW COMPONENT MEMOIZED ---
const DebtorRow = memo<{
  customer: CustomerViewModel & { riskResult?: CustomerRiskResult };
  visibleColumns: Record<string, boolean>;
  isSelected: boolean;
  onSelect: (customerNo: string) => void;
  onDoubleClick: (customer: CustomerViewModel) => void;
  onEyeClick: (customer: CustomerViewModel) => void;
}>(({ customer, visibleColumns, isSelected, onSelect, onDoubleClick, onEyeClick }) => {
  const risk = customer.riskResult;
  
  // Custom Background Color based on Risk Level or Balance
  let bgClass = "bg-white hover:bg-slate-50";
  if (customer.balance < 0) {
    bgClass = "bg-emerald-50/40 hover:bg-emerald-50/70";
  } else if (risk) {
    if (risk.riskLevel === "Critical" || risk.riskLevel === "VeryHigh") {
      bgClass = "bg-red-50/30 hover:bg-red-50/60";
    } else if (risk.riskLevel === "High") {
      bgClass = "bg-orange-50/30 hover:bg-orange-50/60";
    } else if (risk.riskLevel === "Medium") {
      bgClass = "bg-yellow-50/30 hover:bg-yellow-50/60";
    }
  }

  // Risk Badge Color Map
  const riskColorMap = {
    Low: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Medium: "bg-blue-50 text-blue-700 border-blue-100",
    High: "bg-orange-50 text-orange-700 border-orange-200",
    VeryHigh: "bg-amber-100 text-amber-800 border-amber-300",
    Critical: "bg-red-50 text-red-700 border-red-200",
  };

  // Priority Badge Color Map
  const priorityColorMap = {
    Priority1: "bg-red-100 text-red-800 border-red-200",
    Priority2: "bg-orange-100 text-orange-800 border-orange-200",
    Priority3: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Priority4: "bg-blue-100 text-blue-800 border-blue-200",
    Priority5: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Priority6: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const priorityLabelMap = {
    Priority1: "P1",
    Priority2: "P2",
    Priority3: "P3",
    Priority4: "P4",
    Priority5: "P5",
    Priority6: "P6",
  };

  const priorityTooltipMap = {
    Priority1: "P1: Kritik vadesi geçmiş bakiye, derhal yasal takip ve icra başlatılması gerekir",
    Priority2: "P2: Yüksek gecikme riski, bugün aktif tahsilat araması ve ihtar yapılması gerekir",
    Priority3: "P3: Orta risk, telefonla aranarak ödeme sözü alınması gerekir",
    Priority4: "P4: Yeni başlayan gecikme, e-posta ile ihtar gönderilmesi gerekir",
    Priority5: "P5: Ödemeler gecikmiş ancak geçmişi güvenilir. Yakından izleme aşaması",
    Priority6: "P6: Aktif risk faktörü yok. Rutin kontrol aşaması",
  };

  return (
    <tr
      onClick={() => onSelect(customer.customerNo)}
      onDoubleClick={() => onDoubleClick(customer)}
      className={`transition duration-150 cursor-pointer border-b border-gray-100 ${bgClass} ${
        isSelected ? "ring-2 ring-brand ring-inset" : ""
      }`}
    >
      {visibleColumns.customerNo && (
        <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-500 whitespace-nowrap w-24">
          {customer.customerNo}
        </td>
      )}

      {visibleColumns.customerName && (
        <td className="py-3 px-4 font-medium text-gray-900 truncate max-w-xs sm:max-w-md">
          {customer.customerName}
        </td>
      )}

      {visibleColumns.balance && (
        <td className="py-3 px-4 text-right font-semibold whitespace-nowrap font-mono text-xs">
          <span className={customer.balance < 0 ? "text-emerald-600 font-bold" : "text-gray-800"}>
            {formatCurrency(customer.balance)}
          </span>
        </td>
      )}

      {visibleColumns.overdue && (
        <td className="py-3 px-4 text-right font-bold whitespace-nowrap font-mono text-xs">
          <span className={customer.overdue > 0 ? "text-red-600" : "text-emerald-600"}>
            {customer.overdue > 0 ? formatCurrency(customer.overdue) : "-"}
          </span>
        </td>
      )}

      {visibleColumns.salesperson && (
        <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-black uppercase">
            {customer.salesperson || "Uspecificeret"}
          </span>
        </td>
      )}

      {visibleColumns.paymentTerms && (
        <td className="py-3 px-4 whitespace-nowrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-100">
            {customer.paymentTerms}
          </span>
        </td>
      )}

      {visibleColumns.lastInvoice && (
        <td className="py-3 px-4 text-xs font-mono text-gray-400 whitespace-nowrap">
          {customer.lastInvoice ? formatDate(customer.lastInvoice) : "-"}
        </td>
      )}

      {visibleColumns.payment14Days && (
        <td className="py-3 px-4 text-right font-medium text-emerald-600 font-mono text-xs whitespace-nowrap">
          {customer.payment14Days > 0 ? formatCurrency(customer.payment14Days) : "-"}
        </td>
      )}

      {visibleColumns.balanceDelta7 && (
        <td className="py-3 px-4 text-right font-mono text-xs whitespace-nowrap">
          {customer.balanceDelta7 !== null && customer.balanceDelta7 !== 0 ? (
            <span className={customer.balanceDelta7 > 0 ? "text-amber-600" : "text-emerald-600"}>
              {customer.balanceDelta7 > 0 ? "+" : ""}
              {formatCurrency(customer.balanceDelta7)}
            </span>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </td>
      )}

      {visibleColumns.risk && (
        <td className="py-3 px-4 whitespace-nowrap">
          {risk ? (
            <Tooltip text={`Risiko Score: ${risk.riskScore}/100. Årsager: ${risk.riskReasons.join(", ")}`}>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                  riskColorMap[risk.riskLevel] || ""
                }`}
              >
                {risk.riskLevel} ({risk.riskScore})
              </span>
            </Tooltip>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </td>
      )}



      <td className="py-3 px-4 text-center whitespace-nowrap w-12">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEyeClick(customer);
          }}
          className="p-1 text-gray-400 hover:text-brand hover:bg-slate-100 rounded-md transition"
          title="Vis detaljer"
        >
          <Eye className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
});

DebtorRow.displayName = "DebtorRow";

export default function DebitorManagement() {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [currentData, setCurrentData] = useState<RefreshResult | null>(null);
  const [prevData, setPrevData] = useState<RefreshResult | null>(null);
  
  // Historical snapshots cache to populate trends
  const [historicalTrendData, setHistoricalTrendData] = useState<{
    date: string;
    overdue: number;
    payments: number;
    balance: number;
  }[]>([]);

  // Page States
  const [loadingDates, setLoadingDates] = useState(true);
  const [showAllKpis, setShowAllKpis] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState<string | null>(null);

  // PDF Export and Report States
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const handleDownloadReport = async (reportType: "dashboard" | "collection" | "executive") => {
    if (!selectedDate) return;
    setDownloadingReport(reportType);
    setShowExportMenu(false);
    try {
      const res = await fetch(`/api/debitor/pdf/${reportType}?snapshotDate=${selectedDate}`);
      if (!res.ok) throw new Error("Generering af PDF fejlede på serveren.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const actualName = reportType === "dashboard" ? "Dashboard" : reportType === "collection" ? "Rykkerliste" : "Ledelsesrapport";
      a.download = `DF-${actualName}-${selectedDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      triggerNotification(`${actualName} PDF er downloadet.`);
    } catch (err: any) {
      console.error(err);
      triggerNotification(`Fejl ved PDF-generering: ${err.message}`);
    } finally {
      setDownloadingReport(null);
    }
  };

  // Search, Pagination & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem("debitor_page_size");
    return saved ? parseInt(saved, 10) : 50;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Active filter states
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [filterCreditHandling, setFilterCreditHandling] = useState("");
  const [filterPaymentTerms, setFilterPaymentTerms] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterSalesperson, setFilterSalesperson] = useState("");
  const [filterSeller, setFilterSeller] = useState("");
  const [filterHasOverdue, setFilterHasOverdue] = useState(false);
  const [filterHasBalance, setFilterHasBalance] = useState(false);
  const [filterNoPurchase14Days, setFilterNoPurchase14Days] = useState(false);
  const [filterNoPayment14Days, setFilterNoPayment14Days] = useState(false);
  const [filterBrokenPromise, setFilterBrokenPromise] = useState(false);
  const [filterOpenActions, setFilterOpenActions] = useState(false);

  // Table Selection & Alerts integration
  const [selectedRowNo, setSelectedRowNo] = useState<string | null>(null);
  const [activeAlertFilter, setActiveAlertFilter] = useState<DebtorAlert | null>(null);
  const [activeCustomerCard, setActiveCustomerCard] = useState<CustomerViewModel | null>(null);

  // Column Visibility Config (stored locally)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("debitor_visible_columns");
    const defaults = {
      customerNo: true,
      customerName: true,
      balance: true,
      overdue: true,
      salesperson: true,
      lastInvoice: true,
      paymentTerms: false,
      payment14Days: false,
      balanceDelta7: false,
      risk: false,
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Force-disable the removed columns in case they are cached in user's localStorage
        const cleaned = { ...parsed };
        delete cleaned.seller;
        delete cleaned.creditHandling;
        delete cleaned.priority;
        delete cleaned.recommendation;
        delete cleaned.latestAction;
        delete cleaned.status;
        return { ...defaults, ...cleaned };
      } catch (e) {}
    }
    return defaults;
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  // Sync visible columns to local storage
  useEffect(() => {
    localStorage.setItem("debitor_visible_columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Sync page size to local storage
  useEffect(() => {
    localStorage.setItem("debitor_page_size", pageSize.toString());
  }, [pageSize]);

  // Initial mount
  useEffect(() => {
    fetchDates();
  }, []);

  // Fetch available dates list
  const fetchDates = async (targetDate?: string) => {
    setLoadingDates(true);
    setError(null);
    try {
      const res = await fetch("/api/debitor/all-dates");
      if (!res.ok) throw new Error("Kunne ikke hente aktive datakilder fra server");
      const dates: string[] = await res.json();
      setAvailableDates(dates);

      if (dates.length > 0) {
        const activeDate = targetDate && dates.includes(targetDate) ? targetDate : dates[0];
        setSelectedDate(activeDate);
        fetchTrends(dates);
      }
    } catch (e: any) {
      setError(e.message || "Der opstod en fejl under indlæsning af datoer.");
    } finally {
      setLoadingDates(false);
    }
  };

  // Pre-load sequential historical data points for the 2 trends (Overdue & Payment Trends)
  const fetchTrends = async (dates: string[]) => {
    const trendDates = [...dates].reverse().slice(-5); // last 5 chronological dates
    try {
      const results = await Promise.all(
        trendDates.map(async (d) => {
          const res = await fetch(`/api/debitor/refresh?snapshotDate=${d}`);
          if (res.ok) {
            const payload: RefreshResult = await res.json();
            return {
              date: d,
              overdue: payload.executiveSummary?.totalOverdue || 0,
              payments: payload.executiveSummary?.payments14DaysTotal || 0,
              balance: payload.executiveSummary?.totalExposure || 0,
            };
          }
          return null;
        })
      );
      setHistoricalTrendData(results.filter((x): x is NonNullable<typeof x> => x !== null));
    } catch (err) {
      console.error("Failed to load historical trend snapshots:", err);
    }
  };

  // Load orchestrated snapshot data whenever selectedDate changes
  useEffect(() => {
    if (!selectedDate) {
      setCurrentData(null);
      setPrevData(null);
      return;
    }

    const loadOrchestratedData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        // Find previous chronological date for comparisons
        const activeIdx = availableDates.indexOf(selectedDate);
        const prevSnapshotDate =
          activeIdx !== -1 && activeIdx < availableDates.length - 1 ? availableDates[activeIdx + 1] : null;

        // Fetch current snapshot
        const currentRes = await fetch(`/api/debitor/refresh?snapshotDate=${selectedDate}`);
        if (!currentRes.ok) throw new Error(`Fejl ved indlæsning af dagsdata for ${selectedDate}`);
        const currentPayload: RefreshResult = await currentRes.json();
        setCurrentData(currentPayload);

        // Fetch previous snapshot if available
        if (prevSnapshotDate) {
          const prevRes = await fetch(`/api/debitor/refresh?snapshotDate=${prevSnapshotDate}`);
          if (prevRes.ok) {
            const prevPayload: RefreshResult = await prevRes.json();
            setPrevData(prevPayload);
          } else {
            setPrevData(null);
          }
        } else {
          setPrevData(null);
        }

        // Reset subfilters and selections
        setSelectedRowNo(null);
        setActiveAlertFilter(null);
        setCurrentPage(1);
      } catch (err: any) {
        setError(err.message || "Kunne ikke indlæse dashboard.");
      } finally {
        setLoadingData(false);
      }
    };

    loadOrchestratedData();
  }, [selectedDate, availableDates]);

  // Execute a forced rebuild
  const handleForcedRefresh = async () => {
    if (!selectedDate || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/debitor/refresh?snapshotDate=${selectedDate}&force=true`);
      if (!res.ok) throw new Error("Fejl under tvungen genberegning af debitor datagrundlag.");
      const freshPayload: RefreshResult = await res.json();
      setCurrentData(freshPayload);
      triggerNotification("Porteføljeberegninger er opdateret og genindlæst med succes!");
    } catch (err: any) {
      triggerNotification(`Fejl ved opdatering: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const triggerNotification = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => {
      setShowNotification(null);
    }, 4000);
  };

  // Helper to compare values between current and previous snapshots for KPI Cards
  const getCardTrend = (field: keyof ExecutiveSummary | "debtorsWithOverdueCount", type: "currency" | "number" | "percentage") => {
    if (!currentData) return null;
    
    let currentVal = 0;
    let prevVal = 0;

    if (field === "debtorsWithOverdueCount") {
      currentVal = currentData.kpis.summary.debtorsWithOverdueCount;
      prevVal = prevData ? prevData.kpis.summary.debtorsWithOverdueCount : 0;
    } else {
      currentVal = (currentData.executiveSummary[field] as number) || 0;
      prevVal = prevData ? (prevData.executiveSummary[field] as number) || 0 : 0;
    }

    if (!prevData || prevVal === 0) {
      return { text: "↓", isNeutral: true, isPositive: false, isWarning: false };
    }

    const diff = currentVal - prevVal;
    const pct = (diff / prevVal) * 100;
    const isZero = diff === 0;

    if (isZero) {
      return { text: "▲ 0.0%", isNeutral: true, isPositive: false, isWarning: false };
    }

    // Determine if positive is good or warning
    let isPositiveGood = true; // For payments, positive is good
    if (
      field === "totalOverdue" ||
      field === "averageRiskScore" ||
      field === "criticalCustomersCount" ||
      field === "debtorsWithOverdueCount" ||
      field === "customersWithoutPurchaseCount" ||
      field === "customersWithoutPaymentCount" ||
      field === "legalCandidatesCount" ||
      field === "creditStopsCount" ||
      field === "collectionRequiredCount"
    ) {
      isPositiveGood = false; // Increasing overdue or risk is a warning!
    }

    const pctText = `${diff > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;

    return {
      text: pctText,
      isNeutral: false,
      isPositive: diff > 0 ? isPositiveGood : !isPositiveGood,
      isWarning: diff > 0 ? !isPositiveGood : isPositiveGood,
    };
  };

  // Extracted lists of filter options from loaded rows
  const filterOptions = useMemo(() => {
    const output = {
      creditHandlings: new Set<string>(),
      paymentTerms: new Set<string>(),
      locations: new Set<string>(),
      salespersons: new Set<string>(),
      sellers: new Set<string>(),
    };

    if (currentData) {
      currentData.kpis.customers.forEach((c) => {
        if (c.creditHandling) output.creditHandlings.add(c.creditHandling.trim());
        if (c.paymentTerms) output.paymentTerms.add(c.paymentTerms.trim());
        if (c.location) output.locations.add(c.location.trim());
        if (c.salesperson) output.salespersons.add(c.salesperson.trim());
        if (c.seller) output.sellers.add(c.seller.trim());
      });
    }

    return {
      creditHandlings: Array.from(output.creditHandlings).sort(),
      paymentTerms: Array.from(output.paymentTerms).sort(),
      locations: Array.from(output.locations).sort(),
      salespersons: Array.from(output.salespersons).sort(),
      sellers: Array.from(output.sellers).sort(),
    };
  }, [currentData]);

  // Master Filter & Search Pipeline
  const filteredCustomers = useMemo(() => {
    if (!currentData) return [];

    let list = currentData.kpis.customers.map((cust) => {
      const risk = currentData.riskResults.find((r) => r.customerNo === cust.customerNo);
      return {
        ...cust,
        riskResult: risk,
      };
    });

    // 1. Apply Active Alert Filter from alert panel interaction
    if (activeAlertFilter) {
      if (activeAlertFilter.customerNo) {
        list = list.filter((c) => c.customerNo === activeAlertFilter.customerNo);
      } else {
        const type = activeAlertFilter.type;
        if (type === "credit_stop") {
          list = list.filter(
            (c) =>
              c.creditHandling.toLowerCase().includes("stop") ||
              c.creditHandling.toLowerCase().includes("spærret")
          );
        } else if (type === "broken_promise") {
          list = list.filter((c) => c.riskResult?.hasBrokenPromise);
        } else if (type === "no_payment_30_days") {
          list = list.filter((c) => c.daysSincePayment !== null && c.daysSincePayment > 30);
        } else if (type === "large_balance_increase") {
          list = list.filter((c) => c.balanceDelta7 && c.balanceDelta7 > 50000);
        } else if (type === "large_overdue_increase") {
          list = list.filter((c) => c.newOverdue && c.newOverdue > 20000);
        } else if (type === "missing_credit_handling") {
          list = list.filter((c) => !c.creditHandling || c.creditHandling.trim() === "");
        } else if (type === "risk_increased") {
          // Find any whose risk is increased
          list = list.filter((c) => {
            const prev = prevData?.riskResults.find((p) => p.customerNo === c.customerNo);
            const currentScore = c.riskResult?.riskScore ?? 0;
            const prevScore = prev?.riskScore ?? 0;
            return currentScore - prevScore >= 15;
          });
        }
      }
    }

    // 2. Global search matching specifications: Customer No, Customer Name, Salesperson, Location, Seller
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.customerNo.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q) ||
          c.salesperson.toLowerCase().includes(q) ||
          (c.seller || "").toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q)
      );
    }

    // 3. Apply Multi-Select Sidebar Filters
    if (selectedRiskLevels.length > 0) {
      list = list.filter((c) => c.riskResult && selectedRiskLevels.includes(c.riskResult.riskLevel));
    }

    if (selectedPriorities.length > 0) {
      list = list.filter((c) => c.riskResult && selectedPriorities.includes(c.riskResult.collectionPriority));
    }

    if (filterCreditHandling) {
      list = list.filter((c) => c.creditHandling === filterCreditHandling);
    }

    if (filterPaymentTerms) {
      list = list.filter((c) => c.paymentTerms === filterPaymentTerms);
    }

    if (filterLocation) {
      list = list.filter((c) => c.location === filterLocation);
    }

    if (filterSalesperson) {
      list = list.filter((c) => c.salesperson === filterSalesperson);
    }

    if (filterSeller) {
      list = list.filter((c) => c.seller === filterSeller);
    }

    if (filterHasOverdue) {
      list = list.filter((c) => c.overdue > 0);
    }

    if (filterHasBalance) {
      list = list.filter((c) => c.balance > 0);
    }

    if (filterNoPurchase14Days) {
      list = list.filter((c) => c.riskInputs.noPurchase14Days);
    }

    if (filterNoPayment14Days) {
      list = list.filter((c) => c.riskInputs.noPayment14Days);
    }

    if (filterBrokenPromise) {
      list = list.filter((c) => c.riskResult?.hasBrokenPromise);
    }

    if (filterOpenActions) {
      list = list.filter(
        (c) =>
          c.latestAction &&
          c.latestAction.status !== "completed" &&
          c.latestAction.status !== "cancelled"
      );
    }

    return list;
  }, [
    currentData,
    prevData,
    searchQuery,
    activeAlertFilter,
    selectedRiskLevels,
    selectedPriorities,
    filterCreditHandling,
    filterPaymentTerms,
    filterLocation,
    filterSalesperson,
    filterSeller,
    filterHasOverdue,
    filterHasBalance,
    filterNoPurchase14Days,
    filterNoPayment14Days,
    filterBrokenPromise,
    filterOpenActions
  ]);

  // Sorting Logic: Default is Risk DESC then Overdue DESC
  const sortedCustomers = useMemo(() => {
    const result = [...filteredCustomers];
    if (!sortConfig) {
      return result.sort((a, b) => {
        const aScore = a.riskResult?.riskScore ?? 0;
        const bScore = b.riskResult?.riskScore ?? 0;
        if (bScore !== aScore) return bScore - aScore;
        return b.overdue - a.overdue;
      });
    }

    const { key, direction } = sortConfig;
    return result.sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      if (key === "customerNo") {
        aVal = a.customerNo;
        bVal = b.customerNo;
      } else if (key === "customerName") {
        aVal = a.customerName.toLowerCase();
        bVal = b.customerName.toLowerCase();
      } else if (key === "balance") {
        aVal = a.balance;
        bVal = b.balance;
      } else if (key === "overdue") {
        aVal = a.overdue;
        bVal = b.overdue;
      } else if (key === "seller") {
        aVal = (a.seller || "").toLowerCase();
        bVal = (b.seller || "").toLowerCase();
      } else if (key === "salesperson") {
        aVal = (a.salesperson || "").toLowerCase();
        bVal = (b.salesperson || "").toLowerCase();
      } else if (key === "paymentTerms") {
        aVal = a.paymentTerms;
        bVal = b.paymentTerms;
      } else if (key === "creditHandling") {
        aVal = a.creditHandling;
        bVal = b.creditHandling;
      } else if (key === "lastInvoice") {
        aVal = a.lastInvoice || "";
        bVal = b.lastInvoice || "";
      } else if (key === "payment14Days") {
        aVal = a.payment14Days;
        bVal = b.payment14Days;
      } else if (key === "balanceDelta7") {
        aVal = a.balanceDelta7 || 0;
        bVal = b.balanceDelta7 || 0;
      } else if (key === "risk") {
        aVal = a.riskResult?.riskScore ?? 0;
        bVal = b.riskResult?.riskScore ?? 0;
      } else if (key === "priority") {
        const priorityOrder = {
          Priority1: 6,
          Priority2: 5,
          Priority3: 4,
          Priority4: 3,
          Priority5: 2,
          Priority6: 1
        };
        aVal = a.riskResult ? priorityOrder[a.riskResult.collectionPriority] || 0 : 0;
        bVal = b.riskResult ? priorityOrder[b.riskResult.collectionPriority] || 0 : 0;
      } else if (key === "recommendation") {
        aVal = a.riskResult?.recommendation || "";
        bVal = b.riskResult?.recommendation || "";
      } else if (key === "latestAction") {
        aVal = a.latestAction?.comment || "";
        bVal = b.latestAction?.comment || "";
      } else if (key === "status") {
        aVal = a.riskResult?.customerStatus || "";
        bVal = b.riskResult?.customerStatus || "";
      }

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredCustomers, sortConfig]);

  // Pagination Window
  const totalPages = Math.ceil(sortedCustomers.length / pageSize);
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, currentPage, pageSize]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedRiskLevels,
    selectedPriorities,
    filterCreditHandling,
    filterPaymentTerms,
    filterLocation,
    filterSalesperson,
    filterSeller,
    filterHasOverdue,
    filterHasBalance,
    filterNoPurchase14Days,
    filterNoPayment14Days,
    filterBrokenPromise,
    filterOpenActions,
    activeAlertFilter
  ]);

  const toggleSort = (key: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "desc" };
      }
      if (prev.direction === "desc") {
        return { key, direction: "asc" };
      }
      return null;
    });
  };

  const handleClearFilters = () => {
    setSelectedRiskLevels([]);
    setSelectedPriorities([]);
    setFilterCreditHandling("");
    setFilterPaymentTerms("");
    setFilterLocation("");
    setFilterSalesperson("");
    setFilterSeller("");
    setFilterHasOverdue(false);
    setFilterHasBalance(false);
    setFilterNoPurchase14Days(false);
    setFilterNoPayment14Days(false);
    setFilterBrokenPromise(false);
    setFilterOpenActions(false);
    setActiveAlertFilter(null);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      selectedRiskLevels.length > 0 ||
      selectedPriorities.length > 0 ||
      filterCreditHandling !== "" ||
      filterPaymentTerms !== "" ||
      filterLocation !== "" ||
      filterSalesperson !== "" ||
      filterSeller !== "" ||
      filterHasOverdue ||
      filterHasBalance ||
      filterNoPurchase14Days ||
      filterNoPayment14Days ||
      filterBrokenPromise ||
      filterOpenActions ||
      activeAlertFilter !== null
    );
  }, [
    selectedRiskLevels,
    selectedPriorities,
    filterCreditHandling,
    filterPaymentTerms,
    filterLocation,
    filterSalesperson,
    filterSeller,
    filterHasOverdue,
    filterHasBalance,
    filterNoPurchase14Days,
    filterNoPayment14Days,
    filterBrokenPromise,
    filterOpenActions,
    activeAlertFilter
  ]);

  // Collection priorities grouping calculation for queue card
  const collectionPriorityQueue = useMemo(() => {
    const priorityGroups = [
      { key: "Priority1", label: "P1: Kritisk retslig", color: "bg-red-500", textCol: "text-red-700" },
      { key: "Priority2", label: "P2: Aktiv inkasso", color: "bg-orange-500", textCol: "text-orange-700" },
      { key: "Priority3", label: "P3: Telefon rykker", color: "bg-yellow-500", textCol: "text-yellow-700" },
      { key: "Priority4", label: "P4: E-mail rykker", color: "bg-blue-500", textCol: "text-blue-700" },
      { key: "Priority5", label: "P5: Monitorering", color: "bg-emerald-500", textCol: "text-emerald-700" },
      { key: "Priority6", label: "P6: Rutinekontrol", color: "bg-slate-400", textCol: "text-slate-700" }
    ];

    if (!currentData) return [];

    return priorityGroups.map((g) => {
      const pResult = currentData.riskResults.filter((r) => r.collectionPriority === g.key);
      const customerNos = pResult.map((r) => r.customerNo);
      const matchedCustomers = currentData.kpis.customers.filter((c) => customerNos.includes(c.customerNo));

      const count = matchedCustomers.length;
      const outstanding = matchedCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
      const overdue = matchedCustomers.reduce((sum, c) => sum + (c.overdue || 0), 0);

      return {
        ...g,
        count,
        outstanding,
        overdue
      };
    });
  }, [currentData]);

  // Recharts: Calculate Risk distribution pie/bar dataset
  const riskDistributionData = useMemo(() => {
    if (!currentData) return [];
    const levels = ["Low", "Medium", "High", "VeryHigh", "Critical"];
    const colors = {
      Low: "#10B981",
      Medium: "#3B82F6",
      High: "#F59E0B",
      VeryHigh: "#EF4444",
      Critical: "#DC2626"
    };

    return levels.map((lvl) => {
      const count = currentData.riskResults.filter((r) => r.riskLevel === lvl).length;
      return {
        name: lvl,
        Kunder: count,
        fill: colors[lvl as keyof typeof colors]
      };
    });
  }, [currentData]);

  // Recharts: Calculate priority distribution dataset
  const priorityDistributionData = useMemo(() => {
    if (!currentData) return [];
    const priorities = ["Priority1", "Priority2", "Priority3", "Priority4", "Priority5", "Priority6"];
    const priorityLabels = ["P1", "P2", "P3", "P4", "P5", "P6"];
    const colors = ["#DC2626", "#F97316", "#EAB308", "#2563EB", "#16A34A", "#64748B"];

    return priorities.map((p, idx) => {
      const count = currentData.riskResults.filter((r) => r.collectionPriority === p).length;
      return {
        name: priorityLabels[idx],
        Kunder: count,
        fill: colors[idx]
      };
    });
  }, [currentData]);

  // Interactive Double click & Eye actions
  const handleOpenCustomerCard = (customer: CustomerViewModel) => {
    const risk = currentData?.riskResults.find((r) => r.customerNo === customer.customerNo);
    setActiveCustomerCard({
      ...customer,
      riskResult: risk,
    });
  };

  // --- RENDERING ---
  return (
    <div className="space-y-6 font-sans">
      {/* 1. NOTIFICATION BANNER */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold"
          >
            <Sparkles className="h-4 w-4 text-brand animate-pulse" />
            <span>{showNotification}</span>
            <button onClick={() => setShowNotification(null)} className="text-gray-400 hover:text-white ml-2">
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. HEADER VIEW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            Saldoopfølgning
            <span className="text-xs bg-brand-light text-brand px-2.5 py-1 rounded-full font-bold">
              Beregner V1.0
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Vis og overvåg debitorudestående, forfaldne saldi og betalingsbetingelser.
          </p>
        </div>

        {/* 3. SNAPSHOT SELECTOR & HEADER ACTIONS */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Timestamp */}
          {currentData && (
            <div className="text-[10px] bg-slate-50 text-slate-500 px-2.5 py-1.5 rounded-lg border border-slate-100 font-mono hidden lg:flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>Opdateret: {new Date(currentData.refreshedAt).toLocaleTimeString("da-DK")}</span>
            </div>
          )}

          {/* Snapshot selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Rapport:</span>
            {loadingDates ? (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <RefreshCw className="h-3 w-3 animate-spin text-brand" />
              </div>
            ) : availableDates.length === 0 ? (
              <span className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded font-semibold border border-red-100">
                Ingen importer
              </span>
            ) : (
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 shadow-3xs focus:outline-hidden focus:ring-1 focus:ring-brand cursor-pointer"
              >
                {availableDates.map((d, index) => (
                  <option key={d} value={d}>
                    {index === 0 ? `Seneste (${formatDate(d)})` : formatDate(d)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleForcedRefresh}
            disabled={refreshing || !selectedDate}
            className="flex items-center gap-1.5 bg-brand text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-3xs cursor-pointer hover:bg-brand-hover disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Opdater</span>
          </button>

          {/* PDF Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!selectedDate || !!downloadingReport}
              className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-3xs cursor-pointer hover:bg-slate-50 disabled:opacity-50 transition"
            >
              {downloadingReport ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" />
              ) : (
                <Download className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>Eksporter PDF</span>
              <ChevronDown className="h-3 w-3 text-slate-400 ml-0.5" />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1.5 origin-top-right">
                  <button
                    onClick={() => handleDownloadReport("dashboard")}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand flex items-center gap-2 cursor-pointer"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Dashboard Oversigt
                  </button>
                  <button
                    onClick={() => handleDownloadReport("collection")}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand flex items-center gap-2 cursor-pointer"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Rykkerliste (Inkasso)
                  </button>
                  <button
                    onClick={() => handleDownloadReport("executive")}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand flex items-center gap-2 cursor-pointer"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Ledelsesrapport (KPIs)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- ERROR STATE --- */}
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl p-4 flex gap-3 text-sm items-start shadow-3xs">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Genberegning fejlede</h4>
            <p className="text-xs text-red-700/80 mt-1">{error}</p>
            <button
              onClick={() => fetchDates(selectedDate)}
              className="mt-3 bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-red-700 transition"
            >
              Prøv igen
            </button>
          </div>
        </div>
      )}

      {/* --- LOADING SKELETON --- */}
      {loadingData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3 h-24 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-50 rounded-xl h-60 animate-pulse lg:col-span-2" />
            <div className="bg-slate-50 rounded-xl h-60 animate-pulse" />
          </div>
        </div>
      )}

      {/* --- DYNAMIC DASHBOARD CONTENT --- */}
      {!loadingData && currentData && (
        <div className="space-y-6">
          {/* 4. EXECUTIVE KPI CARDS (12 Cards with expand/collapse) */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {/* KPI 1: Total Balance */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs relative group hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Eksponering</p>
                  <Tooltip text="Portföy genelindeki tüm pozitif açık bakiye toplamı.">
                    <CreditCardIcon className="text-blue-500 bg-blue-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 truncate">
                  {formatCurrency(currentData.executiveSummary?.totalExposure || 0)}
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Rapportsaldo</span>
                  {renderCardTrend(getCardTrend("totalExposure", "currency"))}
                </div>
              </div>

              {/* KPI 2: Total Overdue */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Overforfalden</p>
                  <Tooltip text="Tüm müşteriler genelinde vadesi geçmiş toplam borç miktarı.">
                    <ShieldAlertIcon className="text-red-500 bg-red-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-red-600 mt-2 truncate">
                  {formatCurrency(currentData.executiveSummary?.totalOverdue || 0)}
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Forfaldent</span>
                  {renderCardTrend(getCardTrend("totalOverdue", "currency"))}
                </div>
              </div>

              {/* KPI 3: Payments Last 14 Days */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Indbetaling 14d</p>
                  <Tooltip text="Seçilen tarih itibarıyla son 14 günde tahsil edilen toplam tutar.">
                    <TrendingUpIcon className="text-emerald-500 bg-emerald-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-emerald-600 mt-2 truncate">
                  {formatCurrency(currentData.executiveSummary?.payments14DaysTotal || 0)}
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Seneste 14 dage</span>
                  {renderCardTrend(getCardTrend("payments14DaysTotal", "currency"))}
                </div>
              </div>

              {/* KPI 4: Average Risk */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-sans">Gns. Risikoscore</p>
                  <Tooltip text="Açık bakiyesi olan müşterilerin ortalama risk puanı.">
                    <ActivityIcon className="text-blue-500 bg-blue-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-slate-800 mt-2">
                  {currentData.executiveSummary?.averageRiskScore.toFixed(1)} <span className="text-[10px] text-gray-400">/100</span>
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Porteføljerisk</span>
                  {renderCardTrend(getCardTrend("averageRiskScore", "number"))}
                </div>
              </div>

              {/* KPI 5: Critical Customers */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kritiske Kunder</p>
                  <Tooltip text="Risk puanı 'Kritik' veya 'Çok Yüksek' olan müşteri sayısı.">
                    <AlertTriangleIcon className="text-red-500 bg-red-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-red-600 mt-2">
                  {currentData.executiveSummary?.criticalCustomersCount} <span className="text-[10px] text-gray-400">debitorer</span>
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Højrisiko</span>
                  {renderCardTrend(getCardTrend("criticalCustomersCount", "number"))}
                </div>
              </div>

              {/* KPI 6: Customers With Overdue */}
              <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kunder m/ Forfald</p>
                  <Tooltip text="Vadesi geçmiş borcu bulunan aktif benzersiz müşteri sayısı.">
                    <UsersIcon className="text-orange-500 bg-orange-50" />
                  </Tooltip>
                </div>
                <h3 className="text-base font-extrabold text-slate-800 mt-2">
                  {currentData.kpis.summary.debtorsWithOverdueCount} <span className="text-[10px] text-gray-400">aktive</span>
                </h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Antal over frist</span>
                  {renderCardTrend(getCardTrend("debtorsWithOverdueCount", "number"))}
                </div>
              </div>
            </div>

            {/* See More/Fewer Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowAllKpis(!showAllKpis)}
                className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 hover:text-brand px-3 py-1.5 rounded-lg text-xs font-bold shadow-3xs cursor-pointer transition"
              >
                <span>{showAllKpis ? "Skjul ekstra KPI'er" : "Se flere KPI'er (Flere KPI'er)"}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAllKpis ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Collapsible KPIs 7 to 12 */}
            <AnimatePresence>
              {showAllKpis && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 pt-1">
                    {/* KPI 7: Customers Without Purchase */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Passive Kunder</p>
                        <Tooltip text="Açık bakiyesi olan ve 14 günden uzun süredir alışveriş yapmayan müşteriler.">
                          <ShoppingBagIcon className="text-amber-500 bg-amber-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-slate-800 mt-2">
                        {currentData.executiveSummary?.customersWithoutPurchaseCount} <span className="text-[10px] text-gray-400">debitorer</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Uden køb i 14d</span>
                        {renderCardTrend(getCardTrend("customersWithoutPurchaseCount", "number"))}
                      </div>
                    </div>

                    {/* KPI 8: Customers Without Payment */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Uden Indbetaling</p>
                        <Tooltip text="Pozitif bakiyesi olan ve son 14 günde hiç ödeme yapmayan müşteriler.">
                          <DollarSignIcon className="text-orange-500 bg-orange-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-slate-800 mt-2">
                        {currentData.executiveSummary?.customersWithoutPaymentCount} <span className="text-[10px] text-gray-400">debitorer</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Intet modtaget 14d</span>
                        {renderCardTrend(getCardTrend("customersWithoutPaymentCount", "number"))}
                      </div>
                    </div>

                    {/* KPI 9: Broken Payment Promises */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Brudte Løfter</p>
                        <Tooltip text="Yazılı ödeme sözünü tutmayan müşteri sayısı.">
                          <FileWarningIcon className="text-red-600 bg-red-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-red-600 mt-2">
                        {currentData.executiveSummary?.paymentPromiseKPI.brokenPromises} <span className="text-[10px] text-gray-400">brudte</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Ikke overholdt</span>
                        {renderCardTrend(getCardTrend("paymentPromisesCount", "number"))}
                      </div>
                    </div>

                    {/* KPI 10: Legal Candidates */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Retskandidater</p>
                        <Tooltip text="Yasal takip aşamasındaki veya icra sürecindeki müşteriler.">
                          <ScaleIcon className="text-red-700 bg-red-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-red-700 mt-2">
                        {currentData.executiveSummary?.legalCandidatesCount} <span className="text-[10px] text-gray-400">kunder</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Retlig proces</span>
                        {renderCardTrend(getCardTrend("legalCandidatesCount", "number"))}
                      </div>
                    </div>

                    {/* KPI 11: Credit Stops */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aktive Kreditstop</p>
                        <Tooltip text="Üzerinde aktif kredi kilidi/sevkiyat engeli olan müşteri sayısı.">
                          <OctagonIcon className="text-red-600 bg-red-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-red-600 mt-2">
                        {currentData.executiveSummary?.creditStopsCount} <span className="text-[10px] text-gray-400">leveringsspærret</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Kreditstyring</span>
                        {renderCardTrend(getCardTrend("creditStopsCount", "number"))}
                      </div>
                    </div>

                    {/* KPI 12: Collection Required */}
                    <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-3xs hover:border-gray-200 transition">
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rykkerbehov</p>
                        <Tooltip text="Arama veya ihtar yapılması gereken, vadesi geçmiş borcu olan müşteriler.">
                          <InboxIcon className="text-orange-500 bg-orange-50" />
                        </Tooltip>
                      </div>
                      <h3 className="text-base font-extrabold text-amber-600 mt-2">
                        {currentData.executiveSummary?.collectionRequiredCount} <span className="text-[10px] text-gray-400">kunder</span>
                      </h3>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Aktivitet påkrævet</span>
                        {renderCardTrend(getCardTrend("collectionRequiredCount", "number"))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 5. SECONDARY SECTION: ALERTS PANEL & COLLECTION QUEUE (Split grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Alerts Panel */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-3xs p-4 flex flex-col h-full hover:border-gray-200 transition lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
                  <h3 className="font-extrabold text-slate-800 text-sm">Aktive Alarmer & Anomalier</h3>
                </div>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-bold">
                  {currentData.executiveSummary?.alerts.length || 0} fundet
                </span>
              </div>

              {/* Alerts List */}
              <div className="overflow-auto max-h-[280px] space-y-2 pr-1 scrollbar-thin flex-1">
                {(!currentData.executiveSummary?.alerts || currentData.executiveSummary.alerts.length === 0) ? (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    <Check className="h-6 w-6 text-emerald-500 mx-auto mb-1.5" />
                    Ingen uregelmæssigheder fundet i dette snapshot.
                  </div>
                ) : (
                  [...currentData.executiveSummary.alerts]
                    .sort((a, b) => {
                      const prioWeight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
                      return prioWeight[b.priority] - prioWeight[a.priority];
                    })
                    .map((alert) => {
                      const prioColors = {
                        Critical: "bg-red-50 text-red-700 border-red-100 hover:bg-red-100/50",
                        High: "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100/50",
                        Medium: "bg-yellow-50 text-yellow-800 border-yellow-100 hover:bg-yellow-100/50",
                        Low: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100/50"
                      };

                      return (
                        <div
                          key={alert.id}
                          onClick={() => {
                            setActiveAlertFilter(alert);
                            triggerNotification(`Filtreret tabel efter alarm: ${alert.title}`);
                          }}
                          className={`p-2.5 border rounded-lg text-xs cursor-pointer transition flex items-start gap-2.5 ${
                            prioColors[alert.priority]
                          }`}
                        >
                          <div className="mt-0.5">
                            {alert.priority === "Critical" ? (
                              <Octagon className="h-3.5 w-3.5 shrink-0" />
                            ) : alert.priority === "High" ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-bold truncate">{alert.title}</h4>
                              <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.2 rounded-full border border-current">
                                {alert.priority}
                              </span>
                            </div>
                            <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{alert.message}</p>
                            {alert.customerName && (
                              <div className="text-[10px] mt-1 opacity-80 font-semibold flex items-center gap-1">
                                <span className="bg-white/60 px-1 py-0.2 rounded text-[9px] font-mono">
                                  Kunde: {alert.customerNo}
                                </span>
                                <span className="truncate">{alert.customerName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Alert filtering indicator */}
              {activeAlertFilter && (
                <div className="mt-3 bg-brand-light text-brand p-2 rounded-lg flex items-center justify-between text-xs font-bold border border-brand/20">
                  <span>Filtreret efter alarm: {activeAlertFilter.title}</span>
                  <button
                    onClick={() => setActiveAlertFilter(null)}
                    className="p-1 hover:bg-white/50 rounded-md text-brand"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Collection Priorities Queue */}
            <div className="bg-white border border-gray-100 rounded-xl shadow-3xs p-4 flex flex-col h-full hover:border-gray-200 transition">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4.5 w-4.5 text-brand" />
                  <h3 className="font-extrabold text-slate-800 text-sm">Opfølgningskø</h3>
                </div>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-bold">
                  Dagens rykkeropgaver
                </span>
              </div>

              {/* Priority Groups */}
              <div className="space-y-2 overflow-auto max-h-[280px] flex-1 scrollbar-thin">
                {collectionPriorityQueue.map((g) => (
                  <div
                    key={g.key}
                    onClick={() => {
                      // Toggle priority list filter
                      setSelectedPriorities((prev) =>
                        prev.includes(g.key) ? prev.filter((p) => p !== g.key) : [...prev, g.key]
                      );
                      triggerNotification(`Togler filter for prioritet: ${g.key}`);
                    }}
                    className={`p-2.5 rounded-lg border border-slate-100 flex items-center justify-between cursor-pointer transition hover:bg-slate-50/50 ${
                      selectedPriorities.includes(g.key) ? "ring-2 ring-brand border-transparent bg-brand-light/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${g.color}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{g.label}</p>
                        <p className="text-[10px] text-gray-400 font-semibold">{g.count} debitorer</p>
                      </div>
                    </div>

                    <div className="text-right whitespace-nowrap font-mono">
                      <p className="text-xs font-bold text-slate-800">{formatCurrency(g.outstanding)}</p>
                      <p className={`text-[10px] font-semibold ${g.overdue > 0 ? "text-red-500" : "text-gray-400"}`}>
                        Overf: {formatCurrency(g.overdue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. MAIN DEBTOR TABLE SECTION */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-3xs overflow-hidden">
            {/* Table Toolbar */}
            <div className="p-4 border-b border-gray-50 bg-slate-50/50 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Søg på kundenr., navn, sælger..."
                    className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-brand shadow-3xs text-gray-700"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-2.5 p-0.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Filters, column visibility, and row count */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter Toggle */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition ${
                      hasActiveFilters || showFilters
                        ? "bg-brand/10 border-brand text-brand"
                        : "bg-white border-gray-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtrering</span>
                    {hasActiveFilters && (
                      <span className="bg-brand text-white text-[9px] px-1.5 py-0.2 rounded-full font-black">
                        Aktiv
                      </span>
                    )}
                  </button>

                  {/* Columns toggle button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColumnConfig(!showColumnConfig)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-50 transition"
                    >
                      <SlidersIcon className="h-3.5 w-3.5" />
                      <span>Søjler</span>
                    </button>

                    {showColumnConfig && (
                      <div className="absolute right-0 top-full mt-2 z-30 bg-white border border-gray-100 rounded-xl shadow-xl p-3 w-48 space-y-2">
                        <div className="flex justify-between items-center border-b border-gray-50 pb-1.5 mb-1.5">
                          <span className="text-xs font-bold text-slate-800">Vis/skjul søjler</span>
                          <button onClick={() => setShowColumnConfig(false)} className="text-gray-400 hover:text-slate-600">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="max-h-[220px] overflow-auto space-y-1.5 scrollbar-thin">
                          {Object.keys(visibleColumns)
                            .filter((col) => {
                              const allowed = ["customerNo", "customerName", "balance", "overdue", "salesperson", "paymentTerms", "lastInvoice", "payment14Days", "balanceDelta7", "risk"];
                              return allowed.includes(col);
                            })
                            .map((col) => {
                              const labels: Record<string, string> = {
                                customerNo: "Kundenr.",
                                customerName: "Kundenavn",
                                balance: "Saldo",
                                overdue: "Forfalden",
                                salesperson: "Kredithåndtering",
                                paymentTerms: "Betalingsbet.",
                                lastInvoice: "Seneste Faktura",
                                payment14Days: "Betaling 14d",
                                balanceDelta7: "Saldo Δ 7d",
                                risk: "Risiko"
                              };

                            return (
                              <label key={col} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns[col]}
                                  onChange={() =>
                                    setVisibleColumns((prev) => ({
                                      ...prev,
                                      [col]: !prev[col]
                                    }))
                                  }
                                  className="rounded border-gray-300 text-brand focus:ring-brand h-3.5 w-3.5"
                                />
                                <span>{labels[col] || col}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean up button */}
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="px-2.5 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      Nulstil
                    </button>
                  )}

                  {/* Active Count */}
                  <span className="text-xs text-slate-400 font-semibold ml-2">
                    {sortedCustomers.length} fundet
                  </span>
                </div>
              </div>

              {/* Expandable Advanced Filter Panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3.5 pb-2">
                      {/* Filter: Risk Level */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Risikoniveau</label>
                        <div className="flex bg-slate-50 p-1 rounded-md flex-wrap gap-1">
                          {["Low", "Medium", "High", "VeryHigh", "Critical"].map((lvl) => {
                            const isSelected = selectedRiskLevels.includes(lvl);
                            return (
                              <button
                                key={lvl}
                                onClick={() =>
                                  setSelectedRiskLevels((prev) =>
                                    prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]
                                  )
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                  isSelected
                                    ? "bg-brand text-white"
                                    : "bg-white text-slate-500 hover:text-slate-800 border border-slate-100"
                                }`}
                              >
                                {lvl === "VeryHigh" ? "V.High" : lvl}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Filter: Credit Handling */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Kreditstyring</label>
                        <select
                          value={filterCreditHandling}
                          onChange={(e) => setFilterCreditHandling(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:ring-1 focus:ring-brand font-medium"
                        >
                          <option value="">Alle</option>
                          {filterOptions.creditHandlings.map((ch) => (
                            <option key={ch} value={ch}>
                              {ch}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter: Payment Terms */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Betalingsbet.</label>
                        <select
                          value={filterPaymentTerms}
                          onChange={(e) => setFilterPaymentTerms(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:ring-1 focus:ring-brand font-medium"
                        >
                          <option value="">Alle</option>
                          {filterOptions.paymentTerms.map((pt) => (
                            <option key={pt} value={pt}>
                              {pt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter: Location */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Lokation</label>
                        <select
                          value={filterLocation}
                          onChange={(e) => setFilterLocation(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:ring-1 focus:ring-brand font-medium"
                        >
                          <option value="">Alle</option>
                          {filterOptions.locations.map((lc) => (
                            <option key={lc} value={lc}>
                              {lc}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter: Kredithåndtering */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Kredithåndtering</label>
                        <select
                          value={filterSalesperson}
                          onChange={(e) => setFilterSalesperson(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:ring-1 focus:ring-brand font-medium"
                        >
                          <option value="">Alle</option>
                          {filterOptions.salespersons.map((sp) => (
                            <option key={sp} value={sp}>
                              {sp}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter: Sælger */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Sælger</label>
                        <select
                          value={filterSeller}
                          onChange={(e) => setFilterSeller(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600 focus:ring-1 focus:ring-brand font-medium"
                        >
                          <option value="">Alle</option>
                          {filterOptions.sellers.map((sl) => (
                            <option key={sl} value={sl}>
                              {sl}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Checkbox Flags */}
                      <div className="sm:col-span-2 lg:col-span-4 xl:col-span-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-dashed border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterHasOverdue}
                            onChange={(e) => setFilterHasOverdue(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Har Forfald</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterHasBalance}
                            onChange={(e) => setFilterHasBalance(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Har Saldo</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterNoPurchase14Days}
                            onChange={(e) => setFilterNoPurchase14Days(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Intet Køb (14d)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterNoPayment14Days}
                            onChange={(e) => setFilterNoPayment14Days(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Ingen Betaling (14d)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterBrokenPromise}
                            onChange={(e) => setFilterBrokenPromise(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Brudt Betalingsløfte</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-800">
                          <input
                            type="checkbox"
                            checked={filterOpenActions}
                            onChange={(e) => setFilterOpenActions(e.target.checked)}
                            className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                          />
                          <span>Åbne Opgaver</span>
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Debtor Table Grid */}
            <div className="overflow-x-auto overflow-y-auto max-h-[580px] scrollbar-thin relative">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead>
                  <tr className="sticky top-0 z-15 bg-slate-100/90 backdrop-blur-xs border-b border-gray-200 text-gray-500 text-[10px] font-black tracking-wider uppercase">
                    {visibleColumns.customerNo && (
                      <th onClick={() => toggleSort("customerNo")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200 w-24">
                        <div className="flex items-center gap-1.5">
                          <span>Kundenr.</span>
                          {renderSortArrow("customerNo")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.customerName && (
                      <th onClick={() => toggleSort("customerName")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>Kundenavn</span>
                          {renderSortArrow("customerName")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.balance && (
                      <th onClick={() => toggleSort("balance")} className="py-3 px-4 text-right select-none cursor-pointer hover:bg-slate-200 w-32">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Saldo (kr)</span>
                          {renderSortArrow("balance")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.overdue && (
                      <th onClick={() => toggleSort("overdue")} className="py-3 px-4 text-right select-none cursor-pointer hover:bg-slate-200 w-32">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Forfalden</span>
                          {renderSortArrow("overdue")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.salesperson && (
                      <th onClick={() => toggleSort("salesperson")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>Kredithåndtering</span>
                          {renderSortArrow("salesperson")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.paymentTerms && (
                      <th onClick={() => toggleSort("paymentTerms")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>Betingelser</span>
                          {renderSortArrow("paymentTerms")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.lastInvoice && (
                      <th onClick={() => toggleSort("lastInvoice")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>Seneste Faktura</span>
                          {renderSortArrow("lastInvoice")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.payment14Days && (
                      <th onClick={() => toggleSort("payment14Days")} className="py-3 px-4 text-right select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Betaling 14d</span>
                          {renderSortArrow("payment14Days")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.balanceDelta7 && (
                      <th onClick={() => toggleSort("balanceDelta7")} className="py-3 px-4 text-right select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Δ 7d</span>
                          {renderSortArrow("balanceDelta7")}
                        </div>
                      </th>
                    )}
                    {visibleColumns.risk && (
                      <th onClick={() => toggleSort("risk")} className="py-3 px-4 select-none cursor-pointer hover:bg-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>Risiko</span>
                          {renderSortArrow("risk")}
                        </div>
                      </th>
                    )}
                    <th className="py-3 px-4 text-center w-12">Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-20 text-center text-gray-400">
                        <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                        <h4 className="font-bold text-slate-700">Ingen resultater</h4>
                        <p className="text-xs text-slate-400 mt-1">Prøv at ændre dine filtre eller søgekriterier.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((cust) => (
                      <DebtorRow
                        key={cust.customerNo}
                        customer={cust}
                        visibleColumns={visibleColumns}
                        isSelected={selectedRowNo === cust.customerNo}
                        onSelect={setSelectedRowNo}
                        onDoubleClick={handleOpenCustomerCard}
                        onEyeClick={handleOpenCustomerCard}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Siderader:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value, 10));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
                <span className="text-[11px] text-slate-400">
                  Viser {Math.min(sortedCustomers.length, (currentPage - 1) * pageSize + 1)} -{" "}
                  {Math.min(sortedCustomers.length, currentPage * pageSize)} af {sortedCustomers.length}
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 bg-white disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-700">
                    Side {currentPage} af {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 bg-white disabled:opacity-40 transition"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 7. QUICK CHARTS SECTION */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-black tracking-tight text-slate-800">
                Porteføljeanalyse & Grafer
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Chart 1: Risk Distribution */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Risikofordeling (Antal kunder)
                </h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "none",
                          borderRadius: "8px",
                          color: "#fff"
                        }}
                        labelStyle={{ fontWeight: "bold" }}
                      />
                      <Bar dataKey="Kunder" radius={[4, 4, 0, 0]}>
                        {riskDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Collection Priority Distribution */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Opfølgningsprioritet distribution
                </h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{
                          background: "#0f172a",
                          border: "none",
                          borderRadius: "8px",
                          color: "#fff"
                        }}
                      />
                      <Bar dataKey="Kunder" radius={[4, 4, 0, 0]}>
                        {priorityDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Overdue Trend */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Overforfalden Trend (Udvikling)
                </h4>
                <div className="h-[250px] w-full">
                  {historicalTrendData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      Indlæser trend-data...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorOverdue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={10}
                          tickFormatter={(v) => formatDate(v).slice(0, 5)}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={9}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                          tickLine={false}
                        />
                        <RechartsTooltip
                          formatter={(v: any) => [formatCurrency(v), "Overforfalden"]}
                          labelFormatter={(l) => formatDate(l as string)}
                        />
                        <Area type="monotone" dataKey="overdue" stroke="#EF4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorOverdue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Chart 4: Payment Trend */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Indbetaling Trend (Seneste 14 dage)
                </h4>
                <div className="h-[250px] w-full">
                  {historicalTrendData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      Indlæser trend-data...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorPayments" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={10}
                          tickFormatter={(v) => formatDate(v).slice(0, 5)}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={9}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                          tickLine={false}
                        />
                        <RechartsTooltip
                          formatter={(v: any) => [formatCurrency(v), "Modtaget (14d)"]}
                          labelFormatter={(l) => formatDate(l as string)}
                        />
                        <Area type="monotone" dataKey="payments" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPayments)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Chart 5: Top 10 Exposure */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Top 10 samlet eksponering
                </h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={currentData.executiveSummary?.topExposureList}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: -5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={100} tickLine={false} />
                      <RechartsTooltip
                        formatter={(v: any) => [formatCurrency(v), "Saldo"]}
                        contentStyle={{
                          background: "#0f172a",
                          border: "none",
                          borderRadius: "8px",
                          color: "#fff"
                        }}
                      />
                      <Bar dataKey="balance" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 6: Top 10 Overdue */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-3xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Top 10 Forfalden Saldo
                </h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={currentData.executiveSummary?.topOverdueList}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: -5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={100} tickLine={false} />
                      <RechartsTooltip
                        formatter={(v: any) => [formatCurrency(v), "Forfalden"]}
                        contentStyle={{
                          background: "#0f172a",
                          border: "none",
                          borderRadius: "8px",
                          color: "#fff"
                        }}
                      />
                      <Bar dataKey="overdue" fill="#EF4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EMPTY STATE --- */}
      {!loadingData && !currentData && (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-16 text-center max-w-lg mx-auto shadow-3xs">
          <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-bold text-gray-800 text-sm">Ingen debitordata fundet</h3>
          <p className="text-xs text-slate-400 mt-2">
            Gå til **Database Management**-fanen for at uploade en NAV Excel debitorliste og oprette det første snapshot.
          </p>
        </div>
      )}

      {/* --- CUSTOMER CARD DRAWER --- */}
      <AnimatePresence>
        {activeCustomerCard && (
          <CustomerCard
            customer={activeCustomerCard as any}
            onClose={() => setActiveCustomerCard(null)}
            onRefreshData={async () => {
              if (selectedDate) {
                const currentRes = await fetch(`/api/debitor/refresh?snapshotDate=${selectedDate}`);
                if (currentRes.ok) {
                  const currentPayload: RefreshResult = await currentRes.json();
                  setCurrentData(currentPayload);
                  const updatedCust = currentPayload.kpis.customers.find(
                    (c) => c.customerNo === activeCustomerCard.customerNo
                  );
                  if (updatedCust) {
                    const updatedRisk = currentPayload.riskResults.find(
                      (r) => r.customerNo === activeCustomerCard.customerNo
                    );
                    setActiveCustomerCard({
                      ...updatedCust,
                      riskResult: updatedRisk,
                    });
                  }
                }
              }
            }}
            snapshotDate={selectedDate || ""}
          />
        )}
      </AnimatePresence>
    </div>
  );

  // Sparkline/trend renderer
  function renderCardTrend(trend: { text: string; isNeutral: boolean; isPositive: boolean; isWarning: boolean } | null) {
    if (!trend) return <span className="text-[10px] text-gray-300">-</span>;
    if (trend.isNeutral) {
      return (
        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.2 rounded flex items-center gap-0.5">
          {trend.text}
        </span>
      );
    }
    if (trend.isPositive) {
      return (
        <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded flex items-center gap-0.5">
          {trend.text}
        </span>
      );
    }
    if (trend.isWarning) {
      return (
        <span className="text-[10px] font-extrabold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.2 rounded flex items-center gap-0.5 animate-pulse">
          {trend.text}
        </span>
      );
    }
    return <span className="text-[10px] text-gray-300">-</span>;
  }

  // Sorting columns indicator
  function renderSortArrow(key: string) {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronDown className="h-3.5 w-3.5 text-gray-300 opacity-50" />;
    }
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="h-3.5 w-3.5 text-brand" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-brand" />
    );
  }
}

// --- MICRO ICON WRAPPERS TO PREVENT DUPLICATES ---
function CreditCardIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Users className="h-4 w-4" />
    </div>
  );
}

function ShieldAlertIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Octagon className="h-4 w-4" />
    </div>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <TrendingUp className="h-4 w-4" />
    </div>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Activity className="h-4 w-4" />
    </div>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <AlertTriangle className="h-4 w-4" />
    </div>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Users className="h-4 w-4" />
    </div>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <ShoppingBag className="h-4 w-4" />
    </div>
  );
}

function DollarSignIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <DollarSign className="h-4 w-4" />
    </div>
  );
}

function FileWarningIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <FileWarning className="h-4 w-4" />
    </div>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Scale className="h-4 w-4" />
    </div>
  );
}

function OctagonIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Octagon className="h-4 w-4" />
    </div>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <div className={`p-2 rounded-lg ${className}`}>
      <Inbox className="h-4 w-4" />
    </div>
  );
}

function SlidersIcon({ className }: { className?: string }) {
  return <span className={className}><Filter className="h-3.5 w-3.5" /></span>;
}
