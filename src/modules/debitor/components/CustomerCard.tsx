import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  X,
  Calendar,
  AlertCircle,
  MessageSquare,
  Pin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Phone,
  Mail,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Scale,
  Plus,
  Users,
  Briefcase,
  MapPin,
  Lock,
  Unlock,
  Activity,
  History,
  Coins,
  Download,
  RefreshCw
} from "lucide-react";
import { formatCurrency, formatDate } from "../../../shared/utils/format.ts";

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

interface DebtorAction {
  id: string;
  customerNumber: string;
  type: string;
  status: string;
  priority: string;
  owner: string | null;
  dueDate: string | null;
  comment: string;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  closedAt: string | null;
  promisedPaymentDate: string | null;
  reference: string | null;
}

interface DebtorNote {
  id: string;
  customerNumber: string;
  category: string;
  text: string;
  author: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  isPinned: boolean;
}

interface CustomerCardProps {
  customer: CustomerViewModel & { riskResult?: CustomerRiskResult };
  onClose: () => void;
  onRefreshData: () => void;
  snapshotDate: string;
}

export default function CustomerCard({ customer, onClose, onRefreshData, snapshotDate }: CustomerCardProps) {
  const [activeTab, setActiveTab] = useState<
    "general" | "financial" | "transactions" | "actions" | "notes" | "timeline" | "risk"
  >("general");

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/debitor/pdf/customer/${customer.customerNo}?snapshotDate=${snapshotDate}`);
      if (!res.ok) throw new Error("Generering fejlede");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DF-Debitor-${customer.customerNo}-${snapshotDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Kunne ikke hente pdf-fil:", err);
    } finally {
      setExportingPdf(false);
    }
  };

  // CRM action and note states
  const [actions, setActions] = useState<DebtorAction[]>([]);
  const [notes, setNotes] = useState<DebtorNote[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);

  // New action form states
  const [actionType, setActionType] = useState<string>("call");
  const [actionPriority, setActionPriority] = useState<string>("medium");
  const [actionOwner, setActionOwner] = useState<string>("Rasim Beytula");
  const [actionDueDate, setActionDueDate] = useState<string>("");
  const [actionComment, setActionComment] = useState<string>("");
  const [actionPromisedDate, setActionPromisedDate] = useState<string>("");
  const [actionReference, setActionReference] = useState<string>("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // New note form states
  const [noteCategory, setNoteCategory] = useState<string>("general");
  const [noteText, setNoteText] = useState<string>("");
  const [noteIsPinned, setNoteIsPinned] = useState<boolean>(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Fetch Actions, Notes, and Transactions
  const fetchActions = async () => {
    setLoadingActions(true);
    try {
      const res = await fetch("/api/debitor/actions");
      if (res.ok) {
        const payload = await res.json();
        const customerActions = (payload.actions || []).filter(
          (a: DebtorAction) => a.customerNumber === customer.customerNo
        );
        // Sort newest first
        customerActions.sort((a: DebtorAction, b: DebtorAction) => b.createdAt.localeCompare(a.createdAt));
        setActions(customerActions);
      }
    } catch (e) {
      console.error("Failed to load actions:", e);
    } finally {
      setLoadingActions(false);
    }
  };

  const fetchNotes = async () => {
    setLoadingNotes(true);
    try {
      const res = await fetch("/api/debitor/notes");
      if (res.ok) {
        const payload = await res.json();
        const customerNotes = (payload.notes || []).filter(
          (n: DebtorNote) => n.customerNumber === customer.customerNo
        );
        // Sort: pinned first, then newest first
        customerNotes.sort((a: DebtorNote, b: DebtorNote) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
        setNotes(customerNotes);
      }
    } catch (e) {
      console.error("Failed to load notes:", e);
    } finally {
      setLoadingNotes(false);
    }
  };

  const fetchTransactions = async () => {
    setLoadingTx(true);
    try {
      const res = await fetch("/api/debitor/transactions");
      if (res.ok) {
        const payload = await res.json();
        const customerTx = (payload.validRecords || []).filter(
          (t: any) => t.customerNumber === customer.customerNo
        );
        // Sort newest first
        customerTx.sort((a: any, b: any) => b.postingDate.localeCompare(a.postingDate));
        setTransactions(customerTx);
      }
    } catch (e) {
      console.error("Failed to load transactions:", e);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    fetchActions();
    fetchNotes();
    fetchTransactions();
  }, [customer.customerNo]);

  // Handle Action Creation
  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!actionComment.trim()) {
      setActionError("Kommentar er påkrævet.");
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await fetch("/api/debitor/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNumber: customer.customerNo,
          type: actionType,
          status: actionType === "promise" ? "promised" : "open",
          priority: actionPriority,
          owner: actionOwner || null,
          dueDate: actionDueDate || null,
          comment: actionComment.trim(),
          promisedPaymentDate: actionPromisedDate || null,
          reference: actionReference || null,
          createdBy: "rb@danfoods.dk"
        })
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error?.message || "Kunne ikke oprette aktivitet.");
      }

      // Reset Form
      setActionComment("");
      setActionDueDate("");
      setActionPromisedDate("");
      setActionReference("");
      setActionType("call");
      setActionPriority("medium");

      // Reload
      await fetchActions();
      onRefreshData(); // triggers top-level refresh to update dashboard snapshot caches
    } catch (err: any) {
      setActionError(err.message || "Der opstod en fejl.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Note Creation
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteError(null);
    if (!noteText.trim()) {
      setNoteError("Kommentar/notat-tekst er påkrævet.");
      return;
    }

    setSubmittingNote(true);
    try {
      const res = await fetch("/api/debitor/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNumber: customer.customerNo,
          category: noteCategory,
          text: noteText.trim(),
          isPinned: noteIsPinned,
          author: "rb@danfoods.dk"
        })
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error?.message || "Kunne ikke oprette notat.");
      }

      // Reset form
      setNoteText("");
      setNoteIsPinned(false);
      setNoteCategory("general");

      // Reload
      await fetchNotes();
      onRefreshData();
    } catch (err: any) {
      setNoteError(err.message || "Der opstod en fejl.");
    } finally {
      setSubmittingNote(false);
    }
  };

  // Update Action Status (e.g., Complete/Cancel)
  const handleUpdateActionStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/debitor/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          updatedBy: "rb@danfoods.dk"
        })
      });
      if (res.ok) {
        await fetchActions();
        onRefreshData();
      }
    } catch (e) {
      console.error("Failed to update action:", e);
    }
  };

  // Update Note Pin state
  const handleToggleNotePin = async (id: string, currentPin: boolean) => {
    try {
      const res = await fetch(`/api/debitor/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPinned: !currentPin,
          updatedBy: "rb@danfoods.dk"
        })
      });
      if (res.ok) {
        await fetchNotes();
      }
    } catch (e) {
      console.error("Failed to pin/unpin note:", e);
    }
  };

  // Merge Notes, Actions, Transactions into Timeline data
  const timelineEvents = useMemo(() => {
    const events: {
      id: string;
      date: string;
      title: string;
      type: "transaction_invoice" | "transaction_payment" | "transaction_credit" | "action" | "note";
      badge: string;
      body: string;
      author?: string | null;
      icon: React.ReactNode;
      colorClass: string;
      meta?: any;
    }[] = [];

    // 1. Transactions
    transactions.forEach((tx) => {
      const amt = tx.amountOre / 100;
      let type: any = "transaction_invoice";
      let title = `Faktura #${tx.documentNumber || ""}`;
      let colorClass = "bg-blue-50 text-blue-800 border-blue-100";
      let body = `Beskrivelse: ${tx.description || "Ingen"}. Beløb: ${formatCurrency(amt)}`;

      if (tx.documentType.toLowerCase().includes("payment") || tx.documentType.toLowerCase().includes("betaling")) {
        type = "transaction_payment";
        title = `Indbetaling #${tx.documentNumber || ""}`;
        colorClass = "bg-emerald-50 text-emerald-800 border-emerald-100";
        body = `Registreret betaling. Modtaget beløb: ${formatCurrency(Math.abs(amt))}`;
      } else if (tx.documentType.toLowerCase().includes("kredit") || tx.documentType.toLowerCase().includes("credit")) {
        type = "transaction_credit";
        title = `Kreditnota #${tx.documentNumber || ""}`;
        colorClass = "bg-purple-50 text-purple-800 border-purple-100";
        body = `Kreditering godkendt: ${formatCurrency(amt)}`;
      }

      events.push({
        id: `tx-${tx.fingerprint}`,
        date: tx.postingDate,
        title,
        type,
        badge: tx.documentType || "Postering",
        body,
        icon: <Coins className="h-3 w-3" />,
        colorClass
      });
    });

    // 2. Actions
    actions.forEach((act) => {
      let typeLabel = "Aktivitet";
      let colorClass = "bg-amber-50 text-amber-800 border-amber-100";

      if (act.type === "call") typeLabel = "Telefonopkald";
      if (act.type === "email") typeLabel = "E-mail Sendt";
      if (act.type === "promise") typeLabel = "Betalingsløfte";
      if (act.type === "credit_stop") typeLabel = "Kreditstop";

      let body = act.comment;
      if (act.promisedPaymentDate) {
        body += ` (Lovet betaling d. ${formatDate(act.promisedPaymentDate)})`;
      }

      events.push({
        id: `act-${act.id}`,
        date: act.createdAt.split("T")[0],
        title: `${typeLabel} [${act.status.toUpperCase()}]`,
        type: "action",
        badge: act.priority.toUpperCase(),
        body,
        author: act.createdBy || act.updatedBy,
        icon: act.type === "call" ? <Phone className="h-3 w-3" /> : act.type === "email" ? <Mail className="h-3 w-3" /> : <History className="h-3 w-3" />,
        colorClass
      });
    });

    // 3. Notes
    notes.forEach((nte) => {
      events.push({
        id: `nte-${nte.id}`,
        date: nte.createdAt.split("T")[0],
        title: `Notat (${nte.category})`,
        type: "note",
        badge: nte.isPinned ? "PINNED" : "NOTE",
        body: nte.text,
        author: nte.author,
        icon: <MessageSquare className="h-3 w-3" />,
        colorClass: nte.isPinned
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-slate-50 text-slate-800 border-slate-100"
      });
    });

    // Sort all events by date descending, then by id descending
    return events.sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.id.localeCompare(a.id);
    });
  }, [transactions, actions, notes]);

  const risk = customer.riskResult;

  // Badge styles
  const riskColorMap = {
    Low: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Medium: "bg-blue-50 text-blue-700 border-blue-100",
    High: "bg-orange-50 text-orange-700 border-orange-200",
    VeryHigh: "bg-amber-100 text-amber-800 border-amber-300",
    Critical: "bg-red-50 text-red-700 border-red-200",
  };

  const priorityColorMap = {
    Priority1: "bg-red-100 text-red-800 border-red-200",
    Priority2: "bg-orange-100 text-orange-800 border-orange-200",
    Priority3: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Priority4: "bg-blue-100 text-blue-800 border-blue-200",
    Priority5: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Priority6: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const priorityLabelMap = {
    Priority1: "P1: Kritisk Retslig",
    Priority2: "P2: Aktiv Inkasso",
    Priority3: "P3: Telefonrykker",
    Priority4: "P4: E-mailrykker",
    Priority5: "P5: Monitorering",
    Priority6: "P6: Rutinekontrol",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Shell */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="relative flex flex-col w-full max-w-4xl h-full bg-slate-50 border-l border-slate-200 shadow-2xl z-10"
      >
        {/* Header Drawer */}
        <div className="bg-white border-b border-slate-200 p-5 shrink-0 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-400">
                  #{customer.customerNo}
                </span>
                {risk && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${
                    risk.customerStatus === "Healthy"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                      : risk.customerStatus === "Monitor"
                      ? "bg-blue-50 text-blue-600 border-blue-100"
                      : risk.customerStatus === "Attention"
                      ? "bg-yellow-50 text-yellow-600 border-yellow-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  }`}>
                    {risk.customerStatus}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight leading-tight">
                {customer.customerName}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-3xs cursor-pointer hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {exportingPdf ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span>Hent PDF</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg border border-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Header Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-100 p-4 rounded-xl">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Saldo</span>
              <span className={`text-base font-black font-mono leading-tight ${customer.balance < 0 ? "text-emerald-600" : "text-slate-800"}`}>
                {formatCurrency(customer.balance)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Overforfalden</span>
              <span className={`text-base font-black font-mono leading-tight ${customer.overdue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {customer.overdue > 0 ? formatCurrency(customer.overdue) : "-"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Risikoniveau</span>
              {risk ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border mt-0.5 ${riskColorMap[risk.riskLevel]}`}>
                  {risk.riskLevel} ({risk.riskScore})
                </span>
              ) : (
                <span className="text-xs text-slate-500 font-medium">-</span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Opfølgning</span>
              {risk ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border mt-0.5 ${priorityColorMap[risk.collectionPriority]}`}>
                  {priorityLabelMap[risk.collectionPriority] || risk.collectionPriority}
                </span>
              ) : (
                <span className="text-xs text-slate-500 font-medium">-</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="bg-white border-b border-slate-200 px-5 shrink-0 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: "general", label: "Generelt", icon: <Users className="h-3.5 w-3.5" /> },
            { id: "financial", label: "Finansiel", icon: <DollarSign className="h-3.5 w-3.5" /> },
            { id: "transactions", label: "Transaktioner", icon: <Coins className="h-3.5 w-3.5" /> },
            { id: "actions", label: "Opfølgningsplan", icon: <Briefcase className="h-3.5 w-3.5" /> },
            { id: "notes", label: "Notater", icon: <MessageSquare className="h-3.5 w-3.5" /> },
            { id: "timeline", label: "Tidslinje", icon: <Activity className="h-3.5 w-3.5" /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3.5 px-3.5 border-b-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
          {/* GENERAL TAB */}
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Profile Card & Details */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Kundeoplysninger</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span>Lokation: <strong className="text-slate-800">{customer.location}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    <span>Müşteri Kimin (Sælger): <strong className="text-slate-800">{customer.seller || "Uspecificeret"}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span>Kredi Veren (Kredithåndtering): <strong className="text-slate-800">{customer.salesperson || "Uspecificeret"}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span>Betalingsbetingelser: <strong className="text-slate-800">{customer.paymentTerms}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {customer.creditHandling.toLowerCase().includes("stop") ? (
                      <Lock className="h-4 w-4 text-red-500" />
                    ) : (
                      <Unlock className="h-4 w-4 text-emerald-500" />
                    )}
                    <span>Kreditstyring: <strong className={customer.creditHandling.toLowerCase().includes("stop") ? "text-red-600 font-bold" : "text-slate-800"}>{customer.creditHandling}</strong></span>
                  </div>
                </div>
              </div>

              {/* Risk Engine Assessment */}
              {risk && (
                <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Risikovurdering</h3>
                    <span className="text-xs font-bold text-brand bg-brand/5 border border-brand/10 px-2 py-0.5 rounded">Score: {risk.riskScore}/100</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 bg-rose-50/50 border border-rose-100/50 rounded-lg">
                      <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Anbefalet handling
                      </h4>
                      <p className="text-xs text-rose-700 font-medium mt-1 leading-relaxed">
                        {risk.recommendation}
                      </p>
                    </div>

                    {risk.riskReasons.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Identificerede Risikofaktorer</span>
                        <ul className="space-y-1">
                          {risk.riskReasons.map((reason, idx) => (
                            <li key={idx} className="text-xs font-semibold text-slate-700 flex items-start gap-1.5 leading-relaxed">
                              <span className="text-red-500 mt-1">●</span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Operational Trends */}
              {risk && (
                <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Operationelle Trends</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase block">Saldo Trend</span>
                        <span className="text-xs font-bold text-slate-700 block mt-1">{risk.balanceTrend}</span>
                      </div>
                      {risk.balanceTrend === "Increasing" ? (
                        <TrendingUp className="h-5 w-5 text-amber-500" />
                      ) : risk.balanceTrend === "Reducing" ? (
                        <TrendingDown className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Activity className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase block">Forfalden Trend</span>
                        <span className="text-xs font-bold text-slate-700 block mt-1">{risk.overdueTrend}</span>
                      </div>
                      {risk.overdueTrend === "Increasing" ? (
                        <TrendingUp className="h-5 w-5 text-red-500" />
                      ) : risk.overdueTrend === "Reducing" ? (
                        <TrendingDown className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Activity className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase block">Betalingsadfærd</span>
                        <span className="text-xs font-bold text-slate-700 block mt-1">{risk.paymentTrend}</span>
                      </div>
                      {risk.paymentTrend === "Improving" ? (
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                      ) : risk.paymentTrend === "Declining" ? (
                        <TrendingDown className="h-5 w-5 text-red-500" />
                      ) : (
                        <Activity className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINANCIALS TAB */}
          {activeTab === "financial" && (
            <div className="space-y-6">
              {/* Payment History */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Betalingsmønster & Historik</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Seneste indbetaling</span>
                    <span className="text-xs font-bold text-slate-800 block">
                      {customer.lastPayment ? formatDate(customer.lastPayment) : "Ingen registeret indbetaling"}
                    </span>
                    {customer.daysSincePayment !== null && (
                      <span className="text-[11px] font-medium text-slate-500 block">
                        ({customer.daysSincePayment} dage siden)
                      </span>
                    )}
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Betalt seneste 14 dage</span>
                    <span className="text-xs font-bold text-emerald-600 block">
                      {customer.payment14Days > 0 ? formatCurrency(customer.payment14Days) : "-"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Seneste faktura</span>
                    <span className="text-xs font-bold text-slate-800 block">
                      {customer.lastInvoice ? formatDate(customer.lastInvoice) : "Ingen nylig faktura"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Eksponering Ændring (7d)</span>
                    {customer.balanceDelta7 !== null && (
                      <span className={`text-xs font-bold block ${customer.balanceDelta7 > 0 ? "text-amber-600" : customer.balanceDelta7 < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                        {customer.balanceDelta7 > 0 ? "+" : ""}
                        {formatCurrency(customer.balanceDelta7)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Flag indicators */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Kundeaktivitet Flagg</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg text-center gap-1">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Intet køb 14d</span>
                    <span className={`text-xs font-bold ${customer.riskInputs.noPurchase14Days ? "text-red-500" : "text-emerald-600"}`}>
                      {customer.riskInputs.noPurchase14Days ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg text-center gap-1">
                    <DollarSign className="h-5 w-5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Ingen betaling 14d</span>
                    <span className={`text-xs font-bold ${customer.riskInputs.noPayment14Days ? "text-red-500" : "text-emerald-600"}`}>
                      {customer.riskInputs.noPayment14Days ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg text-center gap-1">
                    <AlertTriangle className="h-5 w-5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Betalingsløfte</span>
                    <span className={`text-xs font-bold ${risk?.hasActivePromise ? "text-emerald-600" : "text-slate-400"}`}>
                      {risk?.hasActivePromise ? "Aktiv" : "Ingen"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg text-center gap-1">
                    <AlertCircle className="h-5 w-5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase">Brudt Løfte</span>
                    <span className={`text-xs font-bold ${risk?.hasBrokenPromise ? "text-red-500 font-extrabold animate-pulse" : "text-emerald-600"}`}>
                      {risk?.hasBrokenPromise ? "JA" : "Nej"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TRANSACTIONS TAB */}
          {activeTab === "transactions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Konto-oversigt (Navision Transaktioner)</h3>
                <span className="text-xs font-bold text-slate-400 font-mono">{transactions.length} poster</span>
              </div>

              {loadingTx ? (
                <div className="text-center py-10 text-slate-400 text-xs font-bold">Henter transaktioner...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Ingen transaktioner fundet i SaldoPosterRAW for denne kunde.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-white shadow-3xs">
                  <table className="w-full text-left border-collapse min-w-[600px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] tracking-wider border-b border-slate-100">
                        <th className="py-2.5 px-3">Dato</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Bilagsnr</th>
                        <th className="py-2.5 px-3">Beskrivelse</th>
                        <th className="py-2.5 px-3 text-right">Beløb</th>
                        <th className="py-2.5 px-3 text-right">Restbeløb</th>
                        <th className="py-2.5 px-3">Forfald</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.map((tx, idx) => {
                        const amount = tx.amountOre / 100;
                        const remaining = tx.remainingAmountOre ? tx.remainingAmountOre / 100 : 0;
                        const isOverdue = tx.dueDate && tx.dueDate < snapshotDate && remaining !== 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 font-medium text-slate-700">
                            <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">{formatDate(tx.postingDate)}</td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex px-1.5 py-0.2 rounded font-bold text-[10px] uppercase border ${
                                tx.documentType.toLowerCase().includes("payment") || tx.documentType.toLowerCase().includes("betaling")
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : tx.documentType.toLowerCase().includes("credit") || tx.documentType.toLowerCase().includes("kredit")
                                  ? "bg-purple-50 text-purple-700 border-purple-100"
                                  : "bg-blue-50 text-blue-700 border-blue-100"
                              }`}>
                                {tx.documentType}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{tx.documentNumber}</td>
                            <td className="py-2.5 px-3 truncate max-w-[150px]">{tx.description || "-"}</td>
                            <td className={`py-2.5 px-3 text-right font-semibold font-mono ${amount < 0 ? "text-emerald-600" : "text-slate-800"}`}>
                              {formatCurrency(amount)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold font-mono ${remaining > 0 ? (isOverdue ? "text-red-600" : "text-slate-700") : "text-slate-300"}`}>
                              {remaining !== 0 ? formatCurrency(remaining) : "-"}
                            </td>
                            <td className={`py-2.5 px-3 font-mono whitespace-nowrap ${isOverdue ? "text-red-500 font-bold" : "text-slate-400"}`}>
                              {tx.dueDate ? formatDate(tx.dueDate) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ACTION PLANNER TAB */}
          {activeTab === "actions" && (
            <div className="space-y-6">
              {/* Form to add action */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Plus className="h-4 w-4 text-brand" />
                  Registrer ny opfølgningsaktivitet
                </h3>

                {actionError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 font-bold text-xs rounded-lg">
                    {actionError}
                  </div>
                )}

                <form onSubmit={handleAddAction} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
                  <div className="space-y-1">
                    <label className="text-slate-500">Aktivitetstype</label>
                    <select
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:ring-1 focus:ring-brand"
                    >
                      <option value="call">Telefonopkald (Call)</option>
                      <option value="email">E-mail rykker (Email)</option>
                      <option value="statement">Kontoudtog afsendt</option>
                      <option value="reminder">Skriftlig rykker</option>
                      <option value="promise">Betalingsløfte (Promise)</option>
                      <option value="plan">Afviklingsplan</option>
                      <option value="credit_stop">Kreditstop</option>
                      <option value="collection">Inkasso varsel</option>
                      <option value="legal">Retslig inkasso</option>
                      <option value="investigation">Undersøgelse</option>
                      <option value="other">Anden opfølgning</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500">Prioritet</label>
                    <select
                      value={actionPriority}
                      onChange={(e) => setActionPriority(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:ring-1 focus:ring-brand"
                    >
                      <option value="low">Lav (Low)</option>
                      <option value="medium">Mellem (Medium)</option>
                      <option value="high">Høj (High)</option>
                      <option value="critical">Kritisk (Critical)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500">Ansvarlig medarbejder</label>
                    <input
                      type="text"
                      value={actionOwner}
                      onChange={(e) => setActionOwner(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                      placeholder="Navn på sagsbehandler"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500">Frist/Forfaldsdato (Frivillig)</label>
                    <input
                      type="date"
                      value={actionDueDate}
                      onChange={(e) => setActionDueDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {actionType === "promise" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-slate-500">Lovet betalingsdato</label>
                        <input
                          type="date"
                          value={actionPromisedDate}
                          onChange={(e) => setActionPromisedDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500">Betalingsreference (Lovet beløb/Metode)</label>
                        <input
                          type="text"
                          value={actionReference}
                          onChange={(e) => setActionReference(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                          placeholder="F.eks. 'Restbeløb d. 15' eller 'Bankoverførsel'"
                        />
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2 space-y-1">
                    <label className="text-slate-500">Udførlig kommentar (Hvad blev aftalt?)</label>
                    <textarea
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                      placeholder="F.eks. ringede til kunden, kunden lover overførsel i morgen..."
                    />
                  </div>

                  <div className="md:col-span-2 pt-2">
                    <button
                      type="submit"
                      disabled={submittingAction}
                      className="w-full bg-brand hover:bg-brand-dark disabled:bg-slate-300 text-white font-black py-2 rounded-lg cursor-pointer transition text-xs flex items-center justify-center gap-1.5"
                    >
                      {submittingAction ? "Opretter..." : "Opret og Synkroniser med Google Sheets"}
                    </button>
                  </div>
                </form>
              </div>

              {/* List of actions */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Aktivitetshistorik</h3>
                {loadingActions ? (
                  <div className="text-slate-400 text-center py-6 text-xs font-bold">Indlæser historik...</div>
                ) : actions.length === 0 ? (
                  <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    Ingen registrerede opfølgningsaktiviteter for denne kunde.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {actions.map((act) => {
                      const isClosed = act.status === "completed" || act.status === "cancelled";

                      return (
                        <div key={act.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-3xs flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] font-bold text-slate-400">
                                {act.id}
                              </span>
                              <span className={`inline-flex px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider border ${
                                act.type === "promise"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : act.type === "credit_stop"
                                  ? "bg-red-50 text-red-700 border-red-100"
                                  : "bg-amber-50 text-amber-700 border-amber-100"
                              }`}>
                                {act.type}
                              </span>
                              <span className={`inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                act.priority === "critical"
                                  ? "bg-red-100 text-red-800"
                                  : act.priority === "high"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}>
                                {act.priority}
                              </span>
                              <span className={`inline-flex px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                isClosed ? "bg-slate-100 text-slate-400" : "bg-blue-100 text-blue-800 animate-pulse"
                              }`}>
                                {act.status}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                              {act.comment}
                            </p>

                            {act.promisedPaymentDate && (
                              <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/40 text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5">
                                <Coins className="h-3.5 w-3.5" />
                                <span>Lover betaling d. {formatDate(act.promisedPaymentDate)} {act.reference ? `(${act.reference})` : ""}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium">
                              {act.owner && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  Ansvarlig: {act.owner}
                                </span>
                              )}
                              {act.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Frist: {formatDate(act.dueDate)}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Registreret: {formatDate(act.createdAt.split("T")[0])} af {act.createdBy}
                              </span>
                            </div>
                          </div>

                          {!isClosed && (
                            <div className="flex items-center gap-1 pt-2 md:pt-0 shrink-0">
                              <button
                                onClick={() => handleUpdateActionStatus(act.id, "completed")}
                                className="px-2 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold text-[10px] rounded hover:bg-emerald-100 transition flex items-center gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Marker Udført
                              </button>
                              <button
                                onClick={() => handleUpdateActionStatus(act.id, "cancelled")}
                                className="px-2 py-1 bg-slate-50 border border-slate-100 text-slate-500 font-bold text-[10px] rounded hover:bg-slate-100 transition flex items-center gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Annuller
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              {/* Form to add note */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-3xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Plus className="h-4 w-4 text-brand" />
                  Opret et nyt fritstående notat
                </h3>

                {noteError && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 font-bold text-xs rounded-lg">
                    {noteError}
                  </div>
                )}

                <form onSubmit={handleAddNote} className="space-y-4 text-xs font-medium">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-slate-500">Notat kategori</label>
                      <select
                        value={noteCategory}
                        onChange={(e) => setNoteCategory(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:ring-1 focus:ring-brand"
                      >
                        <option value="general">Generelt notat</option>
                        <option value="credit">Kreditvurdering</option>
                        <option value="collection">Inkasso kommentar</option>
                        <option value="promise">Aftale/Løfte status</option>
                        <option value="dispute">Disput/Uenighed</option>
                        <option value="other">Andet</option>
                      </select>
                    </div>

                    <div className="flex items-end pb-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noteIsPinned}
                          onChange={(e) => setNoteIsPinned(e.target.checked)}
                          className="rounded border-gray-300 text-brand focus:ring-brand h-4 w-4"
                        />
                        <span className="text-slate-700 font-semibold">Fastgør notat (Pin til toppen)</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500">Notat tekst</label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-brand"
                      placeholder="Skriv din fritekst her..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingNote}
                    className="w-full bg-brand hover:bg-brand-dark disabled:bg-slate-300 text-white font-black py-2 rounded-lg cursor-pointer transition text-xs"
                  >
                    {submittingNote ? "Gemmer..." : "Gem og Synkroniser med Google Sheets"}
                  </button>
                </form>
              </div>

              {/* Notes List */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Registrerede Notater</h3>
                {loadingNotes ? (
                  <div className="text-slate-400 text-center py-6 text-xs font-bold">Henter notater...</div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    Ingen registrerede notater for denne kunde.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {notes.map((nte) => (
                      <div key={nte.id} className={`bg-white border rounded-xl p-4 shadow-3xs flex items-start justify-between gap-3 ${
                        nte.isPinned ? "border-rose-200 bg-rose-50/10" : "border-slate-100"
                      }`}>
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-slate-400">
                              {nte.id}
                            </span>
                            <span className="inline-flex bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider">
                              {nte.category}
                            </span>
                            {nte.isPinned && (
                              <span className="inline-flex bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.2 rounded text-[9px] font-black uppercase flex items-center gap-0.5">
                                <Pin className="h-2.5 w-2.5" />
                                FASTGJORT
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-700 font-semibold leading-relaxed whitespace-pre-wrap">
                            {nte.text}
                          </p>

                          <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium pt-0.5">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Forfatter: {nte.author}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Dato: {formatDate(nte.createdAt.split("T")[0])}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleNotePin(nte.id, nte.isPinned)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            nte.isPinned
                              ? "bg-rose-50 border-rose-100 text-rose-500 hover:text-rose-700"
                              : "bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-700"
                          }`}
                          title={nte.isPinned ? "Frigør" : "Fastgør til top"}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Kontoens Aktivitets- & Transaktionstidslinje</h3>

              {timelineEvents.length === 0 ? (
                <div className="text-center py-10 bg-white border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Ingen begivenheder fundet på denne tidslinje endnu.
                </div>
              ) : (
                <div className="relative border-l border-slate-200 ml-3 pl-6 space-y-6 pt-2">
                  {timelineEvents.map((evt, idx) => (
                    <div key={evt.id} className="relative">
                      {/* Timeline Dot Icon */}
                      <span className={`absolute -left-[37px] top-0 p-1.5 rounded-full border shadow-2xs ${evt.colorClass}`}>
                        {evt.icon}
                      </span>

                      <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-3xs space-y-1">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h4 className="text-xs font-bold text-slate-800">
                            {evt.title}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-400 font-bold whitespace-nowrap">
                            {formatDate(evt.date)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          {evt.body}
                        </p>
                        {evt.author && (
                          <span className="text-[9px] text-slate-400 font-semibold block pt-1">
                            Afsendt/Oprettet af: {evt.author}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
