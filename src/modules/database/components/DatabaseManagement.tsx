import React, { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle, RefreshCw, Calendar, Eye, Database, Settings, Lock, Key, Mail, Link2, EyeOff, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { ValidationSummary, ImportMetadata, SalesRawRow } from "../../../shared/types.js";
import { formatCurrency, formatDate, formatFileSize, formatNumber } from "../../../shared/utils/format.js";

interface DatabaseManagementProps {
  onImportSuccess?: (newDate: string) => void;
}

export default function DatabaseManagement({ onImportSuccess }: DatabaseManagementProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  
  // Validation output
  const [selectedModule, setSelectedModule] = useState<"sales" | "debitor">("sales");
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [fileHash, setFileHash] = useState<string>("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<ImportMetadata | null>(null);
  const [confirmedBusinessDate, setConfirmedBusinessDate] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [tilbudUge, setTilbudUge] = useState(false);

  // Import history logs
  const [importHistory, setImportHistory] = useState<ImportMetadata[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; importId?: string } | null>(null);

  // Supabase Database Connection Settings States
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState({
    SUPABASE_URL: "",
    SUPABASE_KEY: "",
    USE_MOCK_DATA: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // States for testing Supabase connection live
  const [testingSettings, setTestingSettings] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Connection health status
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; isMock: boolean; message: string } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const checkConnectionHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch("/api/settings/connection-health");
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus({
          success: data.success,
          isMock: data.isMock,
          message: data.message
        });
      }
    } catch (err) {
      console.error("Fejl ved kontrol af Supabase status:", err);
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleTestCredentials = async () => {
    setTestingSettings(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: "❌ Kunne ikke forbinde til serverens test-endpoint: " + err.message,
      });
    } finally {
      setTestingSettings(false);
    }
  };

  useEffect(() => {
    const fetchCredentials = async () => {
      setLoadingSettings(true);
      try {
        const res = await fetch("/api/settings/supabase");
        if (res.ok) {
          const data = await res.json();
          setCredentials({
            SUPABASE_URL: data.SUPABASE_URL || "",
            SUPABASE_KEY: data.SUPABASE_KEY || "",
            USE_MOCK_DATA: data.USE_MOCK_DATA !== false, // default to true if not set
          });
        }
      } catch (e) {
        console.error("Failed to load Supabase settings:", e);
      } finally {
        setLoadingSettings(false);
      }
    };
    fetchCredentials();
    checkConnectionHealth();
  }, []);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await fetch("/api/settings/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettingsMessage({ type: "success", text: "Indstillingerne blev gemt og aktiveret med succes!" });
        // Automatically hide or show message
        setTimeout(() => setSettingsMessage(null), 6000);
        // Re-check connection health
        await checkConnectionHealth();
      } else {
        setSettingsMessage({ type: "error", text: data.error || "Kunne ikke gemme indstillinger." });
      }
    } catch (err: any) {
      setSettingsMessage({ type: "error", text: "Fejl ved lagring: " + err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    fetchImportHistory();
  }, [selectedModule]);

  const fetchImportHistory = async () => {
    setHistoryLoading(true);
    try {
      const url = "/api/imports";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Filter history based on businessModule to avoid cross-module mixing if both are in same store
        const filtered = data.filter((item: ImportMetadata) => 
          selectedModule === "sales" 
            ? item.businessModule === "Sales" 
            : item.businessModule === "Debitor"
        );
        setImportHistory(filtered);
      }
    } catch (e) {
      console.error("Failed to load import logs:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (selectedFile: File) => {
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "xlsm"].includes(extension || "")) {
      alert("Fejl: Kun Excel-filer (.xlsx, .xls, .xlsm) er tilladt.");
      return;
    }

    setFile(selectedFile);
    setValidation(null);
    setPreviewRows([]);
    setImportResult(null);
    setValidating(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        setFileBase64(base64);

        // Send to backend for validation
        const url = selectedModule === "sales" ? "/api/upload" : "/api/debitor/upload";
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: selectedFile.name,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setValidation(data.validationSummary);
          setPreviewRows(data.previewRows);
          setFileHash(data.fileHash);
          setIsDuplicate(data.isDuplicate);
          setDuplicateInfo(data.duplicateInfo);
          setConfirmedBusinessDate(data.validationSummary.detectedBusinessDate);
          
          if (data.isDuplicate) {
            setReplaceExisting(true);
          } else {
            setReplaceExisting(false);
          }
        } else {
          const err = await response.json();
          alert(`Validering mislykkedes: ${err.error}`);
        }
      } catch (e: any) {
        alert(`Fejl ved indlæsning af fil: ${e.message}`);
      } finally {
        setValidating(false);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerImport = async () => {
    if (!file || !confirmedBusinessDate) return;

    if (isDuplicate && !replaceExisting) {
      const confirmVersion = window.confirm(
        `Der findes allerede en import for denne dato (${confirmedBusinessDate}). Vil du oprette en ny versionskopi?`
      );
      if (!confirmVersion) return;
    }

    setImporting(true);
    try {
      const url = selectedModule === "sales" ? "/api/import" : "/api/debitor/import";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          fileHash,
          businessDate: confirmedBusinessDate,
          replaceExisting,
          replaceImportId: duplicateInfo?.importId,
          tilbudUge,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setImportResult({
          success: true,
          message: result.message,
          importId: result.importId,
        });
        // Clear active upload card
        setFile(null);
        setValidation(null);
        setPreviewRows([]);
        setTilbudUge(false);
        fetchImportHistory();
        
        // Notify parent App component to refresh data
        if (onImportSuccess) {
          onImportSuccess(confirmedBusinessDate);
        }
      } else {
        const err = await response.json();
        setImportResult({
          success: false,
          message: `Import mislykkedes: ${err.error}`,
        });
      }
    } catch (e: any) {
      setImportResult({
        success: false,
        message: `Import mislykkedes: ${e.message}`,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setValidation(null);
    setPreviewRows([]);
    setImportResult(null);
    setTilbudUge(false);
  };

  return (
    <div className="space-y-6">
      {/* Reusable Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Database Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload, valider og gem daglige raw Excel-eksporter fra Microsoft Dynamics NAV.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-2">
          <button
            onClick={fetchImportHistory}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`} />
            Opdater historik
          </button>
        </div>
      </div>

      {/* Connection Status Banner */}
      {connectionStatus && !connectionStatus.isMock && (
        <div className={`p-4 rounded-xl border ${
          connectionStatus.success 
            ? "bg-emerald-50/70 border-emerald-200 text-emerald-800" 
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          <div className="flex items-start gap-3">
            {connectionStatus.success ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-semibold">
                {connectionStatus.success 
                  ? "Google Sheets Forbindelse: Aktiv og godkendt" 
                  : "Google Sheets Forbindelse: Mangler adgangstilladelse"}
              </h4>
              <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                {connectionStatus.success 
                  ? `Forbindelsen til dit Google Sheet er aktiv og fungerer korrekt. Systemet synkroniserer data direkte til og fra din Google Spreadsheet.`
                  : connectionStatus.message}
              </div>
              {!connectionStatus.success && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowCredentials(true);
                      setTimeout(() => {
                        const element = document.getElementById("google-sheets-settings-card");
                        if (element) {
                          element.scrollIntoView({ behavior: "smooth" });
                        }
                      }, 100);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 underline cursor-pointer"
                  >
                    Åbn forbindelsesindstillinger for at rette eller kopiere e-mailadresse →
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={checkConnectionHealth}
              disabled={checkingHealth}
              className="p-1 hover:bg-black/5 rounded text-gray-500 hover:text-gray-700 cursor-pointer disabled:opacity-50 shrink-0"
              title="Genprøv statuskontrol"
            >
              <RefreshCw className={`h-4 w-4 ${checkingHealth ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Upload & Validation */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upload panel */}
          {!validation && !validating && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
              <h2 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Upload className="h-5 w-5 text-gray-400" />
                Upload daglig Dynamics NAV-eksport
              </h2>
              
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Forretningsmodul
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedModule("sales");
                      handleClear();
                    }}
                    type="button"
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      selectedModule === "sales"
                        ? "text-blue-700 bg-blue-50 border-blue-200"
                        : "text-gray-600 bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Sales (Salg)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedModule("debitor");
                      handleClear();
                    }}
                    type="button"
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      selectedModule === "debitor"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-gray-600 bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Saldoopfølgning (Debitor)
                  </button>
                </div>
              </div>

              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center flex flex-col items-center justify-center transition-all ${
                  dragActive ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-gray-50/50 hover:bg-gray-50"
                }`}
              >
                <FileSpreadsheet className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-sm font-medium text-gray-700">
                  Træk og slip din Excel-fil her, eller{" "}
                  <label className="text-blue-600 hover:text-blue-700 cursor-pointer font-semibold underline">
                    gennemse filer
                    <input
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls,.xlsm"
                      onChange={handleChange}
                    />
                  </label>
                </p>
                <p className="text-xs text-gray-400 mt-2">Understøtter .xlsx, .xls og .xlsm (Maks 25MB)</p>
              </div>
            </div>
          )}

          {/* Validation & Parsing Loading State */}
          {validating && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 shadow-xs text-center flex flex-col items-center justify-center">
              <RefreshCw className="h-10 w-10 text-blue-600 animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-700">Analyserer og validerer Excel-data...</p>
              <p className="text-xs text-gray-400 mt-1">Sikrer kolonne-struktur og indholdsoverensstemmelse</p>
            </div>
          )}

          {/* Import Result Notification */}
          {importResult && (
            <div className={`border rounded-xl p-4 flex items-start gap-3 ${
              importResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="text-sm font-semibold">{importResult.success ? "Import Gennemført" : "Fejl ved Import"}</h3>
                <p className="text-xs mt-1 text-gray-600">{importResult.message}</p>
                {importResult.importId && (
                  <p className="text-xs mt-2 font-mono bg-emerald-100/50 inline-block px-1.5 py-0.5 rounded text-emerald-700">
                    Import ID: {importResult.importId}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Validation Summary Panel */}
          {validation && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-gray-500" />
                  <span className="font-medium text-sm text-gray-900 truncate max-w-[200px] sm:max-w-md">{validation.fileName}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Annuller
                  </button>
                  <button
                    onClick={triggerImport}
                    disabled={importing || !validation.isValid}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white rounded-lg transition cursor-pointer ${
                      validation.isValid
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" />
                    {importing ? "Importerer..." : "Godkend og importer"}
                  </button>
                </div>
              </div>

              {/* Status Header */}
              <div className="p-5 border-b border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3">
                  {validation.validationStatus === "valid" ? (
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                  ) : validation.validationStatus === "warning" ? (
                    <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="p-2 bg-red-50 rounded-lg text-red-600">
                      <XCircle className="h-5 w-5" />
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Validering</span>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {validation.validationStatus === "valid"
                        ? "Godkendt og fejlfri"
                        : validation.validationStatus === "warning"
                        ? "Advarsler fundet"
                        : "Ugyldig filstruktur"}
                    </h4>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500">Forretningsdato</span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-sm font-semibold text-gray-900">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={confirmedBusinessDate}
                      onChange={(e) => setConfirmedBusinessDate(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-0.5 text-sm font-medium text-gray-800"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-gray-500">Rækker & Kolonner</span>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {formatNumber(validation.rowCount)} rækker × {validation.columnCount} kolonner
                  </p>
                </div>

                {selectedModule === "sales" ? (
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-medium text-gray-500 mb-1">Kampagne / Tilbud</span>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-900 select-none bg-rose-50 border border-rose-100 rounded px-2.5 py-1.5 transition hover:bg-rose-100/70">
                      <input
                        type="checkbox"
                        checked={tilbudUge}
                        onChange={(e) => setTilbudUge(e.target.checked)}
                        className="h-4 w-4 text-rose-600 rounded border-gray-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-700">
                        ⭐ Tilbud Uge (Kampagne)
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-medium text-gray-500 mb-1">Modul</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      🏦 Debitor Snapshot
                    </span>
                  </div>
                )}
              </div>

              {/* Duplicate Warning */}
              {isDuplicate && duplicateInfo && (
                <div className="p-4 bg-amber-50 border-b border-amber-200/50 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Allerede importeret for denne dato!</p>
                    <p>
                      Datoen <strong className="font-semibold">{confirmedBusinessDate}</strong> blev allerede indlæst d.{" "}
                      {formatDate(duplicateInfo.importedAt.split("T")[0])} via filen <em className="italic">{duplicateInfo.uploadedFileName}</em>.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                        <input
                          type="radio"
                          checked={replaceExisting}
                          onChange={() => setReplaceExisting(true)}
                          className="text-amber-600"
                        />
                        Erstat eksisterende import (Logges i systemet)
                      </label>
                      <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                        <input
                          type="radio"
                          checked={!replaceExisting}
                          onChange={() => setReplaceExisting(false)}
                          className="text-amber-600"
                        />
                        Opret ny versionskopi (_v2, _v3 osv)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Diagnostic detail panels */}
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedModule === "sales" ? (
                    <>
                      {/* Found Required */}
                      <div className="border border-gray-100 rounded-lg p-3.5 bg-gray-50/30">
                        <span className="text-xs font-semibold text-gray-700">Obligatoriske felter fundet:</span>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {validation.requiredColumnsFound?.map((col) => (
                            <span key={col} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[11px] font-mono">
                              ✓ {col}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Missing/Invalid summary */}
                      <div className="border border-gray-100 rounded-lg p-3.5 bg-gray-50/30 text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Manglende påkrævede kolonner:</span>
                          <span className={`font-semibold ${validation.missingColumns?.length > 0 ? "text-red-600" : "text-gray-900"}`}>
                            {validation.missingColumns?.length || 0}
                          </span>
                        </div>
                        {validation.missingColumns?.length > 0 && (
                          <div className="text-[11px] text-red-500 font-mono">
                            Mangler: {validation.missingColumns.join(", ")}
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tomme påkrævede celler:</span>
                          <span className="font-semibold text-gray-900">{validation.emptyRequiredFieldsCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Ugyldige datoer:</span>
                          <span className="font-semibold text-gray-900">{validation.invalidDatesCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Duplikerede rækker fundet:</span>
                          <span className="font-semibold text-gray-900">{validation.duplicateRowCount}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Debitor Errors & Warnings */}
                      <div className="border border-gray-100 rounded-lg p-3.5 bg-gray-50/30 text-xs space-y-3">
                        <span className="text-xs font-semibold text-gray-700">Valideringsfejl & Advarsler:</span>
                        {(validation as any).errors && (validation as any).errors.length > 0 ? (
                          <div className="space-y-1">
                            <span className="font-semibold text-red-600 font-sans">Fejl ({(validation as any).errors.length}):</span>
                            <ul className="list-disc pl-4 text-[11px] text-red-600 space-y-0.5">
                              {(validation as any).errors.map((err: string, idx: number) => (
                                <li key={idx}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="text-emerald-600 font-medium">✓ Ingen valideringsfejl fundet.</div>
                        )}

                        {(validation as any).warnings && (validation as any).warnings.length > 0 && (
                          <div className="space-y-1 pt-1.5 border-t border-gray-100">
                            <span className="font-semibold text-amber-600 font-sans">Advarsler ({(validation as any).warnings.length}):</span>
                            <ul className="list-disc pl-4 text-[11px] text-amber-600/90 space-y-0.5 max-h-24 overflow-y-auto">
                              {(validation as any).warnings.map((warn: string, idx: number) => (
                                <li key={idx}>{warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Debitor Columns summary */}
                      <div className="border border-gray-100 rounded-lg p-3.5 bg-gray-50/30 text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-medium">Kundenr., Navn & Saldo:</span>
                          <span className={`font-semibold ${validation.missingColumns?.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {validation.missingColumns?.length > 0 ? "Match Fejl" : "Match OK"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Manglende påkrævede kolonner:</span>
                          <span className={`font-semibold ${validation.missingColumns?.length > 0 ? "text-red-600" : "text-gray-900"}`}>
                            {validation.missingColumns?.length || 0}
                          </span>
                        </div>
                        {validation.missingColumns?.length > 0 && (
                          <div className="text-[11px] text-red-500 font-mono">
                            Mangler: {validation.missingColumns.join(", ")}
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Filnavn matchet dato:</span>
                          <span className="font-semibold text-gray-900 font-mono">{validation.detectedBusinessDate}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Data Preview Area */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Forhåndsvisning af data ({previewRows.length} første rækker)
                  </h4>
                  <div className="border border-gray-100 rounded-lg overflow-x-auto max-h-60 text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 sticky top-0">
                          {previewRows.length > 0 &&
                            Object.keys(previewRows[0]).slice(0, 8).map((key) => (
                              <th key={key} className="p-2.5 font-semibold text-gray-600 truncate max-w-[140px]">
                                {key}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            {Object.values(row).slice(0, 8).map((val: any, sIdx) => (
                              <td key={sIdx} className="p-2.5 text-gray-500 truncate max-w-[140px]">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Import Logs / History List */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs h-fit space-y-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-gray-400" />
            Import Historik (_System)
          </h2>
          <p className="text-xs text-gray-500">
            Dette er systemloggen over alle udførte fil-indlæsninger. Hver dag gemmes som en separat, uforanderlig rå-data fane.
          </p>

          <div className="space-y-3.5 overflow-y-auto max-h-[500px] pr-1 text-xs">
            {historyLoading ? (
              <div className="text-center py-8 text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Henter historiske logs...
              </div>
            ) : importHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400 border border-dashed border-gray-100 rounded-lg">
                Ingen import logget i databasen endnu.
              </div>
            ) : (
              importHistory.map((item) => (
                <div key={item.importId} className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-100 font-mono text-[10px]">
                      {item.worksheetName}
                    </span>
                    {item.tilbudUge && (
                      <span className="bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-100 text-[9px] flex items-center gap-0.5">
                        ⭐ Kampagne
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      item.importStatus === "success" 
                        ? "bg-emerald-50 text-emerald-700" 
                        : "bg-red-50 text-red-700"
                    }`}>
                      {item.importStatus === "success" ? "Gennemført" : "Fejlet"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="font-medium text-gray-700 truncate" title={item.uploadedFileName}>
                      {item.uploadedFileName}
                    </p>
                    <div className="flex items-center gap-2 text-gray-400 text-[11px]">
                      <span>{formatNumber(item.importedRowCount)} rækker</span>
                      <span>•</span>
                      <span>{formatFileSize(item.originalFileSize)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
                    <span>Af {item.uploadedBy.split("@")[0]}</span>
                    <span>{formatDate(item.importedAt.split("T")[0])}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Supabase API Settings Panel */}
      <div id="supabase-settings-card" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mt-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-gray-100 pb-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                Supabase Veritabanı Bağlantı Ayarları
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  credentials.USE_MOCK_DATA 
                    ? "bg-amber-50 text-amber-700 border border-amber-100" 
                    : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                }`}>
                  {credentials.USE_MOCK_DATA ? "Lokal Yedek Modu Aktif" : "Canlı Supabase Bağlantısı"}
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                Tüm Google Sheets entegrasyonu başarıyla kaldırılmıştır. Excel import kayıtlarınız, eylemler ve notlar doğrudan aşağıdaki Supabase veritabanında saklanır.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCredentials(!showCredentials)}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition shrink-0 cursor-pointer"
          >
            {showCredentials ? "Ayarları Gizle" : "Bağlantı Bilgilerini Düzenle"}
          </button>
        </div>

        {/* Informative Help Box in Turkish */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-xs bg-slate-50 border border-slate-100 rounded-lg p-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-800">🔌 Supabase Bağlantısı</h4>
            <p className="text-slate-600 leading-relaxed">
              Supabase hesabınızda yeni bir proje oluşturun ve aşağıdaki tablolara ait SQL şemasını SQL Editor kısmından çalıştırın. Ardından projenizin <strong>Project Settings &gt; API</strong> bölümünden alacağınız URL ve <code>service_role</code> (veya <code>anon</code>) anahtarlarını yan tarafa yapıştırın.
            </p>
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-800">💾 Çift Yönlü Güvenlik (Dual Mode)</h4>
            <p className="text-slate-600 leading-relaxed">
              Eğer bağlantı bilgileri girilmezse veya boş bırakılırsa, uygulama kesintisiz çalışmaya devam edebilmek için <strong>Local JSON yedeklerini</strong> kullanmaya devam eder. Böylelikle veri kaybı veya kesinti yaşamazsınız.
            </p>
          </div>
        </div>

        {/* Collapsible SQL Schema Section */}
        <div className="mb-5 border border-slate-200 rounded-lg overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowSqlSchema(!showSqlSchema)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-150 transition text-slate-700 text-xs font-semibold select-none cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-500" />
              <span>Gerekli SQL Tablo Şemaları (Kopyala & Supabase'de Çalıştır)</span>
            </div>
            {showSqlSchema ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>
          
          {showSqlSchema && (
            <div className="p-4 bg-slate-900 border-t border-slate-800 text-slate-300 relative">
              <button
                type="button"
                onClick={() => {
                  const sqlCode = `-- 1. Import Metadata Table
CREATE TABLE IF NOT EXISTS import_metadata (
  import_id VARCHAR(255) PRIMARY KEY,
  business_module VARCHAR(50) NOT NULL,
  business_date VARCHAR(100),
  worksheet_name VARCHAR(255),
  uploaded_file_name VARCHAR(255),
  original_file_size BIGINT,
  imported_row_count INTEGER,
  imported_column_count INTEGER,
  imported_at VARCHAR(100),
  uploaded_by VARCHAR(255),
  import_status VARCHAR(50),
  import_version INTEGER,
  file_hash VARCHAR(255),
  template_version VARCHAR(50) DEFAULT '1.0.0',
  error_message TEXT,
  replaced_import_id VARCHAR(255),
  application_version VARCHAR(50) DEFAULT '1.0.0',
  tilbud_uge BOOLEAN DEFAULT FALSE
);

-- 2. Sales Rows Table
CREATE TABLE IF NOT EXISTS sales_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id VARCHAR(255) REFERENCES import_metadata(import_id) ON DELETE CASCADE,
  posting_date VARCHAR(100),
  entry_type VARCHAR(100),
  document_type VARCHAR(100),
  document_number VARCHAR(100),
  item_number VARCHAR(100),
  description TEXT,
  location_code VARCHAR(100),
  quantity NUMERIC,
  invoiced_quantity NUMERIC,
  remaining_quantity NUMERIC,
  sales_amount NUMERIC,
  cost_amount NUMERIC,
  source_type VARCHAR(100),
  customer_number VARCHAR(100),
  customer_name VARCHAR(255),
  department_code VARCHAR(100),
  employee_name VARCHAR(255)
);

-- 3. Debitor Rows Table
CREATE TABLE IF NOT EXISTS debitor_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id VARCHAR(255) REFERENCES import_metadata(import_id) ON DELETE CASCADE,
  customer_number VARCHAR(100),
  customer_name VARCHAR(255),
  balance NUMERIC,
  overdue_balance NUMERIC,
  payment_terms VARCHAR(255),
  last_invoice VARCHAR(100),
  credit_handling VARCHAR(255),
  salesperson VARCHAR(255),
  location VARCHAR(255),
  seller VARCHAR(255)
);

-- 4. Debtor Actions Table
CREATE TABLE IF NOT EXISTS debtor_actions (
  id VARCHAR(255) PRIMARY KEY,
  customer_number VARCHAR(100),
  type VARCHAR(100),
  status VARCHAR(100),
  priority VARCHAR(100),
  owner VARCHAR(255),
  due_date VARCHAR(100),
  comment TEXT,
  created_by VARCHAR(255),
  created_at VARCHAR(100),
  updated_by VARCHAR(255),
  updated_at VARCHAR(100),
  closed_at VARCHAR(100),
  promised_payment_date VARCHAR(100),
  reference VARCHAR(255)
);

-- 5. Debtor Notes Table
CREATE TABLE IF NOT EXISTS debtor_notes (
  id VARCHAR(255) PRIMARY KEY,
  customer_number VARCHAR(100),
  category VARCHAR(100),
  text TEXT,
  author VARCHAR(255),
  created_at VARCHAR(100),
  updated_by VARCHAR(255),
  updated_at VARCHAR(100),
  is_pinned BOOLEAN DEFAULT FALSE
);`;
                  navigator.clipboard.writeText(sqlCode);
                  setCopiedText("sql");
                  setTimeout(() => setCopiedText(null), 2000);
                }}
                className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-800 text-slate-300 hover:text-white transition text-xs flex items-center gap-1 cursor-pointer border border-slate-700"
              >
                {copiedText === "sql" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Şemayı Kopyala</span>
                  </>
                )}
              </button>
              <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto max-h-60 leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-12">
{`-- 1. Import Metadata Table
CREATE TABLE IF NOT EXISTS import_metadata (
  import_id VARCHAR(255) PRIMARY KEY,
  business_module VARCHAR(50) NOT NULL,
  business_date VARCHAR(100),
  worksheet_name VARCHAR(255),
  uploaded_file_name VARCHAR(255),
  original_file_size BIGINT,
  imported_row_count INTEGER,
  imported_column_count INTEGER,
  imported_at VARCHAR(100),
  uploaded_by VARCHAR(255),
  import_status VARCHAR(50),
  import_version INTEGER,
  file_hash VARCHAR(255),
  template_version VARCHAR(50) DEFAULT '1.0.0',
  error_message TEXT,
  replaced_import_id VARCHAR(255),
  application_version VARCHAR(50) DEFAULT '1.0.0',
  tilbud_uge BOOLEAN DEFAULT FALSE
);

-- 2. Sales Rows Table
CREATE TABLE IF NOT EXISTS sales_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id VARCHAR(255) REFERENCES import_metadata(import_id) ON DELETE CASCADE,
  posting_date VARCHAR(100),
  entry_type VARCHAR(100),
  document_type VARCHAR(100),
  document_number VARCHAR(100),
  item_number VARCHAR(100),
  description TEXT,
  location_code VARCHAR(100),
  quantity NUMERIC,
  invoiced_quantity NUMERIC,
  remaining_quantity NUMERIC,
  sales_amount NUMERIC,
  cost_amount NUMERIC,
  source_type VARCHAR(100),
  customer_number VARCHAR(100),
  customer_name VARCHAR(255),
  department_code VARCHAR(100),
  employee_name VARCHAR(255)
);

-- 3. Debitor Rows Table
CREATE TABLE IF NOT EXISTS debitor_rows (
  id BIGSERIAL PRIMARY KEY,
  import_id VARCHAR(255) REFERENCES import_metadata(import_id) ON DELETE CASCADE,
  customer_number VARCHAR(100),
  customer_name VARCHAR(255),
  balance NUMERIC,
  overdue_balance NUMERIC,
  payment_terms VARCHAR(255),
  last_invoice VARCHAR(100),
  credit_handling VARCHAR(255),
  salesperson VARCHAR(255),
  location VARCHAR(255),
  seller VARCHAR(255)
);

-- 4. Debtor Actions Table
CREATE TABLE IF NOT EXISTS debtor_actions (
  id VARCHAR(255) PRIMARY KEY,
  customer_number VARCHAR(100),
  type VARCHAR(100),
  status VARCHAR(100),
  priority VARCHAR(100),
  owner VARCHAR(255),
  due_date VARCHAR(100),
  comment TEXT,
  created_by VARCHAR(255),
  created_at VARCHAR(100),
  updated_by VARCHAR(255),
  updated_at VARCHAR(100),
  closed_at VARCHAR(100),
  promised_payment_date VARCHAR(100),
  reference VARCHAR(255)
);

-- 5. Debtor Notes Table
CREATE TABLE IF NOT EXISTS debtor_notes (
  id VARCHAR(255) PRIMARY KEY,
  customer_number VARCHAR(100),
  category VARCHAR(100),
  text TEXT,
  author VARCHAR(255),
  created_at VARCHAR(100),
  updated_by VARCHAR(255),
  updated_at VARCHAR(100),
  is_pinned BOOLEAN DEFAULT FALSE
);`}
              </pre>
            </div>
          )}
        </div>

        {showCredentials && (
          <form onSubmit={handleSaveCredentials} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Supabase URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-gray-400" />
                  Supabase Proje URL (SUPABASE_URL)
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://xxxxxx.supabase.co"
                  value={credentials.SUPABASE_URL}
                  onChange={(e) => setCredentials({ ...credentials, SUPABASE_URL: e.target.value })}
                  className="w-full text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Toggle Mock Data */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700 block">
                  Veri Depolama Durumu (USE_MOCK_DATA)
                </label>
                <div className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-200 rounded-lg h-[38px]">
                  <input
                    type="checkbox"
                    id="use_mock_data"
                    checked={credentials.USE_MOCK_DATA}
                    onChange={(e) => setCredentials({ ...credentials, USE_MOCK_DATA: e.target.checked })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor="use_mock_data" className="text-xs font-medium text-gray-700 cursor-pointer select-none">
                    Lokal yedek modunu etkinleştir (Supabase yerine yerel JSON dosyalarını kullanır)
                  </label>
                </div>
              </div>
            </div>

            {/* Supabase Key */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-gray-400" />
                  Supabase API Key (SUPABASE_KEY)
                </label>
                <button
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {showPrivateKey ? (
                    <>
                      <EyeOff className="h-3 w-3" /> Gizle
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> Göster
                    </>
                  )}
                </button>
              </div>
              <input
                type={showPrivateKey ? "text" : "password"}
                required
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={credentials.SUPABASE_KEY}
                onChange={(e) => setCredentials({ ...credentials, SUPABASE_KEY: e.target.value })}
                className="w-full text-xs p-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {settingsMessage && (
              <div className={`p-3.5 rounded-lg flex items-start gap-2.5 text-xs ${
                settingsMessage.type === "success" 
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                {settingsMessage.type === "success" ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{settingsMessage.text}</span>
              </div>
            )}

            {testResult && (
              <div className={`p-4 rounded-lg flex flex-col gap-2 text-xs border ${
                testResult.success 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                <div className="flex items-start gap-2.5">
                  {testResult.success ? (
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="whitespace-pre-line font-medium leading-relaxed">
                    {testResult.message}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                disabled={testingSettings || savingSettings}
                onClick={handleTestCredentials}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 border border-gray-200 rounded-lg transition shadow-sm cursor-pointer"
              >
                {testingSettings ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-500" /> 
                    <span>Bağlantı Test Ediliyor...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
                    <span>Bağlantıyı Test Et (Supabase)</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={savingSettings || testingSettings}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition shadow-sm cursor-pointer"
              >
                {savingSettings && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Bağlantı Ayarlarını Kaydet (Uygula)
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
