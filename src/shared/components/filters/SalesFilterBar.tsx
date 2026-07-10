import React from "react";
import { Filter, Calendar, MapPin, FileText, Search, X } from "lucide-react";
import { SalesFilter } from "../../../shared/types.js";
import { formatDate } from "../../../shared/utils/format.js";

interface SalesFilterBarProps {
  filter: SalesFilter;
  setFilter: React.Dispatch<React.SetStateAction<SalesFilter>>;
  availableDates: string[];
  locations: string[];
  documentTypes: string[];
  onClearFilters: () => void;
}

export default function SalesFilterBar({
  filter,
  setFilter,
  availableDates,
  locations,
  documentTypes,
  onClearFilters,
}: SalesFilterBarProps) {

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
        {/* Date worksheets */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4.5 w-4.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Forretningsfane:</span>
          <select
            value={filter.businessDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-800 bg-gray-50/50 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)} {d === availableDates[0] ? "(Seneste)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters button */}
        {(filter.location.length > 0 ||
          filter.documentType.length > 0 ||
          filter.customerQuery !== "" ||
          filter.productQuery !== "") && (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Nulstil filtre
          </button>
        )}
      </div>

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
