import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import Shell from "./shared/components/layout/Shell.tsx";
import DashboardHome from "./shared/components/layout/DashboardHome.tsx";
import SalesFilterBar from "./shared/components/filters/SalesFilterBar.tsx";
import SalesOverview from "./modules/sales/components/SalesOverview.tsx";
import SalesWithoutProfit from "./modules/sales/components/SalesWithoutProfit.tsx";
import SalesAlertsAndOpportunities from "./modules/sales/components/SalesAlertsAndOpportunities.tsx";
import DatabaseManagement from "./modules/database/components/DatabaseManagement.tsx";
import { SalesRawRow, ImportMetadata, SalesFilter } from "./shared/types.ts";
import { getComparisonDate } from "./modules/sales/calculations.ts";
import { formatDate } from "./shared/utils/format.ts";
import { RefreshCw, AlertCircle } from "lucide-react";

export default function App() {
  const [activeModule, setActiveModule] = useState<string>("dashboard");
  const [salesTab, setSalesTab] = useState<"overview" | "sales-without-profit" | "sales-alerts">("overview");

  // Global database files state
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [importHistory, setImportHistory] = useState<ImportMetadata[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loaded raw rows cache (Date -> Row list)
  const [rowsCache, setRowsCache] = useState<Record<string, SalesRawRow[]>>({});
  const [loadingRows, setLoadingRows] = useState(false);

  // States for 4-date comparison
  const [compareFourDatesEnabled, setCompareFourDatesEnabled] = useState(false);
  const [compareDates, setCompareDates] = useState<string[]>([]);

  // Active filters for Sales module
  const [filter, setFilter] = useState<SalesFilter>({
    businessDate: "",
    startDate: null,
    endDate: null,
    location: [],
    documentType: [],
    customerQuery: "",
    productQuery: "",
  });

  // Load available dates & import logs on mount
  useEffect(() => {
    loadDMSMetaData();
  }, []);

  const loadDMSMetaData = async (newActiveDate?: string) => {
    setLoadingDates(true);
    setError(null);
    try {
      // 1. Fetch available worksheet dates
      const datesRes = await fetch("/api/all-dates");
      if (!datesRes.ok) throw new Error("Kunne ikke hente aktive datakilder fra server");
      const datesData: string[] = await datesRes.json();
      setAvailableDates(datesData);

      // 2. Fetch import log logs
      const historyRes = await fetch("/api/imports");
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setImportHistory(historyData);
      }

      // If dates are available, set active date
      if (datesData.length > 0) {
        const targetDate = (newActiveDate && datesData.includes(newActiveDate))
          ? newActiveDate
          : datesData[0];

        setFilter((prev) => ({
          ...prev,
          businessDate: targetDate,
        }));

        setCompareDates([
          datesData[0] || "",
          datesData[1] || "",
          datesData[2] || "",
          datesData[3] || ""
        ]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingDates(false);
    }
  };

  // Cache/Load worksheets as selected or on background
  useEffect(() => {
    if (!filter.businessDate) return;
    
    // We want to load the active business date, and its comparison dates
    const compPrevDate = getComparisonDate(filter.businessDate, availableDates, "previous");
    const compWeekAgoDate = getComparisonDate(filter.businessDate, availableDates, "week_ago");

    const datesToFetch = [filter.businessDate];
    if (compPrevDate) datesToFetch.push(compPrevDate);
    if (compWeekAgoDate) datesToFetch.push(compWeekAgoDate);

    // If 4-date comparison is enabled, prefetch those dates too
    if (compareFourDatesEnabled) {
      compareDates.forEach((d) => {
        if (d && !datesToFetch.includes(d)) {
          datesToFetch.push(d);
        }
      });
    }

    // Also fetch the last 10 worksheets in background for trend charts
    const chartDates = [...availableDates].sort((a, b) => b.localeCompare(a)).slice(0, 10);
    chartDates.forEach((d) => {
      if (!datesToFetch.includes(d)) {
        datesToFetch.push(d);
      }
    });

    const fetchNeededDates = async () => {
      const datesToGet = datesToFetch.filter((d) => !rowsCache[d]);
      if (datesToGet.length === 0) return;

      setLoadingRows(true);
      try {
        const updatedCache = { ...rowsCache };
        await Promise.all(
          datesToGet.map(async (date) => {
            const res = await fetch(`/api/data/${date}`);
            if (res.ok) {
              const rows = await res.json();
              updatedCache[date] = rows;
            }
          })
        );
        setRowsCache(updatedCache);
      } catch (e) {
        console.error("Failed to load worksheets rows:", e);
      } finally {
        setLoadingRows(false);
      }
    };

    fetchNeededDates();
  }, [filter.businessDate, availableDates, compareFourDatesEnabled, compareDates]);

  // Extract unique locations and docTypes from CURRENT rows for filter options
  const currentActiveRows = useMemo(() => {
    return rowsCache[filter.businessDate] || [];
  }, [rowsCache, filter.businessDate]);

  const filterOptions = useMemo(() => {
    const locations = new Set<string>();
    const documentTypes = new Set<string>();

    currentActiveRows.forEach((row) => {
      if (row.locationCode) locations.add(row.locationCode);
      if (row.documentType) documentTypes.add(row.documentType);
    });

    return {
      locations: Array.from(locations).sort(),
      documentTypes: Array.from(documentTypes).sort(),
    };
  }, [currentActiveRows]);

  // Dynamically Filter raw rows for dashboard widgets based on active filter bar
  const filteredActiveRows = useMemo(() => {
    let result = [...currentActiveRows];

    // Filter by Location
    if (filter.location.length > 0) {
      result = result.filter((r) => filter.location.includes(r.locationCode));
    }

    // Filter by Document Type
    if (filter.documentType.length > 0) {
      result = result.filter((r) => filter.documentType.includes(r.documentType));
    }

    // Filter by Customer search string
    if (filter.customerQuery) {
      const cq = filter.customerQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.customerName.toLowerCase().includes(cq) ||
          r.customerNumber.toLowerCase().includes(cq)
      );
    }

    // Filter by Product search string
    if (filter.productQuery) {
      const pq = filter.productQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.description.toLowerCase().includes(pq) ||
          r.itemNumber.toLowerCase().includes(pq)
      );
    }

    return result;
  }, [currentActiveRows, filter]);

  // Compute comparison rows
  const comparisonDate = useMemo(() => {
    return getComparisonDate(filter.businessDate, availableDates, "previous");
  }, [filter.businessDate, availableDates]);

  const comparisonRows = useMemo(() => {
    if (!comparisonDate) return [];
    return rowsCache[comparisonDate] || [];
  }, [rowsCache, comparisonDate]);

  const handleClearFilters = () => {
    setFilter((prev) => ({
      ...prev,
      location: [],
      documentType: [],
      customerQuery: "",
      productQuery: "",
    }));
  };

  const navigateToModule = (mod: string) => {
    setActiveModule(mod);
    if (mod === "sales") {
      setSalesTab("overview");
    }
  };

  return (
    <Shell activeModule={activeModule} setActiveModule={navigateToModule}>
      {loadingDates ? (
        <div className="flex flex-col items-center justify-center h-96 text-gray-500">
          <RefreshCw className="h-10 w-10 text-blue-600 animate-spin mb-4" />
          <p className="text-sm font-semibold">Starter Daily Management System...</p>
        </div>
      ) : error ? (
        <div className="max-w-md mx-auto mt-12 border border-red-200 bg-red-50 text-red-800 rounded-xl p-5 shadow-xs text-center">
          <AlertCircle className="h-10 w-10 text-red-600 mx-auto mb-3" />
          <h3 className="font-bold">Systemfejl</h3>
          <p className="text-xs mt-1 text-gray-600">{error}</p>
          <button
            onClick={loadDMSMetaData}
            className="mt-4 px-3.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer"
          >
            Prøv igen
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Dashboard Module */}
          {activeModule === "dashboard" && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardHome
                importHistory={importHistory}
                latestWorksheetDate={availableDates[0] || ""}
                latestWorksheetRows={rowsCache[availableDates[0]] || []}
                onNavigate={navigateToModule}
              />
            </motion.div>
          )}

          {/* Sales Module */}
          {activeModule === "sales" && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Sales Module Header with Sub Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">Salg & Profitabilitet (Sales)</h1>
                  <p className="text-sm text-gray-400 mt-0.5">Vis og overvåg dækningsgrader, top lister og profitafvigelser.</p>
                </div>

                {/* Tab buttons */}
                <div className="flex bg-gray-100 p-1 rounded-lg self-start sm:self-center flex-wrap gap-1">
                  <button
                    onClick={() => setSalesTab("overview")}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      salesTab === "overview"
                        ? "bg-white text-gray-900 shadow-2xs"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Executive Overview
                  </button>
                  <button
                    onClick={() => setSalesTab("sales-without-profit")}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      salesTab === "sales-without-profit"
                        ? "bg-white text-red-600 shadow-2xs"
                        : "text-gray-500 hover:text-red-500"
                    }`}
                  >
                    Salg uden fortjeneste
                  </button>
                  <button
                    onClick={() => setSalesTab("sales-alerts")}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      salesTab === "sales-alerts"
                        ? "bg-white text-brand shadow-2xs"
                        : "text-gray-500 hover:text-brand"
                    }`}
                  >
                    Sales Alerts & Opportunities
                  </button>
                </div>
              </div>

              {/* Filter bar (Shared between Sales sub tabs, Section 16) */}
              <SalesFilterBar
                filter={filter}
                setFilter={setFilter}
                availableDates={availableDates}
                locations={filterOptions.locations}
                documentTypes={filterOptions.documentTypes}
                onClearFilters={handleClearFilters}
                compareFourDatesEnabled={compareFourDatesEnabled}
                setCompareFourDatesEnabled={setCompareFourDatesEnabled}
                compareDates={compareDates}
                setCompareDates={setCompareDates}
              />

              {loadingRows && currentActiveRows.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  Henter dagsdata fane...
                </div>
              ) : (
                <>
                  {salesTab === "overview" && (
                    <SalesOverview
                      currentRows={filteredActiveRows}
                      comparisonRows={comparisonRows}
                      comparisonDateLabel={comparisonDate ? formatDate(comparisonDate) : "Ingen dagsdata"}
                      allHistoricalRows={rowsCache}
                      availableDates={availableDates}
                      compareFourDatesEnabled={compareFourDatesEnabled}
                      compareDates={compareDates}
                    />
                  )}

                  {salesTab === "sales-without-profit" && (
                    <SalesWithoutProfit
                      currentRows={filteredActiveRows}
                      filterLocation={filter.location}
                    />
                  )}

                  {salesTab === "sales-alerts" && (
                    <SalesAlertsAndOpportunities
                      filter={filter}
                    />
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* Database Module */}
          {activeModule === "database" && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DatabaseManagement
                onImportSuccess={(newDate) => {
                  loadDMSMetaData(newDate);
                  setActiveModule("sales");
                }}
              />
            </motion.div>
          )}
        </div>
      )}
    </Shell>
  );
}
