import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SquareCheckBig, NotebookPen, LayoutDashboard, Inbox, Settings, ShieldCheck, LogOut,
  Search, X, ListTodo, AlarmClock, Star, Users, CircleCheckBig, Archive, Hash, Sparkles, RotateCcw, ChevronDown,
} from "lucide-react";
import { useFirebaseAuth, DEFAULT_UNDO_DURATION_SEC } from "@/lib/firebaseAuth";
import { subscribeTodos, subscribeCategories } from "@/lib/todoService";
import { filterTodos, defaultFilters, todoTags, toDate } from "@/lib/todoFilters";
import { canOpenWindows, openInWindow } from "@/lib/desktop";
import QuickAdd from "@/components/todo/QuickAdd";
import FilterBar from "@/components/todo/FilterBar";
import TodoDetail from "@/components/todo/TodoDetail";
import NotesPanel from "@/components/todo/NotesPanel";
import OverviewPanel from "@/components/todo/OverviewPanel";
import InboxPanel from "@/components/todo/InboxPanel";
import SettingsPanel from "@/components/todo/SettingsPanel";
import AdminPanel from "@/components/todo/AdminPanel";
import AICreateTodo from "@/components/todo/AICreateTodo";
import SyncIndicator from "@/components/todo/SyncIndicator";
import DesktopTodoList, { todoActions } from "./DesktopTodoList";
import DesktopSettings from "./DesktopSettings";
import useDesktopReminders from "./useDesktopReminders";

const VIEWS = [
  { key: "todos", label: "Aufgaben", Icon: SquareCheckBig },
  { key: "notes", label: "Notizen", Icon: NotebookPen },
  { key: "overview", label: "Übersicht", Icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", Icon: Inbox },
];

// Intelligente Listen in der Seitenleiste
const LISTS = [
  { key: "all", label: "Alle", Icon: ListTodo },
  { key: "due", label: "Fällig", Icon: AlarmClock },
  { key: "favorites", label: "Favoriten", Icon: Star },
  { key: "shared", label: "Geteilt", Icon: Users },
  { key: "done", label: "Erledigt", Icon: CircleCheckBig },
  { key: "archive", label: "Archiv", Icon: Archive },
];

const LS_SORT = "todo_sort";
const LS_LIST = "desktop_list";
const LS_FILTERS = "desktop_filters";

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
// Fällig: Wiedervorlage oder Deadline heute bzw. schon vorbei
const isDue = (t) => {
  if (t.archived || t.status === "erledigt") return false;
  const end = endOfToday();
  const wv = toDate(t.wiedervorlage);
  const dl = toDate(t.deadline);
  return (wv && wv <= end) || (dl && dl <= end);
};

function inList(t, list) {
  if (list.startsWith("tag:")) return !t.archived && todoTags(t).includes(list.slice(4));
  switch (list) {
    case "due": return isDue(t);
    case "favorites": return !t.archived && !!t.favorite;
    case "shared": return !t.archived && !!t.sharedId;
    case "done": return !t.archived && t.status === "erledigt";
    case "archive": return !!t.archived;
    default: return !t.archived;
  }
}

const listTitle = (list) => (list.startsWith("tag:") ? `#${list.slice(4)}` : LISTS.find((l) => l.key === list)?.label || "Alle");
const isTyping = (el) => !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
const readLS = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

// Rückgängig-Leiste unten in der Liste (schiebt, überdeckt nichts)
function UndoBar({ info, durationSec, onClose }) {
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Countdown nur einmal starten – nicht bei jeder Datenaktualisierung neu
  useEffect(() => {
    const t = setTimeout(() => closeRef.current(), durationSec * 1000);
    return () => clearTimeout(t);
  }, [durationSec]);
  return (
    <div className="flex-shrink-0 mx-4 mb-3 dt-card !py-2 !px-3 flex items-center gap-3 overflow-hidden relative">
      <span className="flex-1 min-w-0 text-[13px] text-slate-600 truncate">{info.label}</span>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await info.undo(); } finally { onClose(); } }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-indigo-600 hover:bg-indigo-50">
        <RotateCcw size={14} /> Rückgängig
      </button>
      <span className="absolute left-0 bottom-0 h-0.5 bg-indigo-400/70" style={{ animation: `dt-undo ${durationSec}s linear forwards` }} />
    </div>
  );
}

function NavButton({ active, onClick, Icon, label, count, badge, title }) {
  return (
    <button onClick={onClick} title={title || label} className={`dt-nav ${active ? "dt-nav-active" : ""}`}>
      <Icon size={17} strokeWidth={active ? 2.3 : 2} className="flex-shrink-0" />
      <span className="dt-nav-label flex-1 truncate text-left">{label}</span>
      {badge > 0 && <span className="dt-nav-badge">{badge}</span>}
      {!badge && count > 0 && <span className="dt-nav-count">{count}</span>}
    </button>
  );
}

export default function DesktopWorkspace() {
  const { user, userProfile, isAdmin, logout } = useFirebaseAuth();
  const [todos, setTodos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pendingShares, setPendingShares] = useState([]);
  const [view, setView] = useState("todos");
  const [list, setList] = useState(() => readLS(LS_LIST, "all"));
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, ...readLS(LS_FILTERS, {}) }));
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(LS_SORT) || "createdAt_desc");
  const [search, setSearch] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  // Ausgewähltes 2do: eingefrorener Stand beim Auswählen (der Editor
  // übernimmt Änderungen selbst live)
  const [selected, setSelected] = useState(null);
  const [undoInfo, setUndoInfo] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(() => readLS("desktop_tags_open", true));
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const a = subscribeTodos(user.uid, setTodos, setPendingShares);
    const b = subscribeCategories(user.uid, setCategories);
    return () => { a(); b(); };
  }, [user.uid]);

  useEffect(() => { try { localStorage.setItem(LS_LIST, JSON.stringify(list)); } catch { /* privat */ } }, [list]);
  useEffect(() => { try { localStorage.setItem(LS_FILTERS, JSON.stringify(filters)); } catch { /* privat */ } }, [filters]);
  useEffect(() => { try { localStorage.setItem(LS_SORT, sortBy); } catch { /* privat */ } }, [sortBy]);
  useEffect(() => { try { localStorage.setItem("desktop_tags_open", JSON.stringify(tagsOpen)); } catch { /* privat */ } }, [tagsOpen]);

  useDesktopReminders(todos);

  // Liste: intelligente Liste/Tag → erweiterte Filter → Suche → Sortierung
  const filtered = useMemo(() => {
    const base = search.trim() && searchAll ? todos : todos.filter((t) => inList(t, list));
    return filterTodos(base, {
      filters: { ...filters, showArchived: list === "archive", onlyFavorites: false, ...(list.startsWith("tag:") ? { categories: [] } : {}) },
      search, searchAll, sortBy,
    });
  }, [todos, list, filters, search, searchAll, sortBy]);

  const counts = useMemo(() => {
    const c = {};
    LISTS.forEach((l) => { c[l.key] = todos.filter((t) => inList(t, l.key)).length; });
    categories.forEach((cat) => { c[`tag:${cat.name}`] = todos.filter((t) => inList(t, `tag:${cat.name}`)).length; });
    return c;
  }, [todos, categories]);

  // Ausgewähltes 2do verschwunden (gelöscht, anderswo entfernt) → abwählen
  useEffect(() => {
    if (selected && !todos.some((t) => t.id === selected.id)) setSelected(null);
  }, [todos, selected]);

  const select = (todo) => {
    if (!todo) { setSelected(null); return; }
    setSelected((cur) => (cur?.id === todo.id ? cur : todo));
  };
  const openWindow = (todo) => {
    if (selected?.id === todo.id) setSelected(null);
    openInWindow(`/todo/${todo.id}`, "todo", todo.title);
  };
  const showUndo = (info) => setUndoInfo({ ...info, key: Date.now() });
  const goList = (key) => { setView("todos"); setList(key); };

  // Befehle aus Hauptprozess/Tastenkürzeln (Tray, globale Kürzel, Erinnerungen)
  const todosRef = useRef(todos);
  todosRef.current = todos;
  useEffect(() => {
    const order = [...VIEWS.map((v) => v.key), "settings"];
    const onCommand = (e) => {
      const cmd = e.detail || {};
      if (cmd.type === "tab" && order[cmd.index]) setView(order[cmd.index]);
      else if (cmd.type === "settings" || cmd.type === "help") setView("settings");
      else if (cmd.type === "quick-add") {
        setView("todos");
        setTimeout(() => window.dispatchEvent(new Event("my2do:focus-quick-add")), 60);
      } else if (cmd.type === "search") {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (cmd.type === "open-todo") {
        const todo = todosRef.current.find((t) => t.id === cmd.id);
        if (todo) {
          setView("todos");
          if (!inList(todo, list)) setList(todo.archived ? "archive" : "all");
          setSelected((cur) => (cur?.id === todo.id ? cur : todo));
        }
      }
    };
    window.addEventListener("my2do:command", onCommand);
    return () => window.removeEventListener("my2do:command", onCommand);
  }, [list]);

  // Tastatur: Strg+N/F/1…5 überall; ↑ ↓ Leertaste Entf Eingabe in der Liste
  const keyRef = useRef(null);
  keyRef.current = { filtered, selected, view };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const { filtered: items, selected: sel, view: v } = keyRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && !e.shiftKey && k === "n") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("my2do:command", { detail: { type: "quick-add" } }));
      } else if (mod && !e.altKey && k === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (mod && !e.altKey && /^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        setView([...VIEWS.map((x) => x.key), "settings"][Number(e.code.slice(5)) - 1]);
      } else if (v === "todos" && !mod && !isTyping(document.activeElement)) {
        const idx = sel ? items.findIndex((t) => t.id === sel.id) : -1;
        // Leertaste/Eingabe/Entf nur in der Liste – nicht, wenn ein Knopf den Fokus hat
        const inListArea = document.activeElement === document.body || !!listRef.current?.contains(document.activeElement);
        if (!inListArea && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))];
          if (next) setSelected(next);
          listRef.current?.focus();
        } else if (e.key === "Enter" && sel) {
          e.preventDefault();
          document.querySelector("[data-pane] input[placeholder='Titel']")?.focus();
        } else if (e.key === " " && sel) {
          e.preventDefault();
          const info = todoActions(user.uid, items[idx] || sel).toggleDone();
          if (info) showUndo(info);
        } else if (e.key === "Delete" && sel) {
          e.preventDefault();
          const info = todoActions(user.uid, items[idx] || sel).remove();
          setSelected(items[idx + 1] || items[idx - 1] || null);
          if (info) showUndo(info);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user.uid]);

  const name = userProfile?.displayName || user.displayName || user.email || "?";
  const canWindow = canOpenWindows();

  return (
    <div className="dt-app">
      {/* Titelleiste (zum Verschieben; rechts die Windows-Fensterknöpfe) */}
      <header className="dt-titlebar">
        <div className="flex items-center gap-2.5 w-[220px] flex-shrink-0 dt-titlebar-brand">
          <div className="w-7 h-7 rounded-[9px] bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <span className="text-[14px] font-semibold text-slate-700">2Do</span>
          <SyncIndicator compact />
        </div>
        <div className="flex-1 flex justify-center min-w-0">
          <div className="relative w-full max-w-[520px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input ref={searchRef} value={search}
              onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setSearchAll(false); if (view !== "todos") setView("todos"); }}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setSearch(""); setSearchAll(false); e.currentTarget.blur(); } }}
              placeholder="Suchen  (Strg+F)"
              className="dt-search" />
            {search && (
              <button onClick={() => { setSearch(""); setSearchAll(false); }} title="Suche leeren"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-icon btn-icon-sm !w-6 !h-6"><X size={13} /></button>
            )}
          </div>
        </div>
        {userProfile?.aiEnabled && (
          <button onClick={() => setShowAI(true)} title="2do mit KI erstellen" className="btn-icon text-violet-600 ml-2">
            <Sparkles size={17} />
          </button>
        )}
      </header>

      <div className="dt-body">
        {/* Navigation */}
        <nav className="dt-sidebar" aria-label="Navigation">
          <div className="space-y-0.5">
            {VIEWS.map((v) => (
              <NavButton key={v.key} Icon={v.Icon} label={v.label} active={view === v.key && (v.key !== "todos" || !search)}
                onClick={() => setView(v.key)} badge={v.key === "inbox" ? pendingShares.length : 0} />
            ))}
          </div>

          <p className="dt-nav-section">Listen</p>
          <div className="space-y-0.5">
            {LISTS.map((l) => (
              <NavButton key={l.key} Icon={l.Icon} label={l.label} count={counts[l.key]}
                badge={l.key === "due" ? counts.due : 0}
                active={view === "todos" && list === l.key} onClick={() => goList(l.key)} />
            ))}
          </div>

          {categories.length > 0 && (
            <>
              <button onClick={() => setTagsOpen((v) => !v)} title={tagsOpen ? "Tags einklappen" : "Tags ausklappen"}
                className="dt-nav-section flex items-center gap-1 hover:text-slate-600">
                Tags <ChevronDown size={12} className={`transition-transform ${tagsOpen ? "" : "-rotate-90"}`} />
              </button>
              {tagsOpen && <div className="space-y-0.5">
                {categories.map((c) => (
                  <NavButton key={c.id} Icon={Hash} label={c.name} count={counts[`tag:${c.name}`]}
                    active={view === "todos" && list === `tag:${c.name}`} onClick={() => goList(`tag:${c.name}`)} />
                ))}
              </div>}
            </>
          )}

          <div className="flex-1" />
          <div className="space-y-0.5 pt-3">
            <NavButton Icon={Settings} label="Einstellungen" active={view === "settings"} onClick={() => setView("settings")} />
            {isAdmin && <NavButton Icon={ShieldCheck} label="Benutzer" active={view === "admin"} onClick={() => setView("admin")} />}
            <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" title={user.email}>
                {name[0].toUpperCase()}
              </div>
              <div className="dt-nav-label flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-slate-700 truncate">{name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
              <button onClick={() => (confirmLogout ? logout() : setConfirmLogout(true))} onBlur={() => setConfirmLogout(false)}
                title={confirmLogout ? "Nochmal klicken zum Abmelden" : "Abmelden"}
                className={`btn-icon btn-icon-sm flex-shrink-0 ${confirmLogout ? "!bg-red-500 !text-white" : ""}`}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </nav>

        {/* Inhalt */}
        {view === "todos" ? (
          <div className="dt-split">
            <section className="dt-surface dt-list-pane">
              <div className="flex-shrink-0 px-4 pt-4 pb-2 space-y-2.5">
                <div className="flex items-center gap-2">
                  <h1 className="flex-1 min-w-0 text-[20px] font-semibold text-slate-800 tracking-tight truncate">
                    {search ? `Suche: „${search}"` : listTitle(list)}
                  </h1>
                  <span className="text-[12px] font-medium text-slate-400">{filtered.length}</span>
                </div>
                <QuickAdd categories={categories} onCreated={(t) => setSelected(t)} />
                <FilterBar compact filters={filters} onFiltersChange={setFilters} categories={categories}
                  sortBy={sortBy} onSortChange={setSortBy}
                  search={search} searchAll={searchAll} onSearchAllChange={setSearchAll} />
              </div>
              <div ref={listRef} tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 outline-none">
                {filtered.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto mb-3 flex items-center justify-center text-xl">📋</div>
                    <p className="text-slate-500 text-sm font-medium">{search ? "Nichts gefunden" : "Keine Aufgaben in dieser Liste"}</p>
                    <p className="text-slate-400 text-xs mt-1">{search ? "Andere Suche probieren" : "Oben eine neue Aufgabe eingeben (Strg+N)"}</p>
                  </div>
                ) : (
                  <DesktopTodoList todos={filtered} selectedId={selected?.id} uid={user.uid}
                    onSelect={select} onAction={showUndo} onOpenWindow={openWindow} canOpenWindow={canWindow} />
                )}
              </div>
              {undoInfo && (
                <UndoBar key={undoInfo.key} info={undoInfo}
                  durationSec={userProfile?.undoDurationSec ?? DEFAULT_UNDO_DURATION_SEC}
                  onClose={() => setUndoInfo(null)} />
              )}
            </section>

            <section className="dt-surface dt-detail-pane" data-pane>
              {selected ? (
                <TodoDetail key={selected.id} todo={selected} categories={categories} layout="pane"
                  onClose={() => { setSelected(null); listRef.current?.focus(); }}
                  onDelete={() => setSelected(null)} />
              ) : (
                <div className="h-full flex items-center justify-center p-10 text-center">
                  <div className="max-w-[300px]">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-400 mx-auto mb-4 flex items-center justify-center">
                      <SquareCheckBig size={26} />
                    </div>
                    <p className="text-slate-600 text-sm font-medium">Wähle links ein 2do aus</p>
                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                      ↑ ↓ zum Wechseln · Eingabe zum Bearbeiten · Leertaste erledigt · Rechtsklick für mehr.
                      Änderungen werden automatisch gespeichert.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="dt-surface dt-page">
            {view === "notes" ? (
              <div className="h-full p-3"><NotesPanel fill /></div>
            ) : (
              <div className="h-full overflow-y-auto">
                <div className={`mx-auto px-6 py-5 ${view === "settings" ? "max-w-5xl" : "max-w-4xl"}`}>
                  <h1 className="text-[22px] font-semibold text-slate-800 tracking-tight mb-4">
                    {{ overview: "Übersicht", inbox: "Inbox", settings: "Einstellungen", admin: "Benutzerverwaltung" }[view]}
                  </h1>
                  {view === "overview" && <OverviewPanel todos={todos} />}
                  {view === "inbox" && <InboxPanel items={pendingShares} />}
                  {view === "admin" && isAdmin && <AdminPanel />}
                  {view === "settings" && (
                    <div className="space-y-6">
                      <DesktopSettings />
                      <SettingsPanel categories={categories} todos={todos} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {showAI && <AICreateTodo categories={categories} onCreated={() => {}} onClose={() => setShowAI(false)} />}
    </div>
  );
}
