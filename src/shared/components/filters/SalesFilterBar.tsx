import React, { useState, useEffect, useRef } from "react";
import { Filter, Calendar, MapPin, FileText, Search, X, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { SalesFilter } from "../../../shared/types.js";
import { formatDate, getWeekdayLabel } from "../../../shared/utils/format.js";

const MONTH_NAMES = [
  { da: "Januar", tr: "Ocak" },
  { da: "Februar", tr: "Şubat" },
  { da: "Marts", tr: "Mart" },
  { da: "April", tr: "Nisan" },
  { da: "Maj", tr: "Mayıs" },
  { da: "Juni", tr: "Haziran" },
  { da: "Juli", tr: "Temmuz" },
  { da: "August", tr: "Ağustos" },
  { da: "September", tr: "Eylül" },
  { da: "Oktober", tr: "Ekim" },
  { da: "November", tr: "Kasım" },
  { da: "December", tr: "Aralık" }
];

function getDaysInMonth(year: number, month: number) {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  
  let startDay = date.getDay();
  // Adjust Monday as 0, Sunday as 6
  startDay = startDay === 0 ? 6 : startDay - 1;
  
  const prevMonthDate = new Date(year, month, 0);
  const prevMonthDays = prevMonthDate.getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, prevMonthDays - i));
  }
  
  const numDays = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= numDays; i++) {
    days.push(new Date(year, month, i));
  }
  
  const totalCells = 42;
  const nextMonthPadding = totalCells - days.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }
  
  return days;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface SalesFilterBarProps {
  filter: SalesFilter;
  setFilter: React.Dispatch<React.SetStateAction<SalesFilter>>;
  availableDates: string[];
  locations: string[];
  documentTypes: string[];
  onClearFilters: () => void;
  compareFourDatesEnabled: boolean;
  setCompareFourDatesEnabled: (val: boolean) => void;
  compareDates: string[];
  setCompareDates: (dates: string[]) => void;
}

export default function SalesFilterBar({
  filter,
  setFilter,
  availableDates,
  locations,
  documentTypes,
  onClearFilters,
  compareFourDatesEnabled,
  setCompareFourDatesEnabled,
  compareDates,
  setCompareDates,
}: SalesFilterBarProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [campaignDates, setCampaignDates] = useState<string[]>([]);

  // Fetch campaign dates from imports list
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await fetch("/api/imports");
        if (res.ok) {
          const history = await res.json();
          const dates = history
            .filter((item: any) => item.importStatus === "success" && item.tilbudUge)
            .map((item: any) => item.businessDate);
          setCampaignDates(dates);
        }
      } catch (e) {
        console.error("Failed to load campaign dates inside filter bar:", e);
      }
    };
    fetchCampaigns();
  }, [availableDates]);

  const activeDateObj = filter.businessDate ? new Date(filter.businessDate) : new Date();
  const [currentMonth, setCurrentMonth] = useState({
    year: isNaN(activeDateObj.getTime()) ? new Date().getFullYear() : activeDateObj.getFullYear(),
    month: isNaN(activeDateObj.getTime()) ? new Date().getMonth() : activeDateObj.getMonth(),
  });

  // Sync calendar view month when selected date changes from outside
  useEffect(() => {
    if (filter.businessDate) {
      const d = new Date(filter.businessDate);
      if (!isNaN(d.getTime())) {
        setCurrentMonth({
          year: d.getFullYear(),
          month: d.getMonth(),
        });
      }
    }
  }, [filter.businessDate]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDateChange = (date: string) => {
    setFilter((prev) => ({
      ...prev,
      businessDate: date,
    }));
  };

  const toggleLocation = (loc: string) => {
    setFilter((prev) => {
      const isSelected = prev.location.includes(loc);
      const newLocs = isSelected
        ? prev.location.filter((l) => l !== loc)
        : [...prev.location, loc];
      return { ...prev, location: newLocs };
    });
  };

  const toggleDocType = (doc: string) => {
    setFilter((prev) => {
      const isSelected = prev.documentType.includes(doc);
      const newDocs = isSelected
        ? prev.documentType.filter((d) => d !== doc)
        : [...prev.documentType, doc];
      return { ...prev, documentType: newDocs };
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-4">
      {/* Primary Row: Date Selection and Main Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Date worksheets & Compare 4 dates toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
          <div className="flex items-center gap-2">
            <Calendar className="h-4.5 w-4.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Forretningsfane:</span>
            
            <div className="relative" ref={calendarRef}>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-[240px] justify-between shadow-xs transition"
              >
                <div className="flex items-center gap-1.5 text-left">
                  <span className="text-gray-900 font-bold">
                    {formatDate(filter.businessDate)}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    {getWeekdayLabel(filter.businessDate)}
                  </span>
                  {filter.businessDate === availableDates[0] && (
                    <span className="ml-1 bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      Seneste
                    </span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              
              {isCalendarOpen && (
                <div className="absolute left-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-76 animate-in fade-in duration-100">
                  {/* Month/Year Selector Header */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentMonth((prev) => {
                          const newMonth = prev.month === 0 ? 11 : prev.month - 1;
                          const newYear = prev.month === 0 ? prev.year - 1 : prev.year;
                          return { year: newYear, month: newMonth };
                        });
                      }}
                      className="p-1 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-xs font-bold text-gray-800">
                      {MONTH_NAMES[currentMonth.month].da} ({MONTH_NAMES[currentMonth.month].tr}) {currentMonth.year}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentMonth((prev) => {
                          const newMonth = prev.month === 11 ? 0 : prev.month + 1;
                          const newYear = prev.month === 11 ? prev.year + 1 : prev.year;
                          return { year: newYear, month: newMonth };
                        });
                      }}
                      className="p-1 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 cursor-pointer"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Weekdays Row */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((day) => (
                      <span key={day} className="text-[10px] font-bold text-gray-400 uppercase">
                        {day}
                      </span>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(currentMonth.year, currentMonth.month).map((dayDate, idx) => {
                      const dateStr = formatLocalDate(dayDate);
                      const hasData = availableDates.includes(dateStr);
                      const isSelected = filter.businessDate === dateStr;
                      const isCurrentMonth = dayDate.getMonth() === currentMonth.month;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            handleDateChange(dateStr);
                            setIsCalendarOpen(false);
                          }}
                          className={`
                            relative text-xs h-8 w-8 rounded-md flex items-center justify-center transition-all cursor-pointer border
                            ${!isCurrentMonth ? "opacity-30" : ""}
                            ${
                              isSelected
                                ? hasData
                                  ? "bg-emerald-600 text-white font-bold border-emerald-700 shadow-xs ring-2 ring-emerald-500 ring-offset-1"
                                  : "bg-rose-600 text-white font-bold border-rose-700 shadow-xs ring-2 ring-rose-500 ring-offset-1"
                                : hasData
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold hover:bg-emerald-200"
                                : "bg-rose-50/50 text-rose-600 border-rose-100 hover:bg-rose-100/70"
                            }
                          `}
                          title={
                            hasData
                              ? `${formatDate(dateStr)} - Aktiv dagsdata${campaignDates.includes(dateStr) ? " (Kampagneuge)" : ""}`
                              : `${formatDate(dateStr)} - Ingen data`
                          }
                        >
                          <span>{dayDate.getDate()}</span>
                          {campaignDates.includes(dateStr) && (
                            <span className="absolute top-0.5 right-0.5 text-[7px]" title="Kampagneuge / Tilbud Uge">
                              ⭐
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend Help Indicator */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-y-1.5 text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <span>Med data</span>
                    </div>
                    {campaignDates.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span>⭐</span>
                        <span>Kampagne</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                      <span>Uden data</span>
                    </div>
                    <div className="text-[9px] text-gray-400 italic">
                      {availableDates.length} aktive dage
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4-Date Comparison Toggle */}
          <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-gray-100 pt-2 sm:pt-0 sm:pl-4">
            <button
              type="button"
              onClick={() => setCompareFourDatesEnabled(!compareFourDatesEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                compareFourDatesEnabled ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  compareFourDatesEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-700">Sammenlign 4 datoer</span>
              <span className="text-[10px] text-gray-400">4 Tarih Karşılaştırma</span>
            </div>
          </div>
        </div>

        {/* Clear Filters button */}
        {(filter.location.length > 0 ||
          filter.documentType.length > 0 ||
          filter.customerQuery !== "" ||
          filter.productQuery !== "") && (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition cursor-pointer self-start md:self-auto"
          >
            <X className="h-3.5 w-3.5" />
            Nulstil filtre
          </button>
        )}
      </div>

      {/* 4-Date Selection Panels */}
      {compareFourDatesEnabled && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-lg p-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-blue-700">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-bold">Vælg 4 sammenligningsdatoer (4 Karşılaştırma Tarihi):</span>
            </div>
            <span className="text-[10px] text-blue-500 font-medium">Resultaterne sammenlignes side-om-side på dashboardet</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((index) => {
              const selectedDate = compareDates[index] || "";
              return (
                <div key={index} className="flex flex-col gap-1 bg-white p-2 rounded-md border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Dato {index + 1}:</span>
                  <select
                    value={selectedDate}
                    onChange={(e) => {
                      const newDates = [...compareDates];
                      newDates[index] = e.target.value;
                      setCompareDates(newDates);
                    }}
                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/50"
                  >
                    <option value="">Vælg dato...</option>
                    {availableDates.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d)} {getWeekdayLabel(d).split(" ")[0]} {d === availableDates[0] ? "(Seneste)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Secondary Row: Multi-select location, doc-type, and text search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-gray-50">
        {/* Locations */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            Lokationer
          </label>
          <div className="flex flex-wrap gap-1.5">
            {locations.length === 0 ? (
              <span className="text-xs text-gray-400">Ingen tilgængelige</span>
            ) : (
              locations.map((loc) => {
                const active = filter.location.includes(loc);
                return (
                  <button
                    key={loc}
                    onClick={() => toggleLocation(loc)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition cursor-pointer ${
                      active
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Document Types */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-gray-400" />
            Bilagstyper
          </label>
          <div className="flex flex-wrap gap-1.5">
            {documentTypes.length === 0 ? (
              <span className="text-xs text-gray-400">Ingen tilgængelige</span>
            ) : (
              documentTypes.map((doc) => {
                const active = filter.documentType.includes(doc);
                return (
                  <button
                    key={doc}
                    onClick={() => toggleDocType(doc)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition cursor-pointer ${
                      active
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {doc}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Customer Query */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            Kunde (Nr / Navn)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Søg kunde..."
              value={filter.customerQuery}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, customerQuery: e.target.value }))
              }
              className="w-full text-xs border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/20"
            />
            {filter.customerQuery && (
              <button
                onClick={() => setFilter((prev) => ({ ...prev, customerQuery: "" }))}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Product Query */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            Produkt (Varenr / Beskr)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Søg produkt..."
              value={filter.productQuery}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, productQuery: e.target.value }))
              }
              className="w-full text-xs border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/20"
            />
            {filter.productQuery && (
              <button
                onClick={() => setFilter((prev) => ({ ...prev, productQuery: "" }))}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
