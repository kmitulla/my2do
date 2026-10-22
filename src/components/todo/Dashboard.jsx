import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFirebaseAuth, DEFAULT_UNDO_DURATION_SEC } from "@/lib/firebaseAuth";
import {
  subscribeTodos, subscribeCategories,
  subscribeMinimized, saveMinimizedDraft, removeMinimizedDraft,
} from "@/lib/todoService";
import QuickAdd from "./QuickAdd";
import TodoCard from "./TodoCard";
import FilterBar from "./FilterBar";
import OverviewPanel from "./OverviewPanel";
import AdminPanel from "./AdminPanel";
import SettingsPanel from "./SettingsPanel";
import InboxPanel from "./InboxPanel";
import AICreateTodo from "./AICreateTodo";
import NotesPanel from "./NotesPanel";
import SwipeableTodoCard from "./SwipeableTodoCard";
import TodoDetailModal from "./TodoDetailModal";
import FavoritesBar from "./FavoritesBar";
import { AppBar, NavDock, NAV } from "./AppBar";
import useDesktopReminders from "@/components/desktop/useDesktopReminders";
import { List, LayoutGrid } from "lucide-react";

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

const defaultFilters = { statuses: [], prios: [], categories: [], showArchived: false, wiedervorlageFilter: "", onlyFavorites: false };

export default function Dashboard() {
  const { user, userProfile, isAdmin } = useFirebaseAuth();
  const [todos, setTodos] = useState([]);
  const [categories, setCategories] = useState([]);
  // Gesendete, noch nicht angenommene geteilte 2dos
  const [pendingShares, setPendingShares] = useState([]);
  // todos | notes | overview | inbox | settings | admin
  const [activeTab, setActiveTab] = useState("todos");
  const [selectedTodo, setSelectedTodo] = useState(null);
  // Minimierte Editoren: ungespeicherte Entwürfe — in Firestore synchronisiert,
  // dadurch geräteübergreifend verfügbar. Shape: [{ todoId, draft }]
  const [minimizedRaw, setMinimizedRaw] = useState([]);
  // Undo-Banner nach Swipe-Aktionen: { key, label, undo }
  const [undoInfo, setUndoInfo] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [showMinList, setShowMinList] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem(LS_VIEW) || "list");
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(LS_SORT) || "createdAt_desc");
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeTodos(user.uid, setTodos, setPendingShares);
    const unsub2 = subscribeCategories(user.uid, setCategories);
    const unsub3 = subscribeMinimized(user.uid, setMinimizedRaw);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [user.uid]);

  // Minimierte Entwürfe mit dem zugehörigen Todo anreichern (für Chips + Wiederöffnen)
  const minimized = useMemo(() =>
    minimizedRaw.map((m) => ({
      ...m,
      todo: todos.find((t) => t.id === m.todoId) || { id: m.todoId, title: m.draft?.title || "Ohne Titel" },
    })), [minimizedRaw, todos]);

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
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    let result = todos;
    if (search.trim() && searchAll) {
      // No filtering at all — search everything
    } else {
      if (!filters.showArchived) result = result.filter((t) => !t.archived);
      else result = result.filter((t) => t.archived);
      if (filters.onlyFavorites) result = result.filter((t) => t.favorite);
      if (filters.statuses?.length) result = result.filter((t) => filters.statuses.includes(t.status));
      if (filters.prios?.length) result = result.filter((t) => filters.prios.includes(t.prio));
      if (filters.categories?.length) result = result.filter((t) => {
        const todoTags = t.tags || (t.category ? [t.category] : []);
        return filters.categories.some((fc) =>
          fc === "__no_tag__" ? todoTags.length === 0 : todoTags.includes(fc)
        );
      });
      result = applyWiedervorlageFilter(result, filters.wiedervorlageFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.title?.toLowerCase().includes(q) ||
        (t.manualStatus || "").toLowerCase().includes(q) ||
        (t.description || "").replace(/<[^>]+>/g, "").toLowerCase().includes(q));
    }
    return sortTodos(result, sortBy);
  }, [todos, filters, sortBy, search, searchAll]);

  // Todo öffnen — falls ein minimierter Entwurf existiert, diesen wiederherstellen
  const openTodo = (todo) => {
    const existing = minimized.find((m) => m.todo.id === todo.id);
    if (existing) {
      removeMinimizedDraft(user.uid, todo.id);
      setSelectedDraft(existing.draft);
      setSelectedTodo(existing.todo);
    } else {
      setSelectedDraft(null);
      setSelectedTodo(todo);
    }
  };

  const closeTodo = () => {
    setSelectedTodo(null);
    setSelectedDraft(null);
  };

  // Editor minimieren: Entwurf in Firestore merken (geräteübergreifend), Modal schließen
  const handleMinimize = (draft) => {
    if (selectedTodo) {
      saveMinimizedDraft(user.uid, selectedTodo.id, draft).catch((err) =>
        console.error("Entwurf speichern fehlgeschlagen:", err));
    }
    closeTodo();
  };

  // Minimierten Entwurf verwerfen (wie X: Änderungen werden nicht übernommen)
  const discardMinimized = (todoId) => {
    removeMinimizedDraft(user.uid, todoId);
  };

  // Handle newly created todo: open it immediately
  const handleQuickCreated = (newTodo) => {
    openTodo(newTodo);
  };

  const aiEnabled = userProfile?.aiEnabled;

  // Befehle aus der Desktop-App (Tastenkürzel, Tray, Erinnerungen)
  const openTodoRef = useRef(openTodo);
  openTodoRef.current = openTodo;
  const todosRef = useRef(todos);
  todosRef.current = todos;
  useEffect(() => {
    // Strg+1…5: Bereiche in Dock-Reihenfolge, danach Einstellungen
    const order = [...NAV.map((n) => n.key), "settings"];
    const onCommand = (e) => {
      const cmd = e.detail || {};
      if (cmd.type === "tab" && order[cmd.index]) {
        setActiveTab(order[cmd.index]);
      } else if (cmd.type === "quick-add") {
        setActiveTab("todos");
        setTimeout(() => window.dispatchEvent(new Event("my2do:focus-quick-add")), 60);
      } else if (cmd.type === "search") {
        setActiveTab("todos");
        setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 60);
      } else if (cmd.type === "open-todo") {
        const todo = todosRef.current.find((t) => t.id === cmd.id);
        if (todo) {
          setActiveTab("todos");
          openTodoRef.current(todo);
        }
      }
    };
    window.addEventListener("my2do:command", onCommand);
    return () => window.removeEventListener("my2do:command", onCommand);
  }, []);

  useDesktopReminders(todos);

  const activeCount = useMemo(() => todos.filter((t) => !t.archived).length, [todos]);

  return (
    <div className="min-h-screen relative">
      <div className="liquid-bg" />

      <AppBar activeTab={activeTab} onTab={setActiveTab} inboxCount={pendingShares.length}
        aiEnabled={aiEnabled} onAI={() => setShowAI(true)} />

      <main className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 pb-dock lg:pb-12 relative z-10">
        {activeTab === "todos" && (
          <div className="space-y-3">
            <div className="glass rounded-[22px] p-2.5">
              <QuickAdd categories={categories} onCreated={handleQuickCreated} aiEnabled={aiEnabled} />
            </div>
            <FavoritesBar todos={todos} onOpen={openTodo} />
            <FilterBar filters={filters} onFiltersChange={handleFiltersChange} categories={categories}
              sortBy={sortBy} onSortChange={handleSortChange}
              search={search} searchRef={searchRef}
              onSearchChange={(v) => { setSearch(v); if (!v) setSearchAll(false); }}
              searchAll={searchAll} onSearchAllChange={setSearchAll} />

            {/* Anzahl + Ansicht */}
            <div className="flex items-center gap-2 px-1 pt-0.5">
              <p className="flex-1 text-[12px] font-medium text-slate-400">
                {filtered.length === 1 ? "1 Aufgabe" : `${filtered.length} Aufgaben`}
                {!search && !filters.showArchived && filtered.length !== activeCount && (
                  <span className="text-slate-300"> von {activeCount}</span>
                )}
              </p>
              <div className="seg !p-0.5 !rounded-[11px]">
                <button onClick={() => handleViewChange("list")} title="Liste"
                  className={`seg-item !px-2 !py-1 !rounded-[9px] ${view === "list" ? "seg-item-active" : ""}`}>
                  <List size={15} />
                </button>
                <button onClick={() => handleViewChange("grid")} title="Kacheln"
                  className={`seg-item !px-2 !py-1 !rounded-[9px] ${view === "grid" ? "seg-item-active" : ""}`}>
                  <LayoutGrid size={15} />
                </button>
              </div>
            </div>

            <div className={view === "grid" ? "grid grid-cols-2 lg:grid-cols-3 gap-2.5" : "space-y-2"}>
              {filtered.length === 0 ? (
                <div className="col-span-full text-center py-14">
                  <div className="w-14 h-14 rounded-2xl glass mx-auto mb-3 flex items-center justify-center text-2xl">📋</div>
                  <p className="text-slate-500 text-sm font-medium">Keine Aufgaben gefunden</p>
                  <p className="text-slate-400 text-xs mt-1">{search ? "Andere Suche probieren" : "Oben eine neue Aufgabe anlegen"}</p>
                </div>
              ) : (
                filtered.map((todo) => (
                  view === "grid"
                    ? <TodoCard key={todo.id} todo={todo} view={view} onClick={openTodo} />
                    : <SwipeableTodoCard key={todo.id} todo={todo} onClick={openTodo}
                        onAction={(info) => setUndoInfo({ ...info, key: Date.now() })} />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "notes" && <NotesPanel />}
        {activeTab === "overview" && <OverviewPanel todos={todos} />}
        {activeTab === "inbox" && <InboxPanel items={pendingShares} />}
        {activeTab === "admin" && isAdmin && <AdminPanel />}
        {activeTab === "settings" && <SettingsPanel categories={categories} todos={todos} />}
      </main>

      <NavDock activeTab={activeTab} onTab={setActiveTab} inboxCount={pendingShares.length} />

      {/* Minimierte Todo-Editoren — bis 3 als Chips, darüber gebündelt mit aufklappbarer Liste */}
      {minimized.length > 0 && minimized.length <= 3 && (
        <div className="fixed bottom-[calc(84px+var(--safe-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 max-w-[94vw] overflow-x-auto no-scrollbar px-1 py-1">
          {minimized.map(({ todo, draft }) => (
            <div key={todo.id}
              className="flex-shrink-0 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full glass-strong">
              <button onClick={() => openTodo(todo)} className="flex items-center gap-2 max-w-[160px]" title="Wieder öffnen">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" }[draft.prio] || "bg-orange-400"
                }`} />
                <span className="text-xs font-medium text-slate-700 truncate">{draft.title || todo.title || "Ohne Titel"}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
              <button onClick={() => discardMinimized(todo.id)} title="Verwerfen (Änderungen gehen verloren)"
                className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex-shrink-0">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {minimized.length > 3 && (
        <div className="fixed bottom-[calc(84px+var(--safe-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center">
          {showMinList && (
            <div className="mb-2 w-80 max-w-[92vw] max-h-72 overflow-y-auto rounded-[22px] glass-strong p-1.5 space-y-0.5">
              {minimized.map(({ todo, draft }) => (
                <div key={todo.id} className="flex items-center gap-2 pl-2.5 pr-1.5 py-2 rounded-xl hover:bg-slate-50">
                  <button onClick={() => { setShowMinList(false); openTodo(todo); }}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left" title="Wieder öffnen">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" }[draft.prio] || "bg-orange-400"
                    }`} />
                    <span className="text-xs font-medium text-slate-700 truncate">{draft.title || todo.title || "Ohne Titel"}</span>
                  </button>
                  <button onClick={() => discardMinimized(todo.id)} title="Verwerfen (Änderungen gehen verloren)"
                    className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex-shrink-0">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowMinList((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-xs font-semibold text-slate-700 active:scale-95 transition-all">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="14" width="18" height="7" rx="2"/><path d="M5 10h14M7 6h10"/>
            </svg>
            {minimized.length} minimiert
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${showMinList ? "rotate-180" : ""}`}>
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      )}

      {/* Undo-Banner nach Swipe-Aktionen */}
      {undoInfo && (
        <UndoBanner
          key={undoInfo.key}
          info={undoInfo}
          durationSec={userProfile?.undoDurationSec ?? DEFAULT_UNDO_DURATION_SEC}
          onClose={() => setUndoInfo(null)}
        />
      )}

      {/* Detail Modal — iPhone glass animation */}
      {selectedTodo && (
        <TodoDetailModal
          todo={selectedTodo}
          categories={categories}
          initialDraft={selectedDraft}
          onClose={closeTodo}
          onDelete={closeTodo}
          onMinimize={handleMinimize}
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

// Transparenter Glas-Banner oben: Countdown mit Ladebalken, Tippen = Rückgängig.
// Die Einblendedauer (durationSec) ist pro User in den Einstellungen konfigurierbar.
function UndoBanner({ info, onClose, durationSec = 4 }) {
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const t = setTimeout(onClose, durationSec * 1000);
    return () => clearTimeout(t);
  }, [durationSec, onClose]);

  const handleUndo = async () => {
    if (undoing) return;
    setUndoing(true);
    try {
      await info.undo();
    } catch (err) {
      console.error("Rückgängig fehlgeschlagen:", err);
    }
    onClose();
  };

  return (
    // Zentrierung über inset-x-0 + mx-auto statt translateX(-50%): die
    // Einblend-Animation überschreibt `transform` komplett (fill-mode both)
    // und hob die Zentrierung auf -> Banner hing rechts außerhalb des Screens
    <div className="fixed top-[72px] inset-x-0 mx-auto z-[60] w-[92vw] max-w-sm"
      style={{ animation: "undo-banner-in 0.3s cubic-bezier(0.22,1,0.36,1) both" }}>
      <button onClick={handleUndo}
        className="w-full glass-strong rounded-2xl px-4 pt-2.5 pb-3 text-left active:scale-[0.98] transition-transform overflow-hidden relative">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-indigo-100/80 text-indigo-600 flex items-center justify-center flex-shrink-0">
            {undoing ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5L1 10"/>
              </svg>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Rückgängig?</p>
            <p className="text-[11px] text-slate-500 truncate">{info.label}</p>
          </div>
        </div>
        {/* Ablaufender Ladebalken (Dauer = durationSec) */}
        <div className="mt-2 h-1 rounded-full bg-slate-200/60 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400"
            style={{ animation: `undo-progress ${durationSec}s linear forwards` }} />
        </div>
      </button>
      <style>{`
        @keyframes undo-progress { from { width: 100%; } to { width: 0%; } }
        @keyframes undo-banner-in {
          from { transform: translateY(-16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}