import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check, Star, Archive, ArchiveRestore, Trash2, Clock, CalendarDays, AppWindow,
  Ellipsis, RotateCcw, TriangleAlert,
} from "lucide-react";
import { updateTodo, deleteTodo, restoreTodo, setTodoFavorite } from "@/lib/todoService";
import { todoTags, toDate } from "@/lib/todoFilters";
import SharedBadge, { notifyLocked } from "@/components/todo/SharedBadge";

const PRIO_DOT = { A: "bg-red-500", B: "bg-amber-400", C: "bg-emerald-500" };
const PRIO_TEXT = { A: "text-red-600 bg-red-50", B: "text-amber-700 bg-amber-50", C: "text-emerald-700 bg-emerald-50" };

const dayStart = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(9, 0, 0, 0);
  return d;
};
const fmtDay = (d) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
const isToday = (d) => d && d.toDateString() === new Date().toDateString();

// ── Aktionen mit Rückgängig ──────────────────────────────────────────────────
// Liefert { label, undo } für die Rückgängig-Leiste oder null (gesperrt)
export function todoActions(uid, todo) {
  const prevStatus = todo.status || "offen";
  const run = (data, label, undoData) => {
    if (!updateTodo(uid, todo.id, data)) { notifyLocked(todo); return null; }
    return { label, undo: () => updateTodo(uid, todo.id, undoData) };
  };
  return {
    toggleDone: () => (todo.status === "erledigt"
      ? run({ status: todo.previousStatus || "offen", previousStatus: null }, `„${todo.title}" wieder offen`, { status: "erledigt" })
      : run({ status: "erledigt", previousStatus: prevStatus }, `„${todo.title}" erledigt`, { status: prevStatus, previousStatus: null })),
    setPrio: (p) => run({ prio: p }, `Priorität ${p}: „${todo.title}"`, { prio: todo.prio || "B" }),
    setWiedervorlage: (date) => run({ wiedervorlage: date },
      date ? `„${todo.title}" auf Wiedervorlage ${fmtDay(date)}` : `Wiedervorlage von „${todo.title}" entfernt`,
      { wiedervorlage: todo.wiedervorlage ?? null }),
    toggleArchive: () => (todo.archived
      ? run({ archived: false }, `„${todo.title}" aus dem Archiv geholt`, { archived: true })
      : run({ archived: true, status: "erledigt" }, `„${todo.title}" archiviert`, { archived: false, status: prevStatus })),
    toggleFavorite: () => {
      setTodoFavorite(uid, todo.id, !todo.favorite);
      return null;
    },
    remove: () => {
      const { id: _id, ...snapshot } = todo;
      deleteTodo(uid, todo.id);
      return {
        label: todo.sharedId ? `„${todo.title}" für dich entfernt` : `„${todo.title}" gelöscht`,
        undo: () => restoreTodo(uid, todo.id, snapshot),
      };
    },
  };
}

// ── Kontextmenü (Rechtsklick / ⋯) ────────────────────────────────────────────
function ContextMenu({ x, y, todo, uid, onClose, onOpen, onOpenWindow, onAction, canOpenWindow }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const a = todoActions(uid, todo);
  const act = (fn) => () => { const info = fn(); if (info) onAction(info); onClose(); };

  // Im Fenster halten
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const wvDays = [[0, "Heute"], [1, "Morgen"], [2, "+2"], [3, "+3"], [7, "+7"]];

  return (
    <div ref={ref} className="menu glass-strong !fixed" style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      <button className="menu-item" onClick={() => { onOpen(todo); onClose(); }}>
        <span className="w-4" /> Öffnen <span className="ml-auto text-[11px] text-slate-400">Eingabe</span>
      </button>
      {canOpenWindow && (
        <button className="menu-item" onClick={() => { onOpenWindow(todo); onClose(); }}>
          <AppWindow size={15} className="text-slate-400" /> In eigenem Fenster
        </button>
      )}
      <div className="menu-sep" />
      <button className="menu-item" onClick={act(a.toggleDone)}>
        {todo.status === "erledigt" ? <RotateCcw size={15} className="text-slate-400" /> : <Check size={15} className="text-emerald-500" />}
        {todo.status === "erledigt" ? "Wieder offen" : "Erledigt"}
        <span className="ml-auto text-[11px] text-slate-400">Leertaste</span>
      </button>
      <button className="menu-item" onClick={act(a.toggleFavorite)}>
        <Star size={15} className={todo.favorite ? "text-amber-400 fill-amber-400" : "text-slate-400"} />
        {todo.favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
      </button>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="text-[12px] text-slate-500 w-[86px]">Priorität</span>
        {["A", "B", "C"].map((p) => (
          <button key={p} onClick={act(() => a.setPrio(p))}
            className={`w-8 h-7 rounded-lg text-[12px] font-bold transition-all ${todo.prio === p ? `${PRIO_DOT[p]} text-white` : "glass-chip text-slate-600"}`}>
            {p}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2.5 py-1.5 flex-wrap">
        <span className="text-[12px] text-slate-500 w-[86px]">Wiedervorlage</span>
        {wvDays.map(([n, label]) => (
          <button key={n} onClick={act(() => a.setWiedervorlage(dayStart(n)))}
            className="px-2 h-7 rounded-lg text-[11px] font-semibold glass-chip text-slate-600 hover:text-indigo-600">
            {label}
          </button>
        ))}
        {todo.wiedervorlage && (
          <button onClick={act(() => a.setWiedervorlage(null))} title="Wiedervorlage entfernen"
            className="px-2 h-7 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-50">✕</button>
        )}
      </div>
      <div className="menu-sep" />
      <button className="menu-item" onClick={act(a.toggleArchive)}>
        {todo.archived ? <ArchiveRestore size={15} className="text-slate-400" /> : <Archive size={15} className="text-amber-500" />}
        {todo.archived ? "Aus dem Archiv holen" : "Archivieren"}
      </button>
      <button className="menu-item menu-item-danger" onClick={act(a.remove)}>
        <Trash2 size={15} /> {todo.sharedId ? "Für mich entfernen" : "Löschen"}
        <span className="ml-auto text-[11px] text-red-300">Entf</span>
      </button>
    </div>
  );
}

// ── Zeile ────────────────────────────────────────────────────────────────────
function Row({ todo, selected, uid, onSelect, onContextMenu, onAction, onOpenWindow, canOpenWindow }) {
  const ref = useRef(null);
  const a = todoActions(uid, todo);
  const done = todo.status === "erledigt";
  const deadline = toDate(todo.deadline);
  const wv = toDate(todo.wiedervorlage);
  const overdue = deadline && !done && deadline < new Date();
  const tags = todoTags(todo);
  const stop = (fn) => (e) => { e.stopPropagation(); const info = fn(); if (info) onAction(info); };

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div ref={ref} role="option" aria-selected={selected}
      onClick={() => onSelect(todo)}
      onDoubleClick={() => canOpenWindow && onOpenWindow(todo)}
      onContextMenu={(e) => { e.preventDefault(); onSelect(todo); onContextMenu(todo, e.clientX, e.clientY); }}
      className={`dt-row group ${selected ? "dt-row-selected" : ""} ${done ? "dt-row-done" : ""}`}>
      <button onClick={stop(a.toggleDone)} title={done ? "Wieder öffnen (Leertaste)" : "Erledigt (Leertaste)"}
        className={`dt-check ${done ? "dt-check-done" : ""}`}>
        {done && <Check size={12} strokeWidth={3.2} />}
      </button>
      <span className={`w-1.5 self-stretch my-1.5 rounded-full flex-shrink-0 ${PRIO_DOT[todo.prio] || PRIO_DOT.B}`} />
      <div className="flex-1 min-w-0 py-0.5">
        <p className={`text-[14px] leading-snug truncate ${done ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>
          {todo.title || "Ohne Titel"}
        </p>
        {(todo.manualStatus || tags.length > 0 || deadline || wv || todo.status === "in Arbeit" || todo.status === "wartend") && (
          <div className="flex items-center gap-2 mt-0.5 min-w-0 text-[11px] text-slate-400 overflow-hidden whitespace-nowrap">
            {(todo.status === "in Arbeit" || todo.status === "wartend") && (
              <span className={`font-semibold ${todo.status === "in Arbeit" ? "text-blue-500" : "text-amber-600"}`}>{todo.status}</span>
            )}
            {todo.manualStatus && <span className="text-violet-600 font-medium truncate max-w-[160px]">● {todo.manualStatus}</span>}
            {deadline && (
              <span className={`inline-flex items-center gap-0.5 ${overdue ? "text-red-500 font-semibold" : ""}`}>
                {overdue ? <TriangleAlert size={11} /> : <CalendarDays size={11} />}{fmtDay(deadline)}
              </span>
            )}
            {wv && (
              <span className={`inline-flex items-center gap-0.5 ${isToday(wv) || wv < new Date() ? "text-indigo-500 font-semibold" : ""}`}>
                <Clock size={11} />{fmtDay(wv)}
              </span>
            )}
            {tags.map((t) => <span key={t} className="text-indigo-400">#{t}</span>)}
          </div>
        )}
      </div>
      <SharedBadge todo={todo} />
      <Star size={15} className={`flex-shrink-0 mx-1.5 ${todo.favorite ? "text-amber-400 fill-amber-400" : "dt-fav-idle"}`} />
      <span className={`text-[10px] font-bold w-6 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${PRIO_TEXT[todo.prio] || PRIO_TEXT.B}`}>
        {todo.prio || "B"}
      </span>
      {/* Schnellaktionen beim Überfahren – ganz rechts, damit ein Klick auf
          die Zeile immer nur auswählt */}
      <div className="dt-row-actions">
        <button onClick={stop(() => a.setWiedervorlage(dayStart(1)))} title="Wiedervorlage morgen" className="btn-icon btn-icon-sm"><Clock size={15} /></button>
        <button onClick={stop(a.toggleArchive)} title={todo.archived ? "Aus dem Archiv holen" : "Archivieren"} className="btn-icon btn-icon-sm">
          {todo.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </button>
        <button onClick={stop(a.remove)} title={todo.sharedId ? "Für mich entfernen (Entf)" : "Löschen (Entf)"} className="btn-icon btn-icon-sm hover:!text-red-600"><Trash2 size={15} /></button>
        <button onClick={stop(a.toggleFavorite)} title={todo.favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
          className={`btn-icon btn-icon-sm ${todo.favorite ? "!text-amber-400" : ""}`}>
          <Star size={15} className={todo.favorite ? "fill-amber-400" : ""} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onContextMenu(todo, r.left, r.bottom + 4); }}
          title="Mehr" className="btn-icon btn-icon-sm"><Ellipsis size={15} /></button>
      </div>
    </div>
  );
}

// Kompakte Desktop-Liste: Auswahl öffnet das 2do rechts im Detailbereich.
// Tastatur (↑ ↓, Leertaste, Entf) steuert die Arbeitsfläche.
export default function DesktopTodoList({ todos, selectedId, uid, onSelect, onAction, onOpenWindow, canOpenWindow }) {
  const [menu, setMenu] = useState(null); // { todo, x, y }
  return (
    <div role="listbox" aria-label="Aufgaben" className="space-y-1">
      {todos.map((t) => (
        <Row key={t.id} todo={t} uid={uid} selected={t.id === selectedId}
          onSelect={onSelect} onAction={onAction} onOpenWindow={onOpenWindow} canOpenWindow={canOpenWindow}
          onContextMenu={(todo, x, y) => setMenu({ todo, x, y })} />
      ))}
      {menu && (
        <ContextMenu {...menu} uid={uid} onClose={() => setMenu(null)}
          onOpen={onSelect} onOpenWindow={onOpenWindow} onAction={onAction} canOpenWindow={canOpenWindow} />
      )}
    </div>
  );
}
