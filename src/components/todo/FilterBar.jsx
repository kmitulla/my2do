import React, { useState, useEffect, useRef } from "react";
import { Search, X, ArrowDownUp, SlidersHorizontal, Check, Bookmark } from "lucide-react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeFilterPresets, saveFilterPresets } from "@/lib/todoService";
import { StarIcon } from "./FavoriteButton";

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

const PRIO_BTN = {
  A: { active: "bg-red-500 text-white", base: "glass-chip text-slate-600" },
  B: { active: "bg-orange-400 text-white", base: "glass-chip text-slate-600" },
  C: { active: "bg-emerald-500 text-white", base: "glass-chip text-slate-600" },
};

// Sortier-Menü (Popover mit Häkchen)
function SortMenu({ sortBy, onSortChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = SORT_OPTIONS.find((o) => o.value === sortBy);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen((v) => !v)} title={`Sortierung: ${current?.label || ""}`}
        className={`h-10 px-2.5 rounded-[14px] glass-chip flex items-center gap-1.5 text-slate-600 text-[13px] font-medium ${open ? "!bg-white" : ""}`}>
        <ArrowDownUp size={16} />
        <span className="hidden sm:inline max-w-[120px] truncate">{current?.label}</span>
      </button>
      {open && (
        <div className="menu glass-strong right-0 top-full mt-2 !min-w-[210px]">
          <p className="section-label px-2.5 pt-1 pb-1.5">Sortieren nach</p>
          {SORT_OPTIONS.map((o) => (
            <button key={o.value} className="menu-item" onClick={() => { onSortChange(o.value); setOpen(false); }}>
              <span className="w-4 flex-shrink-0 text-indigo-600">{o.value === sortBy && <Check size={15} strokeWidth={2.6} />}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Werkzeugzeile über der Liste: Suche · Favoriten · Sortierung · Filter
export default function FilterBar({
  filters, onFiltersChange, categories, sortBy, onSortChange,
  search, onSearchChange, searchAll, onSearchAllChange, searchRef,
}) {
  const { user } = useFirebaseAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [presets, setPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState("");

  // Subscribe to Firestore presets (synced across devices)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeFilterPresets(user.uid, setPresets);
    return unsub;
  }, [user?.uid]);

  const savePresets = (updated) => {
    setPresets(updated);
    if (user?.uid) saveFilterPresets(user.uid, updated);
  };

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset = { name, filters, sortBy, id: Date.now() };
    savePresets([...presets, preset]);
    setNewPresetName("");
  };

  const handleLoadPreset = (preset) => {
    onFiltersChange(preset.filters);
    onSortChange(preset.sortBy);
  };

  const handleDeletePreset = (id) => {
    savePresets(presets.filter((p) => p.id !== id));
  };

  const toggleMulti = (key, value) => {
    const current = filters[key] || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  const updateFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const activeCount =
    (filters.statuses?.length || 0) +
    (filters.prios?.length || 0) +
    (filters.categories?.length || 0) +
    (filters.showArchived ? 1 : 0) +
    (filters.wiedervorlageFilter ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input ref={searchRef} value={search} onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Suchen …"
            className="w-full h-10 pl-10 pr-9 rounded-[14px] glass-input text-slate-800 placeholder-slate-400 text-[15px]" />
          {search && (
            <button onClick={() => onSearchChange("")} title="Suche leeren"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200/80 text-slate-500 flex items-center justify-center hover:bg-slate-300">
              <X size={13} strokeWidth={2.6} />
            </button>
          )}
        </div>

        {/* Nur Favoriten */}
        <button onClick={() => updateFilter("onlyFavorites", !filters.onlyFavorites)}
          aria-pressed={!!filters.onlyFavorites}
          className={`w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0 transition-all ${
            filters.onlyFavorites ? "bg-amber-400 text-white shadow-md shadow-amber-400/30" : "glass-chip text-slate-500"
          }`} title={filters.onlyFavorites ? "Alle anzeigen" : "Nur Favoriten anzeigen"}>
          <StarIcon filled={!!filters.onlyFavorites} size={16} />
        </button>

        <SortMenu sortBy={sortBy} onSortChange={onSortChange} />

        <button onClick={() => setShowFilters(!showFilters)} title="Filter"
          className={`h-10 px-2.5 rounded-[14px] text-[13px] font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
            showFilters || activeCount > 0 ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "glass-chip text-slate-600"
          }`}>
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filter</span>
          {activeCount > 0 && <span className="bg-white/25 text-[11px] font-bold px-1.5 rounded-full">{activeCount}</span>}
        </button>
      </div>

      {search && (
        <button onClick={() => onSearchAllChange(!searchAll)}
          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
            searchAll ? "bg-indigo-100 text-indigo-600 border border-indigo-200" : "glass-chip text-slate-500"
          }`}>
          {searchAll ? "✓ Suche in allen 2dos (inkl. Archiv, ohne Filter)" : "In allen 2dos suchen (inkl. Archiv, ohne Filter)"}
        </button>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="glass rounded-[20px] p-3 space-y-3">

          {/* Gespeicherte Filter (Presets, geräteübergreifend) */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Bookmark size={12} /> Gespeicherte Filter
            </label>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presets.map((p) => (
                  <span key={p.id} className="inline-flex items-center rounded-xl bg-violet-50 border border-violet-200 overflow-hidden">
                    <button onClick={() => handleLoadPreset(p)} title={SORT_OPTIONS.find((o) => o.value === p.sortBy)?.label || p.sortBy}
                      className="pl-2.5 pr-1.5 py-1.5 text-violet-700 text-xs font-semibold hover:bg-violet-100">
                      {p.name}
                    </button>
                    <button onClick={() => handleDeletePreset(p.id)} title="Löschen"
                      className="px-1.5 py-1.5 text-violet-300 hover:text-red-500 hover:bg-red-50">
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Aktuelle Filter speichern als …"
                onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl glass-input text-xs text-slate-700" />
              <button onClick={handleSavePreset} disabled={!newPresetName.trim()}
                className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-semibold disabled:opacity-40">
                Speichern
              </button>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status <span className="text-slate-300 font-normal normal-case">(Mehrfachauswahl)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {["offen", "in Arbeit", "wartend", "erledigt"].map((s) => {
                const active = filters.statuses?.includes(s);
                return (
                  <button key={s} onClick={() => toggleMulti("statuses", s)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${active ? "bg-blue-500 text-white shadow-sm" : "glass-chip text-slate-600"}`}>
                    {s}
                  </button>
                );
              })}
              {(filters.statuses?.length > 0) && (
                <button onClick={() => updateFilter("statuses", [])} className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 bg-slate-50 border border-slate-200">✕ Reset</button>
              )}
            </div>
          </div>

          {/* Prio */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Priorität <span className="text-slate-300 font-normal normal-case">(Mehrfachauswahl)</span></label>
            <div className="flex gap-1.5">
              {["A", "B", "C"].map((p) => {
                const active = filters.prios?.includes(p);
                return (
                  <button key={p} onClick={() => toggleMulti("prios", p)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${active ? PRIO_BTN[p].active + " shadow-sm" : PRIO_BTN[p].base}`}>
                    {p}
                  </button>
                );
              })}
              {(filters.prios?.length > 0) && (
                <button onClick={() => updateFilter("prios", [])} className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 bg-slate-50 border border-slate-200">✕</button>
              )}
            </div>
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Tags <span className="text-slate-300 font-normal normal-case">(Mehrfachauswahl)</span></label>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => toggleMulti("categories", "__no_tag__")}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium ${filters.categories?.includes("__no_tag__") ? "bg-slate-600 text-white shadow-sm" : "glass-chip text-slate-600"}`}>
                  Ohne Tag
                </button>
                {categories.map((c) => {
                  const active = filters.categories?.includes(c.name);
                  return (
                    <button key={c.id} onClick={() => toggleMulti("categories", c.name)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-medium ${active ? "bg-blue-500 text-white shadow-sm" : "glass-chip text-slate-600"}`}>
                      {c.name}
                    </button>
                  );
                })}
                {(filters.categories?.length > 0) && (
                  <button onClick={() => updateFilter("categories", [])} className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 bg-slate-50 border border-slate-200">✕ Reset</button>
                )}
              </div>
            </div>
          )}

          {/* Wiedervorlage */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Wiedervorlage</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "", label: "Alle" },
                { key: "hide_future", label: "Zukünftige ausblenden" },
                { key: "only_today", label: "Nur heute fällig" },
                { key: "only_past", label: "Nur vergangene" },
              ].map((o) => (
                <button key={o.key} onClick={() => updateFilter("wiedervorlageFilter", o.key)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${(filters.wiedervorlageFilter || "") === o.key ? "bg-purple-500 text-white" : "glass-chip text-slate-600"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Archiv */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => updateFilter("showArchived", !filters.showArchived)}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${filters.showArchived ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}>
              {filters.showArchived && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3"/></svg>}
            </button>
            <span className="text-xs text-slate-600">Archivierte anzeigen</span>
          </div>
        </div>
      )}
    </div>
  );
}