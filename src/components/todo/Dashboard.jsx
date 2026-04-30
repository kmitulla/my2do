import React, { useState, useEffect, useMemo } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeTodos, subscribeCategories, subscribeInbox } from "@/lib/todoService";
import QuickAdd from "./QuickAdd";
import TodoCard from "./TodoCard";
import TodoDetail from "./TodoDetail";
import FilterBar from "./FilterBar";
import OverviewPanel from "./OverviewPanel";
import AdminPanel from "./AdminPanel";
import SettingsPanel from "./SettingsPanel";
import InboxPanel from "./InboxPanel";
import ExportPanel from "./ExportPanel";
import AICreateTodo from "./AICreateTodo";
import SwipeableTodoCard from "./SwipeableTodoCard";
import TodoDetailModal from "./TodoDetailModal";

const LS_SORT = "todo_sort";
const LS_VIEW = "todo_view";
const LS_FILTERS = "todo_filters";

function sortTodos(todos, sortBy) {
  const [field, dir] = sortBy.split("_");
  const asc = dir === "asc";
  return [...todos].sort((a, b) => {
    let va, vb;
    if (field === "title") { va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); }
    else if (field === "prio") { const order = { A: 0, B: 1, C: 2 }; va = order[a.prio] ?? 1; vb = order[b.prio] ?? 1; }
    else if (field === "status") { va = a.status || ""; vb = b.status || ""; }
    else {
      const toMs = (v) => v ? (v.toDate ? v.toDate().getTime() : new Date(v).getTime()) : (asc ? Infinity : -Infinity);
      va = toMs(a[field]); vb = toMs(b[field]);
    }
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
}

function applyWiedervorlageFilter(todos, wFilter) {
  if (!wFilter) return todos;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  return todos.filter((t) => {
    if (!t.wiedervorlage) return true; // no wiedervorlage → always show
    const d = t.wiedervorlage.toDate ? t.wiedervorlage.toDate() : new Date(t.wiedervorlage);
    if (wFilter === "hide_future") return d <= todayEnd; // nur heute oder vergangen anzeigen
    if (wFilter === "only_today") { const dd = new Date(d); dd.setHours(0,0,0,0); return dd.getTime() === todayStart.getTime(); }
    if (wFilter === "only_past") return d < todayStart;
    return true;
  });
}

const defaultFilters = { statuses: [], prios: [], categories: [], showArchived: false, wiedervorlageFilter: "" };

export default function Dashboard() {
  const { user, userProfile, isAdmin } = useFirebaseAuth();
  const [todos, setTodos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(LS_VIEW) || "list");
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(LS_SORT) || "createdAt_desc");
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeTodos(user.uid, setTodos);
    const unsub2 = subscribeCategories(user.uid, setCategories);
    const unsub3 = subscribeInbox(user.uid, (items) => setInboxCount(items.length));
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [user.uid]);

  // Load persisted filters + sort from localStorage (instant) — already handled in useState init above
  // Persist filters to localStorage on change
  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem(LS_FILTERS, JSON.stringify(filters));
    localStorage.setItem(LS_SORT, sortBy);
  }, [filters, sortBy, filtersLoaded]);

  // Load from localStorage once on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTERS));
      if (saved) setFilters(saved);
    } catch {}
    try {
      const savedSort = localStorage.getItem(LS_SORT);
      if (savedSort) setSortBy(savedSort);
    } catch {}
    setFiltersLoaded(true);
  }, []);

  const handleSortChange = (v) => { setSortBy(v); };
  const handleViewChange = (v) => { setView(v); localStorage.setItem(LS_VIEW, v); };
  const handleFiltersChange = (f) => { setFilters(f); };

  // searchAll: when active, ignore ALL filters and search archived+non-archived
  const [searchAll, setSearchAll] = useState(false);

  const filtered = useMemo(() => {
    let result = todos;
    if (search.trim() && searchAll) {
      // No filtering at all — search everything
    } else {
      if (!filters.showArchived) result = result.filter((t) => !t.archived);
      else result = result.filter((t) => t.archived);
      if (filters.statuses?.length) result = result.filter((t) => filters.statuses.includes(t.status));
      if (filters.prios?.length) result = result.filter((t) => filters.prios.includes(t.prio));
      if (filters.categories?.length) result = result.filter((t) => {
        const todoTags = t.tags || (t.category ? [t.category] : []);
        return filters.categories.some((fc) => todoTags.includes(fc));
      });
      result = applyWiedervorlageFilter(result, filters.wiedervorlageFilter);
    }
    if (search.trim()) result = result.filter((t) =>
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || "").replace(/<[^>]+>/g,"").toLowerCase().includes(search.toLowerCase()));
    return sortTodos(result, sortBy);
  }, [todos, filters, sortBy, search, searchAll]);

  // Handle newly created todo: open it immediately
  const handleQuickCreated = (newTodo) => {
    setSelectedTodo(newTodo);
  };

  const aiEnabled = userProfile?.aiEnabled;

  // Tabs: 0=Aufgaben, 1=Übersicht, 2=Inbox, 3=Export, 4=Admin(if admin), 5=Settings
  const TAB_ICONS = {
    "Aufgaben": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    "Übersicht": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    "Inbox": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
    "Export": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    "Admin": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
    "Einstell.": <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  };
  const tabs = [
    { label: "Aufgaben" },
    { label: "Übersicht" },
    { label: "Inbox", badge: inboxCount },
    { label: "Export" },
    ...(isAdmin ? [{ label: "Admin" }] : []),
    { label: "Einstell." },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100" style={{ overflowY: "auto" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight flex-1">2Do</h1>
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => document.execCommand?.("undo")}
              title="Rückgängig"
              className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 active:scale-90 transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5L1 10"/>
              </svg>
            </button>
            <button
              onClick={() => document.execCommand?.("redo")}
              title="Wiederholen"
              className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 active:scale-90 transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.5L23 10"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {aiEnabled && (
              <button onClick={() => setShowAI(true)}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-md active:scale-90 transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            )}
            <button onClick={() => handleViewChange(view === "list" ? "grid" : "list")}
              className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all active:scale-90">
              {view === "list" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              )}
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              {(userProfile?.displayName || user?.email || "?")[0].toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-28">
        {/* Tab Nav */}
        <div className="flex gap-1 mt-4 bg-white/50 backdrop-blur-xl rounded-2xl p-1 border border-white/60 overflow-x-auto no-scrollbar">
          {tabs.map((tab, i) => (
            <button key={tab.label} onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 flex-1 py-2 px-1 rounded-xl text-xs font-semibold transition-all relative min-w-[52px] ${
                activeTab === i ? "bg-white shadow-md text-blue-600" : "text-slate-500 hover:text-slate-700"
              }`}>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden flex items-center justify-center">{TAB_ICONS[tab.label]}</span>
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-4 space-y-4">
          {activeTab === 0 && (
            <>
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-3 shadow-sm">
                <QuickAdd categories={categories} onCreated={handleQuickCreated} aiEnabled={aiEnabled} />
              </div>
              <div className="space-y-1.5">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setSearchAll(false); }}
                    placeholder="Suchen..."
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white/70 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[16px]" />
                  {search && (
                    <button
                      onClick={() => { setSearch(""); setSearchAll(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-white hover:bg-slate-400 transition-all"
                      style={{ fontSize: 10, lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
                {search && (
                  <button
                    onClick={() => setSearchAll((v) => !v)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                      searchAll
                        ? "bg-indigo-100 text-indigo-600 border border-indigo-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {searchAll ? "🔍 Alle Notizen (aktiv)" : "🔍 Alle Notizen suchen"}
                  </button>
                )}
              </div>
              <FilterBar filters={filters} onFiltersChange={handleFiltersChange} categories={categories} sortBy={sortBy} onSortChange={handleSortChange} />
              <div className={view === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-2"}>
                {filtered.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="text-slate-400 text-sm">Keine Aufgaben gefunden</p>
                  </div>
                ) : (
                  filtered.map((todo) => (
                    view === "grid"
                      ? <TodoCard key={todo.id} todo={todo} view={view} onClick={setSelectedTodo} />
                      : <SwipeableTodoCard key={todo.id} todo={todo} onClick={setSelectedTodo} />
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 1 && <OverviewPanel todos={todos} />}
          {activeTab === 2 && <InboxPanel />}
          {activeTab === 3 && <ExportPanel todos={todos} categories={categories} />}
          {activeTab === 4 && isAdmin && <AdminPanel />}
          {activeTab === (isAdmin ? 5 : 4) && <SettingsPanel categories={categories} />}
        </div>
      </div>

      {/* Detail Modal — iPhone glass animation */}
      {selectedTodo && (
        <TodoDetailModal
          todo={selectedTodo}
          categories={categories}
          onClose={() => setSelectedTodo(null)}
          onDelete={() => setSelectedTodo(null)}
        />
      )}

      {/* AI Create Modal */}
      {showAI && (
        <AICreateTodo
          categories={categories}
          onCreated={() => {}}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}