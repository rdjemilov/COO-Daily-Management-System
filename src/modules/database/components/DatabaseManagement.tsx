import React, { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle, RefreshCw, Calendar, Eye, Database } from "lucide-react";
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
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [fileHash, setFileHash] = useState<string>("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<ImportMetadata | null>(null);
  const [confirmedBusinessDate, setConfirmedBusinessDate] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Import history logs
  const [importHistory, setImportHistory] = useState<ImportMetadata[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; importId?: string } | null>(null);

  useEffect(() => {
    fetchImportHistory();
  }, []);

  const fetchImportHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const data = await res.json();
        setImportHistory(data);
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
        const response = await fetch("/api/upload", {
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
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          fileHash,
          businessDate: confirmedBusinessDate,
          replaceExisting,
          replaceImportId: duplicateInfo?.importId,
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
                  <button className="px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
                    Sales (Salg) - Aktiv
                  </button>
                  <button disabled className="px-3.5 py-2 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed">
                    Inventory (Lager) - Kommer snart
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
              <div className="p-5 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  {/* Found Required */}
                  <div className="border border-gray-100 rounded-lg p-3.5 bg-gray-50/30">
                    <span className="text-xs font-semibold text-gray-700">Obligatoriske felter fundet:</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {validation.requiredColumnsFound.map((col) => (
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
                      <span className={`font-semibold ${validation.missingColumns.length > 0 ? "text-red-600" : "text-gray-900"}`}>
                        {validation.missingColumns.length}
                      </span>
                    </div>
                    {validation.missingColumns.length > 0 && (
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
    </div>
  );
}
