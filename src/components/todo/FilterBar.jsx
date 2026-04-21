import React, { useState } from "react";

const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Erstellt (neu)" },
  { value: "createdAt_asc", label: "Erstellt (alt)" },
  { value: "title_asc", label: "Titel A–Z" },
  { value: "title_desc", label: "Titel Z–A" },
  { value: "prio_asc", label: "Priorität A→C" },
  { value: "prio_desc", label: "Priorität C→A" },
  { value: "deadline_asc", label: "Deadline (früh)" },
  { value: "deadline_desc", label: "Deadline (spät)" },
  { value: "wiedervorlage_asc", label: "Wiedervorlage" },
  { value: "status_asc", label: "Status" },
];

export default function FilterBar({ filters, onFiltersChange, categories, sortBy, onSortChange }) {
  const [showFilters, setShowFilters] = useState(false);

  const updateFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl bg-white/70 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
            showFilters || activeCount > 0
              ? "bg-blue-500 text-white shadow-md"
              : "bg-white/70 border border-slate-200 text-slate-600 hover:bg-white"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter{activeCount > 0 && <span className="bg-white/30 text-xs px-1 rounded-full">{activeCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 p-3 space-y-2.5">
          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {["", "offen", "in Arbeit", "wartend", "erledigt"].map((s) => (
                <button key={s} onClick={() => updateFilter("status", s)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                    filters.status === s ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {s || "Alle"}
                </button>
              ))}
            </div>
          </div>

          {/* Prio */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Priorität</label>
            <div className="flex gap-1.5">
              {["", "A", "B", "C"].map((p) => (
                <button key={p} onClick={() => updateFilter("prio", p)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    filters.prio === p
                      ? p === "A" ? "bg-red-500 text-white" : p === "B" ? "bg-orange-400 text-white" : p === "C" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {p || "Alle"}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Kategorie</label>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => updateFilter("category", "")}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${!filters.category ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                  Alle
                </button>
                {categories.map((c) => (
                  <button key={c.id} onClick={() => updateFilter("category", c.name)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${filters.category === c.name ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Archiv */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => updateFilter("showArchived", !filters.showArchived)}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${filters.showArchived ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}>
              {filters.showArchived && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>}
            </button>
            <span className="text-xs text-slate-600">Archivierte anzeigen</span>
          </div>
        </div>
      )}
    </div>
  );
}