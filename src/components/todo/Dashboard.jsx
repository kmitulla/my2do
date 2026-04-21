import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeTodos, subscribeCategories } from "@/lib/todoService";
import QuickAdd from "./QuickAdd";
import TodoCard from "./TodoCard";
import TodoDetail from "./TodoDetail";
import FilterBar from "./FilterBar";
import OverviewPanel from "./OverviewPanel";
import AdminPanel from "./AdminPanel";
import SettingsPanel from "./SettingsPanel";

const TABS = ["Aufgaben", "Übersicht", "Admin", "Einstellungen"];
const TAB_ICONS = ["✓", "◎", "⚙", "👤"];

const LS_SORT = "todo_sort";
const LS_VIEW = "todo_view";

function sortTodos(todos, sortBy) {
  const [field, dir] = sortBy.split("_");
  const asc = dir === "asc";

  return [...todos].sort((a, b) => {
    let va, vb;
    if (field === "title") { va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); }
    else if (field === "prio") { const order = { A: 0, B: 1, C: 2 }; va = order[a.prio] ?? 1; vb = order[b.prio] ?? 1; }
    else if (field === "status") { va = a.status || ""; vb = b.status || ""; }
    else if (field === "deadline" || field === "wiedervorlage" || field === "createdAt" || field === "updatedAt") {
      const toMs = (v) => v ? (v.toDate ? v.toDate().getTime() : new Date(v).getTime()) : (asc ? Infinity : -Infinity);
      va = toMs(a[field]); vb = toMs(b[field]);
    } else { va = a[field]; vb = b[field]; }

    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
}

export default function Dashboard() {
  const { user, userProfile, isAdmin } = useFirebaseAuth();
  const [todos, setTodos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(LS_VIEW) || "list");
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(LS_SORT) || "createdAt_desc");
  const [filters, setFilters] = useState({ status: "", prio: "", category: "", showArchived: false });
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub1 = subscribeTodos(user.uid, setTodos);
    const unsub2 = subscribeCategories(user.uid, setCategories);
    return () => { unsub1(); unsub2(); };
  }, [user.uid]);

  const handleSortChange = (v) => {
    setSortBy(v);
    localStorage.setItem(LS_SORT, v);
  };
  const handleViewChange = (v) => {
    setView(v);
    localStorage.setItem(LS_VIEW, v);
  };

  const filtered = useMemo(() => {
    let result = todos;
    if (!filters.showArchived) result = result.filter((t) => !t.archived);
    else result = result.filter((t) => t.archived);
    if (filters.status) result = result.filter((t) => t.status === filters.status);
    if (filters.prio) result = result.filter((t) => t.prio === filters.prio);
    if (filters.category) result = result.filter((t) => t.category === filters.category);
    if (search.trim()) result = result.filter((t) => t.title?.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()));
    return sortTodos(result, sortBy);
  }, [todos, filters, sortBy, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-md">✓</div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight flex-1">2Do</h1>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handleViewChange(view === "list" ? "grid" : "list")}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all text-sm">
              {view === "list" ? "⊞" : "☰"}
            </button>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              {(userProfile?.displayName || user?.email || "?")[0].toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-28">
        {/* Tab Nav */}
        <div className="flex gap-1 mt-4 bg-white/50 backdrop-blur-xl rounded-2xl p-1 border border-white/60">
          {TABS.map((tab, i) => (
            (i === 2 && !isAdmin) ? null : (
              <button key={tab} onClick={() => setActiveTab(i)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === i ? "bg-white shadow-md text-blue-600" : "text-slate-500 hover:text-slate-700"
                }`}>
                <span className="hidden sm:inline">{tab}</span>
                <span className="sm:hidden">{TAB_ICONS[i]}</span>
              </button>
            )
          ))}
        </div>

        {/* Tab Content */}
        <div className="mt-4 space-y-4">
          {activeTab === 0 && (
            <>
              {/* Quick Add */}
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-3 shadow-sm">
                <QuickAdd categories={categories} />
              </div>

              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suchen..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/70 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[15px]" />
              </div>

              {/* Filter */}
              <FilterBar filters={filters} onFiltersChange={setFilters} categories={categories} sortBy={sortBy} onSortChange={handleSortChange} />

              {/* Todo List */}
              <div className={view === "grid" ? "grid grid-cols-2 gap-2.5" : "space-y-2"}>
                {filtered.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="text-slate-400 text-sm">Keine Aufgaben gefunden</p>
                    <p className="text-slate-300 text-xs mt-1">Erstelle eine neue Aufgabe oben</p>
                  </div>
                ) : (
                  filtered.map((todo) => (
                    <TodoCard key={todo.id} todo={todo} view={view} onClick={setSelectedTodo} />
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 1 && <OverviewPanel todos={todos} />}
          {activeTab === 2 && isAdmin && <AdminPanel />}
          {activeTab === 3 && <SettingsPanel categories={categories} />}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedTodo && (
        <TodoDetail
          todo={selectedTodo}
          categories={categories}
          onClose={() => setSelectedTodo(null)}
          onDelete={() => setSelectedTodo(null)}
        />
      )}
    </div>
  );
}