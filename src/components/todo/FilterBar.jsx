import React, { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeFilterPresets, saveFilterPresets } from "@/lib/todoService";

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
  A: { active: "bg-red-500 text-white", base: "bg-slate-100 text-slate-600" },
  B: { active: "bg-orange-400 text-white", base: "bg-slate-100 text-slate-600" },
  C: { active: "bg-emerald-500 text-white", base: "bg-slate-100 text-slate-600" },
};

export default function FilterBar({ filters, onFiltersChange, categories, sortBy, onSortChange }) {
  const { user } = useFirebaseAuth();
  const [showFilters, setShowFilters] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
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
    setShowPresets(false);
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
      <div className="flex gap-2 items-center">
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl bg-white/70 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Presets button */}
        <button onClick={() => { setShowPresets(!showPresets); setShowFilters(false); }}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1 ${
            showPresets ? "bg-violet-500 text-white shadow-md" : "bg-white/70 border border-slate-200 text-slate-600"
          }`} title="Filter-Presets">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          {presets.length > 0 && <span className="text-xs">{presets.length}</span>}
        </button>

        <button onClick={() => { setShowFilters(!showFilters); setShowPresets(false); }}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
            showFilters || activeCount > 0 ? "bg-blue-500 text-white shadow-md" : "bg-white/70 border border-slate-200 text-slate-600 hover:bg-white"
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter{activeCount > 0 && <span className="bg-white/30 text-xs px-1 rounded-full">{activeCount}</span>}
        </button>
      </div>

      {/* Presets panel */}
      {showPresets && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 p-3 space-y-3 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filter-Presets</p>

          {/* Existing presets */}
          {presets.length === 0 ? (
            <p className="text-xs text-slate-400">Noch keine Presets gespeichert.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <button onClick={() => handleLoadPreset(p)}
                    className="flex-1 text-left px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium hover:bg-violet-100 transition-all">
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-2 text-violet-400 font-normal">
                      {SORT_OPTIONS.find(o => o.value === p.sortBy)?.label || p.sortBy}
                    </span>
                  </button>
                  <button onClick={() => handleDeletePreset(p.id)}
                    className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 text-xs">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save current as preset */}
          <div className="border-t border-slate-100 pt-2 flex gap-2">
            <input value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset-Name…"
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
            <button onClick={handleSavePreset} disabled={!newPresetName.trim()}
              className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-semibold disabled:opacity-40">
              Speichern
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Aktuelle Filter + Sortierung werden gespeichert.</p>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 p-3 space-y-3">

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status <span className="text-slate-300 font-normal normal-case">(Mehrfachauswahl)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {["offen", "in Arbeit", "wartend", "erledigt"].map((s) => {
                const active = filters.statuses?.includes(s);
                return (
                  <button key={s} onClick={() => toggleMulti("statuses", s)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${active ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
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
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium ${filters.categories?.includes("__no_tag__") ? "bg-slate-600 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
                  Ohne Tag
                </button>
                {categories.map((c) => {
                  const active = filters.categories?.includes(c.name);
                  return (
                    <button key={c.id} onClick={() => toggleMulti("categories", c.name)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-medium ${active ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
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
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${(filters.wiedervorlageFilter || "") === o.key ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-600"}`}>
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