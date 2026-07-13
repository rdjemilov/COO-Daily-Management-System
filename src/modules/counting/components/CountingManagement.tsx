import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  Save,
  FileDown,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings,
  AlertCircle,
  Database,
  Calendar,
  Check,
  X,
  PlusCircle,
  Clock,
  ChevronDown,
  MessageSquare,
  Copy,
  ExternalLink
} from "lucide-react";
import {
  CountingWorkspace,
  CountingItem,
  CountingLocationEntry,
  CountingWorkspaceStatus
} from "../types.ts";
import {
  saveWorkspace,
  deleteWorkspace,
  getAllWorkspaces,
  clearAllWorkspaces
} from "../utils/db.ts";

// Canonical list of locations for first version support
const CANONICAL_LOCATIONS = [
  { id: "herning", label: "Herning" },
  { id: "aarhus", label: "Aarhus" },
  { id: "aalborg", label: "Aalborg" },
  { id: "odense", label: "Odense" }
];

export default function CountingManagement() {
  // Navigation tabs: "new-count" or specific workspace ID
  const [activeTab, setActiveTab] = useState<string>("new-count");
  const [workspaces, setWorkspaces] = useState<CountingWorkspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);

  // New Count state
  const [newCountReason, setNewCountReason] = useState<string>("Rutinekontrol");
  const [customReason, setCustomReason] = useState<string>("");
  const [newCountNote, setNewCountNote] = useState<string>("");
  const [itemInput, setItemInput] = useState<string>("");
  const [pendingItems, setPendingItems] = useState<{
    itemNumber: string;
    description: string;
    baseUnit: string;
    placementNumber?: string;
    blocked: boolean;
    stockByLocation: Record<string, number | null>;
    status: "loading" | "found" | "not_found" | "error";
  }[]>([]);
  
  // Pending item number validation message
  const [entryError, setEntryError] = useState<string | null>(null);

  // Active Workspace Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState<string>(" ");
  const [filterMode, setFilterMode] = useState<"all" | "uncounted" | "differences" | "negative" | "positive">("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [globalProductSource, setGlobalProductSource] = useState<string>("");
  const [globalProductTimestamp, setGlobalProductTimestamp] = useState<string>("");
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem("GOOGLE_PRODUCT_MASTER_SPREADSHEET_ID") || "1BqUfl2UZAXNLsiTInlVa_x7P4kA48_jQ6CwAe350Kqg";
  });
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState<string>(spreadsheetId);

  // Auto-save feedback state
  const [saveStatus, setSaveStatus] = useState<Record<string, "saved" | "saving" | "error">>({});
  const [saveTime, setSaveTime] = useState<Record<string, string>>({});

  // Dialog / Modal States
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearLocal, setConfirmClearLocal] = useState<boolean>(false);
  const [confirmUnsavedClose, setConfirmUnsavedClose] = useState<{ id: string; nextTab: string } | null>(null);
  const [confirmExportUncounted, setConfirmExportUncounted] = useState<{ ws: CountingWorkspace } | null>(null);
  const [refreshingSystemId, setRefreshingSystemId] = useState<string | null>(null);
  const [refreshingSystemSuccess, setRefreshingSystemSuccess] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState<boolean>(false);
  const [whatsappMessageText, setWhatsappMessageText] = useState<string>("");
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  
  // Focus ref for item entry input
  const itemInputRef = useRef<HTMLInputElement>(null);

  // Load local workspaces on mount
  useEffect(() => {
    async function loadData() {
      try {
        const list = await getAllWorkspaces();
        // Sort workspaces by createdAt descending
        const sorted = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setWorkspaces(sorted);
        
        // Find if there are unsaved drafts
        const hasDraft = sorted.some(ws => ws.status === "draft" || ws.status === "in-progress");
        
        // Auto-select the first tab if available
        if (sorted.length > 0) {
          setActiveTab(sorted[0].id);
        } else {
          setActiveTab("new-count");
        }

        // Get saved spreadsheet ID
        const savedSheetId = localStorage.getItem("GOOGLE_PRODUCT_MASTER_SPREADSHEET_ID") || "1BqUfl2UZAXNLsiTInlVa_x7P4kA48_jQ6CwAe350Kqg";

        // Trigger a background product master status check
        const res = await fetch(`/api/counting/products?items=&spreadsheetId=${encodeURIComponent(savedSheetId)}`);
        if (res.ok) {
          const data = await res.json();
          setGlobalProductSource(data.source || "mock");
          if (data.sourceTimestamp) {
            setGlobalProductTimestamp(new Date(data.sourceTimestamp).toLocaleString("da-DK"));
          }
        }
      } catch (e) {
        console.error("Failed to load local cycle counting workspaces:", e);
      } finally {
        setLoadingWorkspaces(false);
      }
    }
    loadData();
  }, []);

  // Location specific pastel colors and thick border configurations
  const LOCATION_COLORS: Record<string, { bg: string; headerBg: string; border: string; labelBg: string }> = {
    herning: {
      bg: "bg-blue-50/15",
      headerBg: "bg-blue-900/90",
      border: "border-blue-200/50",
      labelBg: "bg-blue-100/80 text-blue-800"
    },
    aarhus: {
      bg: "bg-purple-50/15",
      headerBg: "bg-purple-900/90",
      border: "border-purple-200/50",
      labelBg: "bg-purple-100/80 text-purple-800"
    },
    aalborg: {
      bg: "bg-teal-50/15",
      headerBg: "bg-teal-900/90",
      border: "border-teal-200/50",
      labelBg: "bg-teal-100/80 text-teal-800"
    },
    odense: {
      bg: "bg-amber-50/15",
      headerBg: "bg-amber-900/90",
      border: "border-amber-200/50",
      labelBg: "bg-amber-100/80 text-amber-800"
    }
  };

  const handleManualSave = async (ws: CountingWorkspace) => {
    const wsId = ws.id;
    setSaveStatus(prev => ({ ...prev, [wsId]: "saving" }));
    try {
      const toSave = {
        ...ws,
        isDirty: false,
        updatedAt: new Date().toISOString()
      };
      await saveWorkspace(toSave);
      setSaveStatus(prev => ({ ...prev, [wsId]: "saved" }));
      setSaveTime(prev => ({
        ...prev,
        [wsId]: new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      }));
      setWorkspaces(prev => prev.map(w => w.id === wsId ? toSave : w));
    } catch (err) {
      console.error("Manual save failed:", err);
      setSaveStatus(prev => ({ ...prev, [wsId]: "error" }));
    }
  };

  // Periodic Auto-Save interval (Every 1 minute / 60 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      // Find all workspaces that are dirty
      const dirtyWorkspaces = workspaces.filter(ws => ws.isDirty);
      if (dirtyWorkspaces.length === 0) return;

      for (const ws of dirtyWorkspaces) {
        const wsId = ws.id;
        setSaveStatus(prev => ({ ...prev, [wsId]: "saving" }));
        try {
          const toSave = {
            ...ws,
            isDirty: false, // Mark as saved
            updatedAt: new Date().toISOString()
          };
          await saveWorkspace(toSave);
          
          setSaveStatus(prev => ({ ...prev, [wsId]: "saved" }));
          setSaveTime(prev => ({
            ...prev,
            [wsId]: new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          }));
          
          // Update the workspaces list to clear the isDirty flag
          setWorkspaces(prev => prev.map(w => w.id === wsId ? toSave : w));
        } catch (err) {
          console.error("Periodic auto save failed for workspace", wsId, err);
          setSaveStatus(prev => ({ ...prev, [wsId]: "error" }));
        }
      }
    }, 60000); // 60 seconds (1 minute)

    return () => clearInterval(interval);
  }, [workspaces]);

  // Keyboard navigation for active table
  const handleTableKeyDown = (e: React.KeyboardEvent, rowIdx: number, locIdx: number, maxLocs: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move to next row's same location input
      const nextInputId = `input-count-${rowIdx + 1}-${locIdx}`;
      const nextEl = document.getElementById(nextInputId) as HTMLInputElement | null;
      if (nextEl) {
        nextEl.focus();
        nextEl.select();
      }
    }
  };

  // Safe Danish parsing for numbers (handles commas and dots)
  const parseDanishFloat = (str: string): number | null => {
    const cleaned = str.trim();
    if (cleaned === "") return null;
    
    // Replace dots (thousands separators) and commas (decimals)
    let standardized = cleaned;
    if (standardized.includes(",") && !standardized.includes(".")) {
      standardized = standardized.replace(/,/g, ".");
    } else if (standardized.includes(",") && standardized.includes(".")) {
      standardized = standardized.replace(/\./g, "").replace(/,/g, ".");
    }
    
    const parsed = parseFloat(standardized);
    return isNaN(parsed) ? null : parsed;
  };

  // Helper to format values elegantly
  const formatDanishVal = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "—";
    return val.toLocaleString("da-DK", { maximumFractionDigits: 3 });
  };

  // Safe manual Product Master refresh
  const [isRefreshingMaster, setIsRefreshingMaster] = useState<boolean>(false);
  const [refreshMasterSuccess, setRefreshMasterSuccess] = useState<boolean>(false);
  const handleRefreshProductMaster = async (customId?: string) => {
    setIsRefreshingMaster(true);
    setRefreshMasterSuccess(false);
    try {
      const activeId = customId || spreadsheetId;
      const res = await fetch("/api/counting/products/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: activeId })
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalProductSource(data.source || "mock");
        if (data.sourceTimestamp) {
          setGlobalProductTimestamp(new Date(data.sourceTimestamp).toLocaleString("da-DK"));
        }
        setRefreshMasterSuccess(true);
        setTimeout(() => setRefreshMasterSuccess(false), 3000);
      }
    } catch (e) {
      console.error("Failed to refresh product master:", e);
    } finally {
      setIsRefreshingMaster(false);
    }
  };

  const handleSaveSpreadsheetId = () => {
    const cleaned = spreadsheetIdInput.trim();
    if (!cleaned) return;
    setSpreadsheetId(cleaned);
    localStorage.setItem("GOOGLE_PRODUCT_MASTER_SPREADSHEET_ID", cleaned);
    // Refresh with the new ID immediately
    handleRefreshProductMaster(cleaned);
  };

  // Clear all local data helper
  const handleClearAllLocalData = async () => {
    try {
      await clearAllWorkspaces();
      setWorkspaces([]);
      setActiveTab("new-count");
      setConfirmClearLocal(false);
      setShowSettings(false);
    } catch (err) {
      console.error("Failed to clear local workspaces:", err);
    }
  };

  // Add Item to Pending List (with exact lookup check)
  const handleAddSingleItem = async (inputStr: string) => {
    setEntryError(null);
    const cleaned = inputStr.trim();
    if (!cleaned) return;

    // Check for duplicates in the pending list
    if (pendingItems.some(item => item.itemNumber === cleaned)) {
      setEntryError("Denne vare findes allerede på listen.");
      return;
    }

    // Insert as temporary loading row
    const tempIndex = pendingItems.length;
    setPendingItems(prev => [
      ...prev,
      {
        itemNumber: cleaned,
        description: "Søger...",
        baseUnit: "STK",
        blocked: false,
        stockByLocation: {},
        status: "loading"
      }
    ]);

    setItemInput("");
    if (itemInputRef.current) {
      itemInputRef.current.focus();
    }

    try {
      const res = await fetch("/api/counting/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumbers: [cleaned], spreadsheetId })
      });

      if (!res.ok) throw new Error("Opslagsfejl");
      const data = await res.json();

      if (data.products && data.products.length > 0) {
        const matched = data.products[0];
        setPendingItems(prev => {
          const updated = [...prev];
          updated[tempIndex] = {
            itemNumber: matched.itemNumber,
            description: matched.description || "Uden beskrivelse",
            baseUnit: matched.baseUnit || "STK",
            placementNumber: matched.placementNumber,
            blocked: !!matched.blocked,
            stockByLocation: matched.stockByLocation || {},
            status: "found"
          };
          return updated;
        });
      } else {
        // Not found
        setPendingItems(prev => {
          const updated = [...prev];
          updated[tempIndex] = {
            itemNumber: cleaned,
            description: "Vare ikke fundet",
            baseUnit: "STK",
            blocked: false,
            stockByLocation: {},
            status: "not_found"
          };
          return updated;
        });
      }
    } catch (err) {
      setPendingItems(prev => {
        const updated = [...prev];
        updated[tempIndex] = {
          itemNumber: cleaned,
          description: "Fejl under opslag",
          baseUnit: "STK",
          blocked: false,
          stockByLocation: {},
          status: "error"
        };
        return updated;
      });
    }
  };

  // Support pasting multiple items
  const handlePasteItems = async (pastedText: string) => {
    setEntryError(null);
    const separators = /[\n,;\t]+/;
    const items = pastedText
      .split(separators)
      .map(i => i.trim())
      .filter(Boolean);

    if (items.length === 0) return;

    // Filter out items already in list
    const existingNums = pendingItems.map(p => p.itemNumber);
    const newItems = items.filter(item => {
      const exists = existingNums.includes(item);
      if (exists) {
        setEntryError("Nogle af de indsatte varer findes allerede på listen og blev sprunget over.");
      }
      return !exists;
    });

    if (newItems.length === 0) return;

    // Put all in loading status
    const startIndex = pendingItems.length;
    const tempLoaders = newItems.map(item => ({
      itemNumber: item,
      description: "Søger...",
      baseUnit: "STK",
      blocked: false,
      stockByLocation: {},
      status: "loading" as const
    }));

    setPendingItems(prev => [...prev, ...tempLoaders]);
    setItemInput("");

    try {
      const res = await fetch("/api/counting/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumbers: newItems, spreadsheetId })
      });

      if (!res.ok) throw new Error("Batch lookup failed");
      const data = await res.json();

      setPendingItems(prev => {
        const updated = [...prev];
        newItems.forEach((num, index) => {
          const absoluteIndex = startIndex + index;
          if (absoluteIndex >= updated.length) return;

          const matched = data.products?.find((p: any) => p.itemNumber === num);
          if (matched) {
            updated[absoluteIndex] = {
              itemNumber: matched.itemNumber,
              description: matched.description || "Uden beskrivelse",
              baseUnit: matched.baseUnit || "STK",
              placementNumber: matched.placementNumber,
              blocked: !!matched.blocked,
              stockByLocation: matched.stockByLocation || {},
              status: "found"
            };
          } else {
            updated[absoluteIndex] = {
              itemNumber: num,
              description: "Vare ikke fundet",
              baseUnit: "STK",
              blocked: false,
              stockByLocation: {},
              status: "not_found"
            };
          }
        });
        return updated;
      });
    } catch (err) {
      setPendingItems(prev => {
        const updated = [...prev];
        for (let i = startIndex; i < updated.length; i++) {
          updated[i].status = "error";
          updated[i].description = "Fejl under opslag";
        }
        return updated;
      });
    }
  };

  const handleRemovePendingItem = (index: number) => {
    setPendingItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Generate WhatsApp message for pending items list
  const handleGenerateWhatsappMessage = () => {
    if (pendingItems.length === 0) return;
    
    const productLines = pendingItems.map(item => {
      const desc = item.description || "Ingen beskrivelse";
      return `${item.itemNumber} - ${desc}`;
    }).join("\n");

    const message = `Merhaba, bu urunleri sayabilir misiniz:\n\n${productLines}`;
    setWhatsappMessageText(message);
    setWhatsappModalOpen(true);
    setCopiedSuccess(false);
  };

  // Generate WhatsApp message for current workspace
  const handleGenerateActiveWorkspaceWhatsappMessage = (ws: CountingWorkspace) => {
    if (!ws || !ws.items || ws.items.length === 0) return;
    
    const productLines = ws.items.map(item => {
      const desc = item.description || "Ingen beskrivelse";
      return `${item.itemNumber} - ${desc}`;
    }).join("\n");

    const message = `Merhaba, bu urunleri sayabilir misiniz:\n\n${productLines}`;
    setWhatsappMessageText(message);
    setWhatsappModalOpen(true);
    setCopiedSuccess(false);
  };

  // Generate Count Workspace
  const handleGenerateWorkspace = async () => {
    setEntryError(null);
    if (!newCountReason) {
      setEntryError("Vælg venligst en optællingsårsag.");
      return;
    }
    if (newCountReason === "Andet" && !customReason.trim()) {
      setEntryError("Angiv venligst den specifikke årsag.");
      return;
    }
    if (pendingItems.length === 0) {
      setEntryError("Tilføj venligst mindst ét varenummer til optællingen.");
      return;
    }

    // Check if there are unresolved loading or error rows
    const hasUnresolved = pendingItems.some(i => i.status === "loading" || i.status === "not_found" || i.status === "error");
    if (hasUnresolved) {
      setEntryError("Fjern eller ret venligst varer, der ikke blev fundet, før du fortsætter.");
      return;
    }

    // Build unique ID and sequence names
    const todayStr = new Date().toLocaleDateString("en-GB").replace(/\//g, "-"); // DD-MM-YYYY
    const displayReason = newCountReason === "Andet" ? customReason.trim() : newCountReason;
    
    let baseTitle = `${todayStr} – ${displayReason}`;
    let finalTitle = baseTitle;
    let sequence = 1;

    while (workspaces.some(w => w.title === finalTitle)) {
      sequence++;
      finalTitle = `${baseTitle} #${sequence}`;
    }

    const wsId = `ws-${Date.now()}`;

    // Create standard location entry configurations
    const items: CountingItem[] = pendingItems.map(p => {
      const locationsList: CountingLocationEntry[] = CANONICAL_LOCATIONS.map(loc => {
        const sysVal = p.stockByLocation[loc.id];
        return {
          locationId: loc.id,
          locationLabel: loc.label,
          systemQuantity: sysVal !== undefined ? sysVal : null,
          countedQuantity: null,
          difference: null
        };
      });

      return {
        itemNumber: p.itemNumber,
        description: p.description,
        baseUnit: p.baseUnit,
        placementNumber: p.placementNumber,
        blocked: p.blocked,
        locations: locationsList
      };
    });

    const newWorkspace: CountingWorkspace = {
      id: wsId,
      title: finalTitle,
      reason: newCountReason,
      customReason: newCountReason === "Andet" ? customReason.trim() : undefined,
      note: newCountNote.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft",
      items,
      pdfSaved: false,
      isDirty: false
    };

    try {
      await saveWorkspace(newWorkspace);
      setWorkspaces(prev => [newWorkspace, ...prev]);
      
      // Reset creator state
      setNewCountNote("");
      setPendingItems([]);
      setItemInput("");
      
      // Open workspace
      setActiveTab(wsId);
    } catch (e) {
      console.error("Failed to create workspace:", e);
      setEntryError("Kunne ikke gemme optælling lokalt i IndexedDB.");
    }
  };

  // Active Workspace: Value Edit Handler
  const handleCountValueChange = (
    ws: CountingWorkspace,
    itemNumber: string,
    locationId: string,
    rawValStr: string
  ) => {
    const updatedItems = ws.items.map(item => {
      if (item.itemNumber !== itemNumber) return item;

      const updatedLocs = item.locations.map(loc => {
        if (loc.locationId !== locationId) return loc;

        const countVal = parseDanishFloat(rawValStr);
        let diff: number | null = null;
        
        if (countVal !== null && loc.systemQuantity !== null) {
          diff = countVal - loc.systemQuantity;
        }

        return {
          ...loc,
          countedQuantity: countVal,
          difference: diff
        };
      });

      return {
        ...item,
        locations: updatedLocs
      };
    });

    // Check workspace status
    let currentStatus: CountingWorkspaceStatus = ws.status;
    // Set to In Progress on first edit
    if (currentStatus === "draft" || currentStatus === "completed") {
      currentStatus = "in-progress";
    }

    const updatedWorkspace: CountingWorkspace = {
      ...ws,
      items: updatedItems,
      status: currentStatus,
      isDirty: true,
      updatedAt: new Date().toISOString()
    };

    // Update in-memory state instantly for zero-lag typing
    setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
  };

  // Active Workspace: System Value Edit Handler
  const handleSystemValueChange = (
    ws: CountingWorkspace,
    itemNumber: string,
    locationId: string,
    rawValStr: string
  ) => {
    const updatedItems = ws.items.map(item => {
      if (item.itemNumber !== itemNumber) return item;

      const updatedLocs = item.locations.map(loc => {
        if (loc.locationId !== locationId) return loc;

        const sysVal = parseDanishFloat(rawValStr);
        let diff: number | null = null;
        
        if (loc.countedQuantity !== null && sysVal !== null) {
          diff = loc.countedQuantity - sysVal;
        }

        return {
          ...loc,
          systemQuantity: sysVal,
          difference: diff
        };
      });

      return {
        ...item,
        locations: updatedLocs
      };
    });

    // Check workspace status
    let currentStatus: CountingWorkspaceStatus = ws.status;
    if (currentStatus === "draft" || currentStatus === "completed") {
      currentStatus = "in-progress";
    }

    const updatedWorkspace: CountingWorkspace = {
      ...ws,
      items: updatedItems,
      status: currentStatus,
      isDirty: true,
      updatedAt: new Date().toISOString()
    };

    // Update in-memory state instantly for zero-lag typing
    setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
  };

  // Add Item to Active Workspace after generation
  const [activeWorkspaceItemInput, setActiveWorkspaceItemInput] = useState<string>("");
  const [activeWorkspaceItemError, setActiveWorkspaceItemError] = useState<string | null>(null);
  const [isSearchingActiveWorkspaceItem, setIsSearchingActiveWorkspaceItem] = useState<boolean>(false);

  const handleAddItemToActiveWorkspace = async (ws: CountingWorkspace) => {
    setActiveWorkspaceItemError(null);
    const cleaned = activeWorkspaceItemInput.trim();
    if (!cleaned) return;

    if (ws.items.some(item => item.itemNumber === cleaned)) {
      setActiveWorkspaceItemError("Denne vare findes allerede på listen.");
      return;
    }

    setIsSearchingActiveWorkspaceItem(true);
    try {
      const res = await fetch("/api/counting/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumbers: [cleaned], spreadsheetId })
      });

      if (!res.ok) throw new Error("Lookup error");
      const data = await res.json();

      if (data.products && data.products.length > 0) {
        const matched = data.products[0];
        
        const newLocations: CountingLocationEntry[] = CANONICAL_LOCATIONS.map(loc => {
          const sysVal = matched.stockByLocation[loc.id];
          return {
            locationId: loc.id,
            locationLabel: loc.label,
            systemQuantity: sysVal !== undefined ? sysVal : null,
            countedQuantity: null,
            difference: null
          };
        });

        const newItem: CountingItem = {
          itemNumber: matched.itemNumber,
          description: matched.description || "Uden beskrivelse",
          baseUnit: matched.baseUnit || "STK",
          placementNumber: matched.placementNumber,
          blocked: !!matched.blocked,
          locations: newLocations
        };

        const updatedWorkspace: CountingWorkspace = {
          ...ws,
          items: [...ws.items, newItem],
          status: ws.status === "completed" ? "in-progress" : ws.status,
          isDirty: true,
          updatedAt: new Date().toISOString()
        };

        await saveWorkspace(updatedWorkspace);
        setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
        setActiveWorkspaceItemInput("");
      } else {
        setActiveWorkspaceItemError("Varen blev ikke fundet i produktkartoteket.");
      }
    } catch (err) {
      setActiveWorkspaceItemError("Netværksfejl under søgning.");
    } finally {
      setIsSearchingActiveWorkspaceItem(false);
    }
  };

  // Remove Item from Active Workspace
  const handleRemoveItemFromActiveWorkspace = async (ws: CountingWorkspace, itemNumber: string) => {
    const updatedItems = ws.items.filter(item => item.itemNumber !== itemNumber);
    const updatedWorkspace: CountingWorkspace = {
      ...ws,
      items: updatedItems,
      isDirty: true,
      status: ws.status === "completed" ? "in-progress" : ws.status,
      updatedAt: new Date().toISOString()
    };

    await saveWorkspace(updatedWorkspace);
    setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
  };

  // Reset all counts for active workspace
  const handleResetAllCounts = async (ws: CountingWorkspace) => {
    if (!window.confirm("Er du sikker på, at du vil rydde alle indtastede tal for denne optælling? Dette kan ikke fortrydes.")) {
      return;
    }

    const resetItems = ws.items.map(item => ({
      ...item,
      locations: item.locations.map(loc => ({
        ...loc,
        countedQuantity: null,
        difference: null
      }))
    }));

    const updatedWorkspace: CountingWorkspace = {
      ...ws,
      items: resetItems,
      status: "draft",
      isDirty: true,
      updatedAt: new Date().toISOString()
    };

    await saveWorkspace(updatedWorkspace);
    setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
  };

  // Invalidate and refresh active system values from Google Sheets Master
  const handleUpdateSystemValues = async (ws: CountingWorkspace) => {
    setRefreshingSystemId(ws.id);
    setRefreshingSystemSuccess(false);

    try {
      const itemNumbers = ws.items.map(item => item.itemNumber);
      const res = await fetch("/api/counting/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNumbers, spreadsheetId })
      });

      if (!res.ok) throw new Error("Batch refresh failed");
      const data = await res.json();

      const updatedItems = ws.items.map(item => {
        const refreshedProduct = data.products?.find((p: any) => p.itemNumber === item.itemNumber);
        if (!refreshedProduct) return item;

        const updatedLocs = item.locations.map(loc => {
          const sysVal = refreshedProduct.stockByLocation[loc.locationId];
          const updatedSysQty = sysVal !== undefined ? sysVal : null;
          
          let updatedDiff: number | null = null;
          if (loc.countedQuantity !== null && updatedSysQty !== null) {
            updatedDiff = loc.countedQuantity - updatedSysQty;
          }

          return {
            ...loc,
            systemQuantity: updatedSysQty,
            difference: updatedDiff
          };
        });

        return {
          ...item,
          locations: updatedLocs
        };
      });

      const updatedWorkspace: CountingWorkspace = {
        ...ws,
        items: updatedItems,
        isDirty: true,
        status: ws.status === "completed" ? "in-progress" : ws.status,
        updatedAt: new Date().toISOString()
      };

      await saveWorkspace(updatedWorkspace);
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
      setRefreshingSystemSuccess(true);
      setTimeout(() => setRefreshingSystemSuccess(false), 3000);
    } catch (e) {
      console.error("Failed to update system stock values:", e);
      alert("Kunne ikke opdatere systemtal. Kontroller internetforbindelsen.");
    } finally {
      setRefreshingSystemId(null);
    }
  };

  // Delete Workspace with confirmation
  const handleDeleteWorkspaceConfirmed = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteWorkspace(confirmDeleteId);
      setWorkspaces(prev => prev.filter(w => w.id !== confirmDeleteId));
      
      // Navigate away
      if (activeTab === confirmDeleteId) {
        setActiveTab("new-count");
      }
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    }
  };

  // Close Workspace tab verification
  const handleCloseTabRequest = (ws: CountingWorkspace) => {
    if (ws.isDirty && !ws.pdfSaved) {
      setConfirmUnsavedClose({ id: ws.id, nextTab: "new-count" });
    } else {
      // safe close
      setActiveTab("new-count");
    }
  };

  // PDF Export Trigger handler
  const handleExportPdfTrigger = (ws: CountingWorkspace) => {
    // Check if there are uncounted cells
    let uncountedCount = 0;
    ws.items.forEach(item => {
      item.locations.forEach(loc => {
        if (loc.countedQuantity === null) {
          uncountedCount++;
        }
      });
    });

    if (uncountedCount > 0) {
      setConfirmExportUncounted({ ws });
    } else {
      executePdfExport(ws);
    }
  };

  const executePdfExport = async (ws: CountingWorkspace) => {
    setIsExportingPdf(true);
    setConfirmExportUncounted(null);
    try {
      const response = await fetch("/api/counting/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: ws })
      });

      if (!response.ok) throw new Error("Kunne ikke generere PDF-rapport.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const datePart = ws.createdAt ? ws.createdAt.substring(0, 10) : new Date().toISOString().split("T")[0];
      const cleanReason = (ws.reason === "Andet" && ws.customReason ? ws.customReason : ws.reason)
        .replace(/[^a-zA-Z0-9æøåÆØÅ\-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .substring(0, 30);
      a.download = `DF-Cycle-Counting_${datePart}_${cleanReason}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Save PDF state completed locally
      const updatedWorkspace: CountingWorkspace = {
        ...ws,
        status: "completed",
        pdfSaved: true,
        pdfSavedAt: new Date().toISOString(),
        isDirty: false
      };

      await saveWorkspace(updatedWorkspace);
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? updatedWorkspace : w));
    } catch (err: any) {
      console.error("PDF generation failure:", err);
      alert("Fejl under PDF generation: " + err.message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Filter items in active workspace view
  const currentWorkspace = useMemo(() => {
    return workspaces.find(w => w.id === activeTab);
  }, [workspaces, activeTab]);

  const filteredWorkspaceItems = useMemo(() => {
    if (!currentWorkspace) return [];
    let items = [...currentWorkspace.items];

    // Search query filter (trimmed, exact/substring on varenr or desc)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        item =>
          item.itemNumber.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }

    // Status / Difference filter modes
    if (filterMode === "uncounted") {
      items = items.filter(item =>
        item.locations.some(l => l.countedQuantity === null)
      );
    } else if (filterMode === "differences") {
      items = items.filter(item =>
        item.locations.some(l => l.difference !== null && l.difference !== 0)
      );
    } else if (filterMode === "negative") {
      items = items.filter(item =>
        item.locations.some(l => l.difference !== null && l.difference < 0)
      );
    } else if (filterMode === "positive") {
      items = items.filter(item =>
        item.locations.some(l => l.difference !== null && l.difference > 0)
      );
    }

    // Specific Location filter
    if (filterLocation !== "all") {
      items = items.filter(item => {
        const loc = item.locations.find(l => l.locationId === filterLocation);
        return loc && loc.countedQuantity !== null;
      });
    }

    return items;
  }, [currentWorkspace, searchQuery, filterMode, filterLocation]);

  // Compute stats for active workspace
  const workspaceStats = useMemo(() => {
    if (!currentWorkspace) return null;
    
    let totalItems = currentWorkspace.items.length;
    let fullyCounted = 0;
    let totalUncountedFields = 0;
    let differencesCount = 0;
    let negativeDiffs = 0;
    let positiveDiffs = 0;
    let totalAbsQtyDiff = 0;

    currentWorkspace.items.forEach(item => {
      let isItemFullyCounted = true;
      item.locations.forEach(loc => {
        if (loc.countedQuantity === null) {
          isItemFullyCounted = false;
          totalUncountedFields++;
        } else {
          if (loc.difference !== null && loc.difference !== 0) {
            differencesCount++;
            totalAbsQtyDiff += Math.abs(loc.difference);
            if (loc.difference < 0) negativeDiffs++;
            else positiveDiffs++;
          }
        }
      });
      if (isItemFullyCounted) fullyCounted++;
    });

    return {
      totalItems,
      fullyCounted,
      remainingItems: totalItems - fullyCounted,
      totalUncountedFields,
      differencesCount,
      negativeDiffs,
      positiveDiffs,
      totalAbsQtyDiff
    };
  }, [currentWorkspace]);

  return (
    <div className="space-y-6">
      {/* 1. Header with dynamic status & tabs bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Salg & Lagerstyring (Cycle Counting)</h1>
          <p className="text-sm text-gray-400 mt-0.5">Opret midlertidige tællelister, beregn svind og eksporter revisionsklare rapporter.</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition cursor-pointer"
            title="Indstillinger"
            id="counting-settings-btn"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 2. Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-brand" />
              Google Sheets Produkt Master
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Systemet læser systembeholdninger direkte fra det konfigurerede Google Sheet. 
              Intet optællingsdata skrives tilbage til arket – dine oprindelige data forbliver 100% uberørte.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-400">Datakilde:</span>
                <span className="font-semibold text-gray-700 capitalize">{globalProductSource === "mock" ? "Mock Simulation (Ingen Sheets Auth Påkrævet)" : "Google Sheets API"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-400">Seneste indlæsning:</span>
                <span className="font-mono text-gray-600">{globalProductTimestamp || "Ikke indlæst endnu"}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Google Sheet ID (Aktuelt anvendt ID):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={spreadsheetIdInput}
                  onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                  placeholder="Skriv Google Sheet ID..."
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand font-mono text-gray-700 bg-gray-50 focus:bg-white transition"
                />
                <button
                  onClick={handleSaveSpreadsheetId}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-black transition cursor-pointer shrink-0"
                >
                  Gem ID
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Indsæt det nye Google Sheet ID ovenfor og klik på "Gem ID" for at synkronisere med det samme.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleRefreshProductMaster}
                disabled={isRefreshingMaster}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingMaster ? "animate-spin" : ""}`} />
                {isRefreshingMaster ? "Opdaterer..." : "Opdater produktdata"}
              </button>
              {refreshMasterSuccess && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="h-4 w-4" /> Opdateret!
                </span>
              )}
            </div>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-gray-100 pt-5 md:pt-0 md:pl-6">
            <h3 className="text-sm font-bold text-red-600 flex items-center gap-2 mb-3">
              <Trash2 className="h-4 w-4 text-red-600" />
              Lokale data &amp; Sikkerhed
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Uafsluttede optællinger gemmes lokalt i din browsers IndexedDB. Data deles ikke på tværs af computere, 
              og slettes permanent ved rydning eller manuel afskrivning.
            </p>
            <button
              onClick={() => setConfirmClearLocal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition cursor-pointer"
              id="clear-local-data-btn"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Ryd lokale optællingsdata
            </button>
          </div>
        </div>
      )}

      {/* 3. Horizontal Tabs Row */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto pb-px" id="counting-workspace-tabs">
        <button
          onClick={() => setActiveTab("new-count")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "new-count"
              ? "border-brand text-brand bg-slate-50"
              : "border-transparent text-gray-400 hover:text-gray-900 hover:border-gray-300"
          }`}
          id="new-count-tab"
        >
          <PlusCircle className="h-4 w-4" />
          Ny Optælling
        </button>

        {workspaces.map((ws) => {
          const isActive = activeTab === ws.id;
          const label = ws.title;
          const displayStatus = ws.status === "completed" ? "Udført" : "Draft";
          return (
            <div key={ws.id} className="flex items-center group relative border-r border-gray-100">
              <button
                onClick={() => setActiveTab(ws.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-brand text-brand bg-slate-50"
                    : "border-transparent text-gray-400 hover:text-gray-900 hover:border-gray-300"
                }`}
                title={label}
              >
                <Calendar className="h-3.5 w-3.5 text-gray-400 group-hover:text-brand transition" />
                <span>{label.length > 28 ? label.slice(0, 26) + "..." : label}</span>
                {ws.status === "completed" && (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" title="PDF Gemt" />
                )}
              </button>
              <button
                onClick={() => handleCloseTabRequest(ws)}
                className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition absolute right-1 top-2.5 md:opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Luk fane"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* 4. Tab Content: New Count Creator Page */}
      {activeTab === "new-count" && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-2xs space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h2 className="text-base font-bold text-gray-900">Opret ny lagertælling</h2>
            <p className="text-xs text-gray-400 mt-1">
              Tilføj varenumre nedenfor for at starte tællelisten. Varedetaljer og beholdningstal matches automatisk.
            </p>
          </div>

          {/* Form parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                Optællingsårsag <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={newCountReason}
                  onChange={(e) => setNewCountReason(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-hidden focus:border-brand appearance-none cursor-pointer"
                  id="new-count-reason-select"
                >
                  <option value="Rutinekontrol">Rutinekontrol</option>
                  <option value="Lagerafvigelse">Lagerafvigelse</option>
                  <option value="Svindkontrol">Svindkontrol</option>
                  <option value="Varemodtagelse">Varemodtagelse</option>
                  <option value="Fejlmistanke">Fejlmistanke</option>
                  <option value="Lokationskontrol">Lokationskontrol</option>
                  <option value="Statuskontrol">Statuskontrol</option>
                  <option value="Andet">Andet (Angiv nedenfor)</option>
                </select>
                <ChevronDown className="h-4 w-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            {newCountReason === "Andet" && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-xs font-bold text-gray-700">Angiv Anden Årsag <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="F.eks. Månedlig revision af mejeriprodukter"
                  className="w-full border border-gray-200 rounded-lg px-3.5 py-2 text-xs focus:outline-hidden focus:border-brand"
                  id="new-count-custom-reason-input"
                />
              </div>
            )}

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Valgfri Note til Rapport</label>
              <textarea
                value={newCountNote}
                onChange={(e) => setNewCountNote(e.target.value)}
                placeholder="Skriv eventuelle bemærkninger eller instruktioner, som skal fremgå på den printede PDF rapport..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2 text-xs focus:outline-hidden focus:border-brand resize-none"
                id="new-count-note-textarea"
              />
            </div>
          </div>

          {/* Item entry text field */}
          <div className="border-t border-gray-50 pt-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Indtast varenumre (Varenr.)</span>
                <span className="text-[10px] text-gray-400 font-mono font-normal">Tip: Du kan indsætte flere adskilt af linjeskift, komma eller tab.</span>
              </label>
              <div className="flex gap-2">
                <input
                  ref={itemInputRef}
                  type="text"
                  value={itemInput}
                  onChange={(e) => setItemInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSingleItem(itemInput);
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData("text");
                    handlePasteItems(text);
                  }}
                  placeholder="Skriv varenr. (f.eks. 00101) og tryk Enter..."
                  className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2 text-xs focus:outline-hidden focus:border-brand font-mono"
                  id="item-number-input"
                />
                <button
                  type="button"
                  onClick={() => handleAddSingleItem(itemInput)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition cursor-pointer shrink-0"
                  id="add-item-btn"
                >
                  Tilføj vare
                </button>
              </div>
              {entryError && (
                <p className="text-xs text-red-600 font-medium flex items-center gap-1 pt-0.5 animate-fadeIn">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {entryError}
                </p>
              )}
            </div>

            {/* Pending List table preview */}
            {pendingItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-700">Tilføjede varer på listen ({pendingItems.length})</span>
                  <button
                    onClick={() => setPendingItems([])}
                    className="text-[11px] text-red-600 hover:underline font-semibold cursor-pointer"
                  >
                    Ryd hele listen
                  </button>
                </div>

                <div className="border border-gray-100 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-gray-400 font-semibold sticky top-0">
                      <tr>
                        <th className="p-3">Varenr.</th>
                        <th className="p-3">Beskrivelse / Status</th>
                        <th className="p-3">Placering</th>
                        <th className="p-3">Basisenhed</th>
                        <th className="p-3 text-right">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pendingItems.map((item, idx) => (
                        <tr key={`${item.itemNumber}-${idx}`} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-medium text-gray-700">{item.itemNumber}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {item.status === "loading" && (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                                  <span className="text-gray-400 text-xs italic">Søger i systemet...</span>
                                </>
                              )}
                              {item.status === "found" && (
                                <>
                                  <span className="text-gray-900 font-medium">{item.description}</span>
                                  {item.blocked && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      SPÆRRET
                                    </span>
                                  )}
                                </>
                              )}
                              {item.status === "not_found" && (
                                <>
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                  <span className="text-amber-700 font-semibold">Vare ikke fundet</span>
                                </>
                              )}
                              {item.status === "error" && (
                                <>
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                                  <span className="text-red-700 font-semibold">Fejl under indlæsning</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-gray-500">{item.placementNumber || "—"}</td>
                          <td className="p-3 text-gray-500">{item.baseUnit || "STK"}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleRemovePendingItem(idx)}
                              className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition cursor-pointer"
                              title="Fjern fra listen"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Launch Workspace block */}
            <div className="border-t border-gray-100 pt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleGenerateWhatsappMessage}
                disabled={pendingItems.length === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-40 cursor-pointer shadow-2xs"
                id="generate-whatsapp-message-btn"
              >
                <MessageSquare className="h-4.5 w-4.5" />
                Generer WhatsApp besked
              </button>

              <button
                onClick={handleGenerateWorkspace}
                disabled={pendingItems.length === 0 || pendingItems.some(item => item.status === "loading")}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition disabled:opacity-40 cursor-pointer shadow-2xs"
                id="generate-counting-workspace-btn"
              >
                <Plus className="h-4 w-4" />
                Generer optællings-workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab Content: Active Workspace View */}
      {currentWorkspace && (
        <div className="space-y-6">
          {/* A. Status auto save bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize ${
                currentWorkspace.status === "completed"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : currentWorkspace.status === "in-progress"
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-slate-50 text-slate-700 border-slate-100"
              }`}>
                {currentWorkspace.status === "completed" ? "Udført" : currentWorkspace.status === "in-progress" ? "I gang" : "Kladde"}
              </span>

              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                <span>Oprettet: {new Date(currentWorkspace.createdAt).toLocaleString("da-DK")}</span>
              </div>

              {saveStatus[currentWorkspace.id] === "saving" && (
                <span className="text-xs text-gray-400 italic flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                  Gemmer tælleliste lokalt...
                </span>
              )}
              {saveStatus[currentWorkspace.id] === "saved" && !currentWorkspace.isDirty && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded flex items-center gap-0.5">
                  <Check className="h-3 w-3 text-emerald-500" />
                  Gemt i browser kl. {saveTime[currentWorkspace.id] || "lige nu"}
                </span>
              )}
              {currentWorkspace.isDirty && (
                <button
                  onClick={() => handleManualSave(currentWorkspace)}
                  className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Klik for at gemme med det samme"
                >
                  <Save className="h-3 w-3" />
                  Gem ændringer nu (Auto-gemmer hvert minut)
                </button>
              )}
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleUpdateSystemValues(currentWorkspace)}
                disabled={refreshingSystemId !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
                title="Søg i sheets og opdater systemlagertal"
                id="update-system-numbers-btn"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingSystemId === currentWorkspace.id ? "animate-spin" : ""}`} />
                Opdater systemtal
              </button>

              <button
                onClick={() => handleResetAllCounts(currentWorkspace)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-100 hover:bg-red-50 text-red-600 text-xs font-semibold rounded-lg transition cursor-pointer"
                title="Nulstil alle indtastninger"
                id="reset-all-counts-btn"
              >
                Nulstil tal
              </button>
            </div>
          </div>

          {/* B. Stats row */}
          {workspaceStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs space-y-1">
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Fremdrift</p>
                <p className="text-lg font-bold text-gray-800">
                  {workspaceStats.fullyCounted} <span className="text-xs text-gray-400 font-normal">/ {workspaceStats.totalItems} varer</span>
                </p>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-brand h-full rounded-full transition-all duration-300"
                    style={{ width: `${(workspaceStats.fullyCounted / workspaceStats.totalItems) * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs space-y-1">
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Afvigelser fundet</p>
                <p className="text-lg font-bold text-gray-800">
                  {workspaceStats.differencesCount} <span className="text-xs text-gray-400 font-normal">rækker</span>
                </p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 font-semibold">
                  <span className="text-emerald-600">+{workspaceStats.positiveDiffs} overskud</span> •{" "}
                  <span className="text-red-600">-{workspaceStats.negativeDiffs} underskud</span>
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs space-y-1">
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Absolut Difference</p>
                <p className="text-lg font-bold text-orange-600">
                  {workspaceStats.totalAbsQtyDiff.toLocaleString("da-DK")}{" "}
                  <span className="text-xs text-gray-400 font-normal">enheder</span>
                </p>
                <p className="text-[10px] text-gray-400 font-medium">Samlet afvigelsesmængde</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs space-y-1">
                <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Mangler tælling</p>
                <p className="text-lg font-bold text-amber-600">
                  {workspaceStats.totalUncountedFields}{" "}
                  <span className="text-xs text-gray-400 font-normal">felter</span>
                </p>
                <p className="text-[10px] text-gray-400 font-medium">Skal tælles i lagerlokationerne</p>
              </div>
            </div>
          )}

          {/* C. Dynamic Search / Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-3xs flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-1 flex-col sm:flex-row gap-3 w-full">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-gray-400 absolute left-3.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søg på varenr. eller beskrivelse..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-100 rounded-lg text-xs focus:outline-hidden focus:border-brand"
                  id="active-workspace-search-input"
                />
              </div>

              <div className="flex gap-2 shrink-0">
                <div className="relative">
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as any)}
                    className="bg-white border border-gray-100 rounded-lg px-3.5 py-2 pr-8 text-xs font-medium focus:outline-hidden appearance-none cursor-pointer"
                    id="filter-mode-select"
                  >
                    <option value="all">Vis alle</option>
                    <option value="uncounted">Mangler tælling</option>
                    <option value="differences">Kun afvigelser</option>
                    <option value="negative">Underskud (negativ diff)</option>
                    <option value="positive">Overskud (positiv diff)</option>
                  </select>
                  <Filter className="h-3.5 w-3.5 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="bg-white border border-gray-100 rounded-lg px-3.5 py-2 pr-8 text-xs font-medium focus:outline-hidden appearance-none cursor-pointer"
                    id="filter-location-select"
                  >
                    <option value="all">Alle lokationer</option>
                    {CANONICAL_LOCATIONS.map(l => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                  <Filter className="h-3.5 w-3.5 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Quick Add item inline */}
            <div className="flex gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 border-gray-50 pt-3 md:pt-0">
              <input
                type="text"
                value={activeWorkspaceItemInput}
                onChange={(e) => setActiveWorkspaceItemInput(e.target.value)}
                placeholder="Tilføj varenr. (f.eks. 00102)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddItemToActiveWorkspace(currentWorkspace);
                  }
                }}
                className="border border-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono"
                id="inline-add-item-input"
              />
              <button
                onClick={() => handleAddItemToActiveWorkspace(currentWorkspace)}
                disabled={isSearchingActiveWorkspaceItem}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition cursor-pointer shrink-0"
                id="inline-add-item-btn"
              >
                {isSearchingActiveWorkspaceItem ? "Søger..." : "+ Tilføj"}
              </button>
            </div>
          </div>
          {activeWorkspaceItemError && (
            <p className="text-xs text-red-600 bg-red-50 px-4 py-2 rounded-lg animate-fadeIn font-semibold" id="inline-add-item-error">
              {activeWorkspaceItemError}
            </p>
          )}

          {/* D. Main Grouped Table (Modern, responsive grid layout) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  {/* Row 1: Location Headers */}
                  <tr className="bg-slate-900 text-white text-center font-bold uppercase tracking-wider">
                    <th colSpan={3} className="p-3 text-left border-r border-slate-800">
                      Varedetaljer (Master)
                    </th>
                    {CANONICAL_LOCATIONS.map((loc) => {
                      const isLocationFiltered = filterLocation === "all" || filterLocation === loc.id;
                      if (!isLocationFiltered) return null;
                      const colors = LOCATION_COLORS[loc.id] || { headerBg: "bg-slate-800", border: "border-slate-700" };
                      return (
                        <th key={loc.id} colSpan={3} className={`p-2 border-r ${colors.border} ${colors.headerBg} text-[10px] tracking-wide`}>
                          {loc.label}
                        </th>
                      );
                    })}
                    <th className="p-3 text-right">Række</th>
                  </tr>
                  
                  {/* Row 2: Sub Headers */}
                  <tr className="bg-slate-50 text-gray-500 font-bold border-b border-gray-200">
                    <th className="p-3 font-mono text-[10px] tracking-wide sticky left-0 bg-slate-50 z-10 w-24">Varenr.</th>
                    <th className="p-3 tracking-wide min-w-[160px]">Beskrivelse</th>
                    <th className="p-3 text-center border-r border-gray-200">Enh.</th>
                    
                    {CANONICAL_LOCATIONS.map((loc) => {
                      const isLocationFiltered = filterLocation === "all" || filterLocation === loc.id;
                      if (!isLocationFiltered) return null;
                      const colors = LOCATION_COLORS[loc.id] || { border: "border-gray-200" };
                      return (
                        <React.Fragment key={loc.id}>
                          <th className="p-2 text-center text-[10px] bg-slate-50/50">Sys</th>
                          <th className="p-2 text-center text-[10px] bg-slate-100/70 border-x border-gray-200">Optalt</th>
                          <th className={`p-2 text-center text-[10px] bg-slate-50/50 border-r-2 ${colors.border}`}>Forskel</th>
                        </React.Fragment>
                      );
                    })}
                    <th className="p-3 text-right">Slet</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {filteredWorkspaceItems.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="p-12 text-center text-gray-400 italic">
                        Ingen varer matchede de valgte søgefiltre eller rækkekriterier.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkspaceItems.map((item, rowIdx) => (
                      <tr key={item.itemNumber} className="hover:bg-slate-50/40">
                        {/* 1. Item number (Sticky column) */}
                        <td className="p-3 font-mono font-bold text-gray-900 bg-white sticky left-0 border-r border-gray-50 shadow-[2px_0_5px_rgba(0,0,0,0.01)] w-24">
                          <div className="flex items-center gap-1.5">
                            {item.itemNumber}
                            {item.blocked && (
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Blokeret" />
                            )}
                          </div>
                        </td>

                        {/* 2. Description */}
                        <td className="p-3 font-normal max-w-[200px] truncate" title={item.description}>
                          {item.description}
                        </td>

                        {/* 3. Base unit */}
                        <td className="p-3 text-center text-gray-400 font-semibold border-r border-gray-100">{item.baseUnit || "STK"}</td>

                        {/* 4. Dynamic location columns */}
                        {CANONICAL_LOCATIONS.map((loc, locIdx) => {
                          const isLocationFiltered = filterLocation === "all" || filterLocation === loc.id;
                          if (!isLocationFiltered) return null;

                          const locEntry = item.locations.find((l) => l.locationId === loc.id);
                          const systemQty = locEntry ? locEntry.systemQuantity : null;
                          const countedQty = locEntry ? locEntry.countedQuantity : null;
                          const difference = locEntry ? locEntry.difference : null;

                          const countInputValue = countedQty !== null ? String(countedQty).replace(/\./g, ",") : "";
                          const systemInputValue = systemQty !== null ? String(systemQty).replace(/\./g, ",") : "";

                          const colors = LOCATION_COLORS[loc.id] || { bg: "bg-slate-50/10", border: "border-gray-100" };

                          return (
                            <React.Fragment key={loc.id}>
                              {/* System stock (Manually editable input field) */}
                              <td className={`p-1.5 text-center ${colors.bg}`}>
                                <input
                                  id={`input-sys-${rowIdx}-${locIdx}`}
                                  type="text"
                                  value={systemInputValue}
                                  onChange={(e) =>
                                    handleSystemValueChange(
                                      currentWorkspace,
                                      item.itemNumber,
                                      loc.id,
                                      e.target.value
                                    )
                                  }
                                  placeholder="—"
                                  className="w-16 bg-white border border-gray-200 hover:border-gray-300 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-hidden rounded text-center py-1 text-xs font-mono text-gray-500 focus:text-gray-900 transition"
                                />
                              </td>
                              
                              {/* Counted quantity input field */}
                              <td className={`p-1.5 text-center ${colors.bg} border-x border-gray-100`}>
                                <input
                                  id={`input-count-${rowIdx}-${locIdx}`}
                                  type="text"
                                  value={countInputValue}
                                  onChange={(e) =>
                                    handleCountValueChange(
                                      currentWorkspace,
                                      item.itemNumber,
                                      loc.id,
                                      e.target.value
                                    )
                                  }
                                  onKeyDown={(e) =>
                                    handleTableKeyDown(e, rowIdx, locIdx, CANONICAL_LOCATIONS.length)
                                  }
                                  placeholder="—"
                                  className="w-16 bg-white border border-gray-200 hover:border-gray-300 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-hidden rounded text-center py-1 text-xs font-mono font-bold text-gray-900"
                                />
                              </td>

                              {/* Calculated difference display */}
                              <td className={`p-2 text-center font-mono ${colors.bg} border-r-2 ${colors.border}`}>
                                {difference === null ? (
                                  <span className="text-gray-300">—</span>
                                ) : difference === 0 ? (
                                  <span className="text-gray-400 font-semibold">0</span>
                                ) : difference < 0 ? (
                                  <span className="text-red-600 font-bold bg-red-50/90 px-1.5 py-0.5 rounded-sm">
                                    {formatDanishVal(difference)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-bold bg-emerald-50/90 px-1.5 py-0.5 rounded-sm">
                                    +{formatDanishVal(difference)}
                                  </span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}

                        {/* 6. Row Action: Delete */}
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleRemoveItemFromActiveWorkspace(currentWorkspace, item.itemNumber)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition cursor-pointer"
                            title="Fjern række"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* E. Large Primary Workspace action buttons */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-gray-400">
              {currentWorkspace.isDirty ? (
                <span className="flex items-center gap-1.5 text-amber-600 font-semibold animate-pulse">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Der er indtastet nye tal siden sidste PDF generation. Eksporter en ny PDF for at afslutte.
                </span>
              ) : currentWorkspace.pdfSaved ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  PDF rapporten blev eksporteret kl. {currentWorkspace.pdfSavedAt ? new Date(currentWorkspace.pdfSavedAt).toLocaleTimeString("da-DK") : "tidligere"}.
                </span>
              ) : (
                <span>Alle tællinger udføres i realtid. Listen er klar til revisor-godkendt PDF-eksport.</span>
              )}
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <button
                onClick={() => handleGenerateActiveWorkspaceWhatsappMessage(currentWorkspace)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-2xs"
                id="active-whatsapp-message-btn"
              >
                <MessageSquare className="h-4 w-4" />
                Generer WhatsApp besked
              </button>

              <button
                onClick={() => setConfirmDeleteId(currentWorkspace.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition cursor-pointer"
                id="delete-workspace-btn"
              >
                <Trash2 className="h-4 w-4" />
                Slet liste
              </button>

              <button
                onClick={() => handleExportPdfTrigger(currentWorkspace)}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition disabled:opacity-50 cursor-pointer shadow-2xs"
                id="save-pdf-btn"
              >
                {isExportingPdf ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Genererer PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Gem optælling som PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION DIALOGS / MODALS --- */}

      {/* A. Delete Workspace Confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm w-full shadow-lg space-y-4 animate-scaleUp">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Slet tælleliste?
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Er du sikker på, at du vil slette denne optælling fra systemet? 
              Uafsluttede data vil gå tabt og kan ikke genskabes.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Annuller
              </button>
              <button
                onClick={handleDeleteWorkspaceConfirmed}
                className="px-3.5 py-2 bg-red-600 text-white hover:bg-red-700 text-xs font-bold rounded-lg cursor-pointer"
                id="confirm-delete-workspace-btn"
              >
                Slet permanent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. Clear All Local Data Confirmation */}
      {confirmClearLocal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm w-full shadow-lg space-y-4 animate-scaleUp">
            <h3 className="text-sm font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Nulstil ALLE tællelister?
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Dette vil slette absolut alle uafsluttede og historiske tællelister fra din browsers IndexedDB. 
              Dine Google Sheets data påvirkes ikke. Handlingen kan ikke fortrydes.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmClearLocal(false)}
                className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Annuller
              </button>
              <button
                onClick={handleClearAllLocalData}
                className="px-3.5 py-2 bg-red-600 text-white hover:bg-red-700 text-xs font-bold rounded-lg cursor-pointer"
                id="confirm-clear-local-data-btn"
              >
                Slet alt lokalt data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. Unsaved Close dialog */}
      {confirmUnsavedClose && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm w-full shadow-lg space-y-4 animate-scaleUp">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Listen er ikke gemt
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Optællingen er ændret, men du har endnu ikke eksporteret den endelige PDF-rapport. 
              Vil du beholde listen som kladde eller lukke den alligevel?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  const ws = workspaces.find(w => w.id === confirmUnsavedClose.id);
                  if (ws) executePdfExport(ws);
                  setConfirmUnsavedClose(null);
                }}
                className="w-full py-2 bg-brand text-white hover:bg-brand-dark text-xs font-bold rounded-lg text-center cursor-pointer"
              >
                Gem som PDF og luk
              </button>
              <button
                onClick={() => {
                  // Keep as draft and just switch view
                  setActiveTab(confirmUnsavedClose.nextTab);
                  setConfirmUnsavedClose(null);
                }}
                className="w-full py-2 border border-gray-200 hover:bg-gray-50 text-xs font-semibold rounded-lg text-center cursor-pointer"
              >
                Behold som kladde
              </button>
              <button
                onClick={() => {
                  // Delete without save
                  deleteWorkspace(confirmUnsavedClose.id).then(() => {
                    setWorkspaces(prev => prev.filter(w => w.id !== confirmUnsavedClose.id));
                    setActiveTab(confirmUnsavedClose.nextTab);
                    setConfirmUnsavedClose(null);
                  });
                }}
                className="w-full py-2 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg text-center cursor-pointer"
              >
                Slet uden at gemme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. Export uncounted field warning dialog */}
      {confirmExportUncounted && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm w-full shadow-lg space-y-4 animate-scaleUp">
            <h3 className="text-sm font-bold text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Ufærdige tællefelter fundet
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Nogle varenumre eller specifikke lokationsfelter er endnu ikke optalt. 
              Uoptalte værdier vil blive vist som blanke/streger (<span className="font-mono">—</span>) i den færdige PDF.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmExportUncounted(null)}
                className="px-3.5 py-2 border border-gray-200 hover:bg-gray-50 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Gå tilbage og udfyld
              </button>
              <button
                onClick={() => executePdfExport(confirmExportUncounted.ws)}
                className="px-3.5 py-2 bg-brand text-white hover:bg-brand-dark text-xs font-bold rounded-lg cursor-pointer"
                id="confirm-export-anyway-btn"
              >
                Gem PDF alligevel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E. WhatsApp Message Modal */}
      {whatsappModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg w-full shadow-lg space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
                Genereret WhatsApp besked
              </h3>
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Kopier teksten nedenfor eller klik på knappen for at sende direkte via WhatsApp.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-xs whitespace-pre-wrap text-gray-800 max-h-60 overflow-y-auto">
              {whatsappMessageText}
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(whatsappMessageText);
                    setCopiedSuccess(true);
                    setTimeout(() => setCopiedSuccess(false), 2000);
                  } catch (err) {
                    console.error("Clipboard copy failed:", err);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-200 hover:bg-gray-50 text-xs font-semibold rounded-lg cursor-pointer transition"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    Kopieret!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-gray-500" />
                    Kopier besked
                  </>
                )}
              </button>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessageText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow-2xs"
              >
                <ExternalLink className="h-4 w-4" />
                Send via WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
