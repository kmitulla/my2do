import React, {
  useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useDeferredValue,
} from "react";
import { createPortal } from "react-dom";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import {
  subscribeNotebooks, addNotebook, updateNotebook, deleteNotebook,
  subscribeSections, addSection, updateSection, deleteSection,
  subscribePages, addPage, updatePage, deletePage, getPage, getNoteBreadcrumb,
  copyPage, movePage, copySection, moveSection, getAllNotebookData,
  saveNotesTreeState, getNotesTreeState, pageLockPath,
} from "@/lib/todoService";
import { canOpenWindows, openInWindow } from "@/lib/desktop";
import useEditLock from "@/hooks/useEditLock";
import {
  AppWindow, Lock, ChevronRight, NotebookText, Folder, FileText, Plus, MoreHorizontal,
  Search, X, Maximize2, Minimize2, ArrowLeft, Pencil, Trash2, FolderInput, FilePlus2,
  BookPlus, FolderPlus, PanelLeftClose, PanelLeftOpen, FileDown, History,
} from "lucide-react";
import RichEditor from "./RichEditor";
import SyncIndicator from "./SyncIndicator";
import TimestampInfo from "./TimestampInfo";

const UNTITLED = "Unbenannte Seite";

// ── Kleine Helfer ─────────────────────────────────────────────────────────────
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat / voll */ }
  },
};

// Zuletzt geöffnete Seiten (pro Gerät) – für "weiter, wo ich war" und die Startansicht
const recentKey = (uid) => `my2do.notes.recent.${uid}`;
const loadRecents = (uid) => {
  const list = store.get(recentKey(uid), []);
  return Array.isArray(list) ? list.filter((r) => r?.pageId && r.bookId && r.sectionId) : [];
};
const saveRecents = (uid, list) => { store.set(recentKey(uid), list.slice(0, 8)); return list.slice(0, 8); };
const pushRecent = (uid, entry) => saveRecents(uid, [entry, ...loadRecents(uid).filter((r) => r.pageId !== entry.pageId)]);
const removeRecent = (uid, pageId) => saveRecents(uid, loadRecents(uid).filter((r) => r.pageId !== pageId));
const patchRecent = (uid, pageId, patch) =>
  saveRecents(uid, loadRecents(uid).map((r) => (r.pageId === pageId ? { ...r, ...patch } : r)));

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

// Reiner Text einer Seite (Suche, Wortzahl) – DOMParser führt nichts aus
const textCache = new Map();
function pageText(page) {
  const html = page.content || "";
  const hit = textCache.get(page.id);
  if (hit && hit.html === html) return hit.text;
  let text = "";
  try {
    text = new DOMParser().parseFromString(html, "text/html").body.textContent || "";
  } catch {
    text = html.replace(/<[^>]+>/g, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  textCache.set(page.id, { html, text });
  return text;
}

const countWords = (html) => {
  const text = (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
};

function Highlight({ text, needle }) {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) { parts.push(text.slice(i)); break; }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  return parts;
}

// ── Kontextmenü (Portal, damit es nie abgeschnitten wird) ─────────────────────
// at: { x, y, alignRight? } · items: { label, icon, onClick, danger, confirm } | "---"
function PopMenu({ at, items, onClose, anchor }) {
  const ref = useRef(null);
  const [confirm, setConfirm] = useState(-1);
  const [pos, setPos] = useState({ left: at.x, top: at.y, visibility: "hidden" });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = at.alignRight ? at.x - r.width : at.x;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    let top = at.y;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, (at.top ?? at.y) - r.height - 4);
    setPos({ left, top });
  }, [at]);

  useEffect(() => {
    const down = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose, anchor]);

  return createPortal(
    <div ref={ref} role="menu" className="menu glass-strong !fixed" style={{ ...pos, minWidth: 220 }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      // Portal: React-Ereignisse würden sonst bis zur Zeile im Baum durchreichen
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}>
      {items.filter(Boolean).map((it, i) => (it === "---"
        ? <div key={i} className="menu-sep" />
        : (
          <button key={i} type="button" role="menuitem"
            className={`menu-item ${it.danger ? "menu-item-danger" : ""}`}
            onClick={() => {
              if (it.confirm && confirm !== i) { setConfirm(i); return; }
              onClose();
              it.onClick();
            }}>
            <span className="w-4 flex justify-center opacity-80">{it.icon}</span>
            <span>{it.confirm && confirm === i ? "Wirklich löschen? Nochmal klicken" : it.label}</span>
          </button>
        )))}
    </div>,
    document.body,
  );
}

// Menü am ⋯-Knopf bzw. per Rechtsklick öffnen
function useMenu() {
  const [menu, setMenu] = useState(null); // { at, anchor }
  const close = useCallback(() => setMenu(null), []);
  const fromButton = (e) => {
    e.stopPropagation();
    if (menu) { setMenu(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ at: { x: r.right, y: r.bottom + 4, top: r.top, alignRight: true }, anchor: e.currentTarget });
  };
  const fromContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ at: { x: e.clientX, y: e.clientY, top: e.clientY } });
  };
  return { menu, close, fromButton, fromContext };
}

// Eingabezeile im Baum (neu anlegen / umbenennen)
function TreeInput({ initial = "", placeholder, onCommit, onCancel }) {
  const [val, setVal] = useState(initial);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = val.trim();
    if (v && v !== initial) onCommit(v);
    else onCancel();
  };
  return (
    <input autoFocus value={val} placeholder={placeholder} className="nt-input"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); done.current = true; onCancel(); }
      }} />
  );
}

const Chevron = ({ open }) => (
  <ChevronRight size={14} className={`flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
);

const onRowKey = (fn) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

// ── Seiten-Editor ─────────────────────────────────────────────────────────────
// Bearbeitungssperre: eine Seite ist immer nur in einem Editor bearbeitbar
// (zweites Fenster, anderes Gerät) – dort läuft sie live im Lesemodus mit.
// Im Notizbereich wird erst beim Tippen gesperrt (Ansehen sperrt nicht), im
// eigenen Fenster sofort.
//
// layout: "panel" (Notizbereich) | "sheet" (Handy, Vollbild) | "window"
export function PageEditor({
  uid, bookId, sectionId, page, breadcrumb = "", layout = "panel",
  fullscreen = false, onToggleFullscreen, onPoppedOut, onClose, onDeleted, onRequestMove, onSaved,
  autoFocusTitle = false, treeHidden = false, onToggleTree,
}) {
  const { user, userProfile } = useFirebaseAuth();
  const isWindow = layout === "window";
  const isSheet = layout === "sheet";
  const [title, setTitle] = useState(page.title || "");
  const [content, setContent] = useState(page.content || "");
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(page.updatedAt);
  const [exporting, setExporting] = useState(false);
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const titleRef = useRef(null);
  const editorRef = useRef(null);
  const { menu, close: closeMenu, fromButton } = useMenu();

  const lockPath = useMemo(() => pageLockPath(uid, bookId, sectionId, page.id), [uid, bookId, sectionId, page.id]);
  const { lockState, live, takeOver, activate, gone } = useEditLock({
    path: lockPath, uid, name: userProfile?.displayName || user?.email || "", initial: page, lazy: !isWindow,
  });
  const locked = lockState === "other";
  const readOnly = locked || gone;
  const lockRef = useRef(lockState);
  lockRef.current = lockState;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // Offene Änderungen schreiben (Auto-Save, Seitenwechsel, Fenster schließen)
  const write = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (!Object.keys(patch).length) return;
    setDirty(false);
    // Hat inzwischen ein anderes Fenster/Gerät die Seite übernommen, wird
    // dessen Stand nicht überschrieben
    if (lockRef.current === "other") return;
    updatePage(uid, bookId, sectionId, page.id, patch);
    setLastSaved(new Date());
    onSavedRef.current?.(patch);
  }, [uid, bookId, sectionId, page.id]);

  const writeRef = useRef(write);
  writeRef.current = write;
  useEffect(() => {
    const onHide = () => writeRef.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      writeRef.current(); // beim Umschalten auf eine andere Seite sofort speichern
    };
  }, []);

  const schedule = (patch) => {
    if (readOnly) return;
    Object.assign(pendingRef.current, patch);
    setDirty(true);
    activate();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => writeRef.current(), 700);
  };

  // Stand von anderswo übernehmen (anderes Fenster/Gerät, Umbenennen im Baum),
  // solange hier nichts Ungespeichertes daran hängt
  useEffect(() => {
    if (!live) return;
    const p = pendingRef.current;
    if (!("content" in p)) setContent(live.content || "");
    if (!("title" in p) && document.activeElement !== titleRef.current) setTitle(live.title || "");
    if (!Object.keys(p).length && live.updatedAt) setLastSaved(live.updatedAt);
  }, [live]);

  useEffect(() => {
    if (!autoFocusTitle) return;
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [autoFocusTitle]);

  const canPopOut = !isWindow && canOpenWindows();
  const popOut = () => {
    write();
    openInWindow(`/note/${bookId}/${sectionId}/${page.id}`, "note", title || UNTITLED);
    onPoppedOut?.();
  };

  // Word-Export (.docx) – Bibliothek erst beim Klick nachladen
  const handleWordExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportNoteToDocx } = await import("@/lib/docxExport");
      await exportNoteToDocx({
        title: title || UNTITLED,
        content,
        createdAt: page.createdAt,
        updatedAt: lastSaved,
        breadcrumb,
      });
    } catch (err) {
      console.error("Word-Export fehlgeschlagen:", err);
      alert("Word-Export fehlgeschlagen: " + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  const remove = () => {
    pendingRef.current = {};
    clearTimeout(timerRef.current);
    deletePage(uid, bookId, sectionId, page.id);
    onDeleted?.();
  };

  const words = useMemo(() => countWords(content), [content]);

  const menuItems = [
    onRequestMove && { label: "Verschieben / kopieren …", icon: <FolderInput size={15} />, onClick: () => { write(); onRequestMove(); } },
    { label: "Als Word-Datei exportieren", icon: <FileDown size={15} />, onClick: handleWordExport },
    onDeleted && "---",
    onDeleted && { label: "Seite löschen", icon: <Trash2 size={15} />, danger: true, confirm: true, onClick: remove },
  ].filter(Boolean);

  const status = gone ? ["Gelöscht", "text-slate-400", "bg-slate-300"]
    : locked ? ["Nur lesen", "text-amber-600", "bg-amber-400"]
    : dirty ? ["Speichert …", "text-amber-600", "bg-amber-400 animate-pulse"]
    : ["Gespeichert", "text-emerald-600", "bg-emerald-500"];

  return (
    <div className="flex flex-col h-full min-h-0"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); write(); }
      }}>
      <div className={`flex items-center gap-1 flex-shrink-0 border-b border-slate-200/60 ${isSheet ? "h-12 px-2" : "h-11 px-3"}`}>
        {isSheet && (
          <button onClick={() => { write(); onClose?.(); }} className="btn-icon" title="Zurück zur Übersicht" aria-label="Zurück">
            <ArrowLeft size={19} />
          </button>
        )}
        {onToggleTree && (
          <button onClick={onToggleTree} className="btn-icon btn-icon-sm"
            title={treeHidden ? "Notizbücher einblenden" : "Notizbücher ausblenden (mehr Platz)"}>
            {treeHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-slate-400 px-1" title={breadcrumb}>
          {breadcrumb}
        </span>
        <span className={`flex items-center gap-1.5 text-[11px] font-medium px-1.5 flex-shrink-0 ${status[1]}`} data-save-state={gone ? "gone" : locked ? "locked" : dirty ? "dirty" : "saved"}>
          <span className={`w-1.5 h-1.5 rounded-full ${status[2]}`} />
          <span className={isSheet ? "sr-only" : ""}>{status[0]}</span>
        </span>
        <SyncIndicator compact />
        {!isSheet && (
          <button onClick={handleWordExport} disabled={exporting} title="Als Word-Datei (.docx) exportieren"
            className="btn-icon btn-icon-sm text-indigo-500">
            {exporting
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
              : <FileDown size={16} />}
          </button>
        )}
        {canPopOut && (
          <button onClick={popOut} title="In eigenem Fenster öffnen" className="btn-icon btn-icon-sm">
            <AppWindow size={16} />
          </button>
        )}
        {onToggleFullscreen && (
          <button onClick={onToggleFullscreen} title={fullscreen ? "Vollbild beenden" : "Vollbild"} className="btn-icon btn-icon-sm">
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        {!isWindow && (
          <button onClick={fromButton} title="Weitere Aktionen" aria-label="Weitere Aktionen" className="btn-icon btn-icon-sm">
            <MoreHorizontal size={17} />
          </button>
        )}
        {menu && <PopMenu at={menu.at} anchor={menu.anchor} items={menuItems} onClose={closeMenu} />}
      </div>

      {gone && (
        <div className="flex items-center gap-2.5 mx-3 mt-2 rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
          <Trash2 size={14} className="text-slate-500 flex-shrink-0" />
          <p className="flex-1 text-xs text-slate-600">Diese Seite wurde gelöscht oder verschoben.</p>
          {onClose && (
            <button onClick={onClose} className="px-2.5 py-1 rounded-lg bg-slate-600 text-white text-xs font-semibold">Schließen</button>
          )}
        </div>
      )}
      {locked && !gone && (
        <div className="flex items-center gap-2.5 mx-3 mt-2 rounded-xl bg-amber-50/90 border border-amber-200 px-3 py-2">
          <Lock size={14} className="text-amber-600 flex-shrink-0" />
          <p className="flex-1 text-xs text-amber-800 leading-snug">
            Diese Seite wird gerade in einem anderen Fenster oder auf einem anderen Gerät bearbeitet – hier siehst du sie live mit.
          </p>
          <button onClick={takeOver} className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold flex-shrink-0 hover:bg-amber-600">
            Hier bearbeiten
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <RichEditor ref={editorRef} variant="page" value={content} readOnly={readOnly}
          onChange={(html) => { setContent(html); schedule({ content: html }); }}
          placeholder="Schreib los …  # Überschrift · - Liste · [] Checkliste · Strg+T Zeitmarke"
          minHeight={isWindow || fullscreen ? 520 : 320}
          header={(
            <input ref={titleRef} value={title} readOnly={readOnly} placeholder={UNTITLED}
              aria-label="Seitentitel" className="note-title"
              onChange={(e) => { setTitle(e.target.value); schedule({ title: e.target.value }); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); editorRef.current?.focus(); }
              }} />
          )} />
      </div>

      <div className={`flex items-center gap-3 flex-shrink-0 border-t border-slate-200/60 h-8 ${isSheet ? "px-3" : "px-4"}`}>
        <TimestampInfo createdAt={page.createdAt} updatedAt={lastSaved} className="flex-1 min-w-0" />
        <span className="text-[10px] text-slate-400 flex-shrink-0">{words} {words === 1 ? "Wort" : "Wörter"}</span>
      </div>
    </div>
  );
}

// ── Verschieben / Kopieren ────────────────────────────────────────────────────
function MoveCopyModal({ uid, type, label, notebooks, bookId, sectionId, pageId, onDone, onClose }) {
  const [targetBookId, setTargetBookId] = useState(bookId);
  const [sections, setSections] = useState([]);
  const [targetSectionId, setTargetSectionId] = useState(sectionId || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type !== "page") return;
    return subscribeSections(uid, targetBookId, setSections);
  }, [uid, targetBookId, type]);

  // Abschnitte als eingerückte Liste (inkl. Unterabschnitte)
  const options = useMemo(() => {
    const out = [];
    const walk = (parent, depth) => {
      sections.filter((s) => (s.parentSectionId || null) === parent).forEach((s) => {
        out.push({ id: s.id, label: `${"   ".repeat(depth)}${s.name}` });
        if (depth < 8) walk(s.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  }, [sections]);

  useEffect(() => {
    if (type === "page" && options.length && !options.find((o) => o.id === targetSectionId)) {
      setTargetSectionId(options[0].id);
    }
  }, [options, targetSectionId, type]);

  const same = type === "page" ? targetSectionId === sectionId && targetBookId === bookId : targetBookId === bookId;
  const valid = type === "page" ? !!targetSectionId : !!targetBookId;

  const run = async (action) => {
    setBusy(true);
    try {
      if (type === "page") {
        if (action === "move") await movePage(uid, bookId, sectionId, pageId, targetBookId, targetSectionId);
        else await copyPage(uid, bookId, sectionId, pageId, targetBookId, targetSectionId);
      } else {
        if (action === "move") await moveSection(uid, bookId, sectionId, targetBookId);
        else await copySection(uid, bookId, sectionId, targetBookId, null);
      }
      onDone(action);
    } catch (err) {
      console.error("Verschieben/Kopieren fehlgeschlagen:", err);
      alert("Das hat nicht geklappt: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(6px)" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm" role="dialog" aria-label="Verschieben oder kopieren">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-800">{type === "page" ? "Seite" : "Abschnitt"} verschieben oder kopieren</h3>
            <p className="text-xs text-slate-400 truncate mt-0.5">„{label || UNTITLED}"</p>
          </div>
          <button onClick={onClose} className="btn-icon btn-icon-sm" aria-label="Schließen"><X size={16} /></button>
        </div>

        <label className="section-label block mb-1">Notizbuch</label>
        <select value={targetBookId} onChange={(e) => setTargetBookId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {notebooks.map((nb) => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
        </select>

        {type === "page" && (
          <>
            <label className="section-label block mb-1">Abschnitt</label>
            <select value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {options.length === 0 && <option value="">– keine Abschnitte –</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={() => run("copy")} disabled={busy || !valid}
            className="flex-1 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-50">
            Kopieren
          </button>
          <button onClick={() => run("move")} disabled={busy || !valid || same}
            className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50">
            {busy ? "…" : "Verschieben"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Baum: Notizbuch › Abschnitt (verschachtelt) › Seite ──────────────────────
function PageRow({ ctx, bookId, section, page, depth }) {
  const { menu, close, fromButton, fromContext } = useMenu();
  const active = ctx.selected?.page.id === page.id;
  const renaming = ctx.renaming === page.id;
  const open = () => ctx.openPage({ bookId, sectionId: section.id, sectionName: section.name, page });

  const items = [
    canOpenWindows() && { label: "In eigenem Fenster öffnen", icon: <AppWindow size={15} />, onClick: () => openInWindow(`/note/${bookId}/${section.id}/${page.id}`, "note", page.title || UNTITLED) },
    { label: "Umbenennen", icon: <Pencil size={15} />, onClick: () => ctx.setRenaming(page.id) },
    { label: "Verschieben / kopieren …", icon: <FolderInput size={15} />, onClick: () => ctx.setMoveCopy({ type: "page", label: page.title, pageId: page.id, bookId, sectionId: section.id }) },
    "---",
    { label: "Seite löschen", icon: <Trash2 size={15} />, danger: true, confirm: true, onClick: () => ctx.removePage(bookId, section.id, page.id) },
  ];

  return (
    <div role="treeitem" aria-selected={active} tabIndex={0} data-page-id={page.id}
      className={`nt-row ${active ? "nt-row-active" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}
      onClick={open} onKeyDown={onRowKey(open)} onContextMenu={fromContext}
      onDoubleClick={(e) => { e.stopPropagation(); ctx.setRenaming(page.id); }}>
      <FileText size={14} className={`flex-shrink-0 ${active ? "text-indigo-500" : "text-slate-400"}`} />
      {renaming ? (
        <TreeInput initial={page.title || ""} placeholder={UNTITLED}
          onCommit={(t) => { ctx.setRenaming(null); updatePage(ctx.uid, bookId, section.id, page.id, { title: t }); }}
          onCancel={() => ctx.setRenaming(null)} />
      ) : (
        <span className={`flex-1 min-w-0 truncate ${page.title ? "" : "italic text-slate-400"}`}>{page.title || UNTITLED}</span>
      )}
      <span className={`nt-actions ${menu ? "nt-actions-open" : ""}`}>
        <button type="button" className="nt-act" title="Weitere Aktionen" aria-label="Weitere Aktionen" onClick={fromButton}><MoreHorizontal size={15} /></button>
      </span>
      {menu && <PopMenu at={menu.at} anchor={menu.anchor} items={items} onClose={close} />}
    </div>
  );
}

function SectionNode({ ctx, bookId, section, allSections, depth }) {
  const open = ctx.openIds.has(section.id);
  const [pages, setPages] = useState(null);
  const { menu, close, fromButton, fromContext } = useMenu();
  const renaming = ctx.renaming === section.id;
  const children = allSections.filter((s) => s.parentSectionId === section.id);
  const addingSub = ctx.adding?.type === "section" && ctx.adding.parentId === section.id;
  const containsSelected = ctx.selected?.sectionId === section.id;

  useEffect(() => {
    if (!open) return;
    return subscribePages(ctx.uid, bookId, section.id, setPages);
  }, [ctx.uid, bookId, section.id, open]);

  const target = { bookId, sectionId: section.id, sectionName: section.name };
  const toggle = () => { ctx.toggleOpen(section.id); ctx.setCurrent(target); };
  const descendants = () => {
    const ids = [section.id];
    for (let i = 0; i < ids.length; i++) allSections.forEach((s) => { if (s.parentSectionId === ids[i]) ids.push(s.id); });
    return ids;
  };

  const items = [
    { label: "Neue Seite", icon: <FilePlus2 size={15} />, onClick: () => ctx.createPage(target) },
    { label: "Unterabschnitt anlegen", icon: <FolderPlus size={15} />, onClick: () => { ctx.openMany([section.id]); ctx.setAdding({ type: "section", bookId, parentId: section.id }); } },
    { label: "Umbenennen", icon: <Pencil size={15} />, onClick: () => ctx.setRenaming(section.id) },
    { label: "In anderes Notizbuch …", icon: <FolderInput size={15} />, onClick: () => ctx.setMoveCopy({ type: "section", label: section.name, sectionId: section.id, bookId }) },
    "---",
    { label: "Abschnitt löschen", icon: <Trash2 size={15} />, danger: true, confirm: true, onClick: () => ctx.removeSection(bookId, descendants()) },
  ];

  return (
    <div role="group">
      <div role="treeitem" aria-expanded={open} tabIndex={0} data-section-id={section.id}
        className={`nt-row ${containsSelected && !open ? "text-indigo-700" : ""}`} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={toggle} onKeyDown={onRowKey(toggle)} onContextMenu={fromContext}
        onDoubleClick={(e) => { e.stopPropagation(); ctx.setRenaming(section.id); }}>
        <Chevron open={open} />
        <Folder size={14} className="flex-shrink-0 text-amber-500/80" />
        {renaming ? (
          <TreeInput initial={section.name} placeholder="Name des Abschnitts"
            onCommit={(name) => { ctx.setRenaming(null); updateSection(ctx.uid, bookId, section.id, { name }); }}
            onCancel={() => ctx.setRenaming(null)} />
        ) : (
          <span className="flex-1 min-w-0 truncate font-medium">{section.name}</span>
        )}
        <span className={`nt-actions ${menu ? "nt-actions-open" : ""}`}>
          <button type="button" className="nt-act" title="Neue Seite in diesem Abschnitt" aria-label="Neue Seite"
            onClick={(e) => { e.stopPropagation(); ctx.createPage(target); }}><Plus size={15} /></button>
          <button type="button" className="nt-act" title="Weitere Aktionen" aria-label="Weitere Aktionen" onClick={fromButton}><MoreHorizontal size={15} /></button>
        </span>
        {menu && <PopMenu at={menu.at} anchor={menu.anchor} items={items} onClose={close} />}
      </div>

      {open && (
        <>
          {pages === null && <div className="h-7" />}
          {pages?.map((p) => (
            <PageRow key={p.id} ctx={ctx} bookId={bookId} section={section} page={p} depth={depth + 1} />
          ))}
          {pages?.length === 0 && children.length === 0 && !addingSub && (
            <button type="button" onClick={() => ctx.createPage(target)}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-indigo-600 py-1.5"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              <Plus size={13} /> Erste Seite anlegen
            </button>
          )}
          {children.map((child) => (
            <SectionNode key={child.id} ctx={ctx} bookId={bookId} section={child} allSections={allSections} depth={depth + 1} />
          ))}
          {addingSub && (
            <div className="nt-row" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>
              <Folder size={14} className="flex-shrink-0 text-amber-500/80" />
              <TreeInput placeholder="Name des Unterabschnitts"
                onCommit={(name) => ctx.commitSection(bookId, section.id, name)}
                onCancel={() => ctx.setAdding(null)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NotebookNode({ ctx, notebook }) {
  const open = ctx.openIds.has(notebook.id);
  const [sections, setSections] = useState(null);
  const { menu, close, fromButton, fromContext } = useMenu();
  const renaming = ctx.renaming === notebook.id;
  const addingSection = ctx.adding?.type === "section" && ctx.adding.bookId === notebook.id && !ctx.adding.parentId;

  useEffect(() => {
    if (!open) return;
    return subscribeSections(ctx.uid, notebook.id, setSections);
  }, [ctx.uid, notebook.id, open]);

  const topLevel = (sections || []).filter((s) => !s.parentSectionId);
  const startSection = () => { ctx.openMany([notebook.id]); ctx.setAdding({ type: "section", bookId: notebook.id, parentId: null }); };
  const toggle = () => ctx.toggleOpen(notebook.id);

  const items = [
    { label: "Abschnitt anlegen", icon: <FolderPlus size={15} />, onClick: startSection },
    { label: "Umbenennen", icon: <Pencil size={15} />, onClick: () => ctx.setRenaming(notebook.id) },
    "---",
    { label: "Notizbuch löschen", icon: <Trash2 size={15} />, danger: true, confirm: true, onClick: () => ctx.removeNotebook(notebook.id) },
  ];

  return (
    <div role="group" className="mb-0.5">
      <div role="treeitem" aria-expanded={open} tabIndex={0} data-book-id={notebook.id}
        className="nt-row nt-book" onClick={toggle} onKeyDown={onRowKey(toggle)} onContextMenu={fromContext}
        onDoubleClick={(e) => { e.stopPropagation(); ctx.setRenaming(notebook.id); }}>
        <Chevron open={open} />
        <NotebookText size={15} className="flex-shrink-0 text-indigo-500" />
        {renaming ? (
          <TreeInput initial={notebook.name} placeholder="Name des Notizbuchs"
            onCommit={(name) => { ctx.setRenaming(null); updateNotebook(ctx.uid, notebook.id, { name }); }}
            onCancel={() => ctx.setRenaming(null)} />
        ) : (
          <span className="flex-1 min-w-0 truncate">{notebook.name}</span>
        )}
        <span className={`nt-actions ${menu ? "nt-actions-open" : ""}`}>
          <button type="button" className="nt-act" title="Abschnitt anlegen" aria-label="Abschnitt anlegen"
            onClick={(e) => { e.stopPropagation(); startSection(); }}><FolderPlus size={15} /></button>
          <button type="button" className="nt-act" title="Weitere Aktionen" aria-label="Weitere Aktionen" onClick={fromButton}><MoreHorizontal size={15} /></button>
        </span>
        {menu && <PopMenu at={menu.at} anchor={menu.anchor} items={items} onClose={close} />}
      </div>

      {open && (
        <>
          {topLevel.map((s) => (
            <SectionNode key={s.id} ctx={ctx} bookId={notebook.id} section={s} allSections={sections} depth={1} />
          ))}
          {addingSection && (
            <div className="nt-row" style={{ paddingLeft: 20 }}>
              <Folder size={14} className="flex-shrink-0 text-amber-500/80" />
              <TreeInput placeholder="Name des Abschnitts"
                onCommit={(name) => ctx.commitSection(notebook.id, null, name)}
                onCancel={() => ctx.setAdding(null)} />
            </div>
          )}
          {sections?.length === 0 && !addingSection && (
            <button type="button" onClick={startSection}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-indigo-600 py-1.5 pl-[34px]">
              <Plus size={13} /> Ersten Abschnitt anlegen
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Suche über alle Notizen ───────────────────────────────────────────────────
function searchNotes(data, query) {
  const needle = query.trim().toLowerCase();
  if (!needle || !data) return [];
  const out = [];
  for (const book of data) {
    const byId = new Map(book.sections.map((s) => [s.id, s]));
    for (const section of book.sections) {
      // Pfad bis zum Notizbuch (verschachtelte Abschnitte)
      const chain = [];
      for (let s = section, n = 0; s && n < 10; s = byId.get(s.parentSectionId), n++) chain.unshift(s);
      if (chain[0]?.parentSectionId && !byId.has(chain[0].parentSectionId)) continue; // verwaist
      for (const page of section.pages) {
        const title = page.title || "";
        const text = pageText(page);
        const inTitle = title.toLowerCase().includes(needle);
        const at = text.toLowerCase().indexOf(needle);
        if (!inTitle && at < 0) continue;
        const start = Math.max(0, at - 40);
        out.push({
          key: page.id,
          page,
          bookId: book.id,
          sectionId: section.id,
          sectionName: section.name,
          crumb: [book.name, ...chain.map((s) => s.name)].join(" › "),
          openIds: [book.id, ...chain.map((s) => s.id)],
          snippet: at >= 0 ? `${start > 0 ? "…" : ""}${text.slice(start, at + needle.length + 90)}` : text.slice(0, 110),
          score: (inTitle ? 2 : 0) + (at >= 0 ? 1 : 0),
          time: page.updatedAt?.toMillis?.() || 0,
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || b.time - a.time).slice(0, 60);
}

// ── Notizbereich ──────────────────────────────────────────────────────────────
// fill: volle Höhe des Elternelements (Desktop-App) statt Fensterhöhe
export default function NotesPanel({ fill = false }) {
  const { user } = useFirebaseAuth();
  const uid = user.uid;
  const isMobile = useIsMobile();
  const [notebooks, setNotebooks] = useState(null);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [selected, setSelected] = useState(null); // { bookId, sectionId, sectionName, page, focusTitle }
  const [current, setCurrent] = useState(null); // Abschnitt für "Neue Seite"
  const [adding, setAdding] = useState(null); // { type: "book" } | { type: "section", bookId, parentId }
  const [renaming, setRenaming] = useState(null);
  const [moveCopy, setMoveCopy] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [allData, setAllData] = useState(null);
  const [recents, setRecents] = useState(() => loadRecents(uid));
  const [treeHidden, setTreeHidden] = useState(() => store.get("my2do.notes.treeHidden", false) === true);
  const [treeWidth, setTreeWidth] = useState(() => {
    const w = Number(store.get("my2do.notes.treeWidth", 272));
    return w >= 200 && w <= 460 ? w : 272;
  });
  const searchRef = useRef(null);
  const saveTreeTimer = useRef(null);
  const loadedAt = useRef(0);
  const notebooksRef = useRef(notebooks);
  notebooksRef.current = notebooks;

  useEffect(() => subscribeNotebooks(uid, setNotebooks), [uid]);

  // Aufgeklappte Knoten (geräteübergreifend gespeichert)
  useEffect(() => {
    getNotesTreeState(uid).then((ids) => setOpenIds((prev) => new Set([...ids, ...prev]))).catch(() => {});
  }, [uid]);

  const persistTree = (next) => {
    clearTimeout(saveTreeTimer.current);
    saveTreeTimer.current = setTimeout(() => saveNotesTreeState(uid, [...next]).catch(() => {}), 1000);
  };
  const toggleOpen = useCallback((id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persistTree(next);
      return next;
    });
   
  }, [uid]);
  const openMany = useCallback((ids) => {
    setOpenIds((prev) => {
      if (ids.every((id) => !id || prev.has(id))) return prev;
      const next = new Set(prev);
      ids.forEach((id) => id && next.add(id));
      persistTree(next);
      return next;
    });
   
  }, [uid]);

  const crumbOf = (bookId, sectionName) =>
    [notebooksRef.current?.find((nb) => nb.id === bookId)?.name, sectionName].filter(Boolean).join(" › ");

  const openPage = useCallback((sel) => {
    setSelected(sel);
    if (!sel) return;
    setCurrent({ bookId: sel.bookId, sectionId: sel.sectionId, sectionName: sel.sectionName });
    setRecents(pushRecent(uid, {
      bookId: sel.bookId, sectionId: sel.sectionId, pageId: sel.page.id,
      title: sel.page.title || "", crumb: sel.crumb || crumbOf(sel.bookId, sel.sectionName),
    }));
   
  }, [uid]);

  // Seite aus "Zuletzt geöffnet" laden; gibt es sie nicht mehr, verschwindet sie aus der Liste
  const openRecent = useCallback(async (r, isCancelled = () => false) => {
    const [page, crumb] = await Promise.all([
      getPage(uid, r.bookId, r.sectionId, r.pageId),
      getNoteBreadcrumb(uid, r.bookId, r.sectionId).catch(() => ({})),
    ]);
    if (isCancelled()) return;
    if (!page || !crumb.bookName || !crumb.sectionName) {
      setRecents(removeRecent(uid, r.pageId));
      return;
    }
    openMany([r.bookId, r.sectionId]);
    openPage({
      bookId: r.bookId, sectionId: r.sectionId, sectionName: crumb.sectionName, page,
      crumb: `${crumb.bookName} › ${crumb.sectionName}`,
    });
  }, [uid, openMany, openPage]);

  // Am großen Bildschirm dort weitermachen, wo man aufgehört hat
  useEffect(() => {
    if (window.innerWidth < 640) return;
    const last = loadRecents(uid)[0];
    if (!last) return;
    let cancelled = false;
    openRecent(last, () => cancelled);
    return () => { cancelled = true; };
   
  }, [uid]);

  const createPage = useCallback((target) => {
    if (!target) return;
    const ref = addPage(uid, target.bookId, target.sectionId, "");
    openMany([target.bookId, target.sectionId]);
    setQuery("");
    openPage({
      ...target,
      page: { id: ref.id, title: "", content: "", createdAt: new Date(), updatedAt: new Date() },
      focusTitle: true,
    });
  }, [uid, openMany, openPage]);

  const commitBook = (name) => {
    const ref = addNotebook(uid, name);
    openMany([ref.id]);
    // gleich den ersten Abschnitt benennen
    setAdding({ type: "section", bookId: ref.id, parentId: null });
  };
  const commitSection = (bookId, parentId, name) => {
    const ref = addSection(uid, bookId, name, parentId);
    setAdding(null);
    openMany([bookId, parentId, ref.id]);
    setCurrent({ bookId, sectionId: ref.id, sectionName: name });
  };

  const removePage = (bookId, sectionId, pageId) => {
    deletePage(uid, bookId, sectionId, pageId);
    setRecents(removeRecent(uid, pageId));
    if (selected?.page.id === pageId) setSelected(null);
  };
  const removeSection = (bookId, sectionIds) => {
    deleteSection(uid, bookId, sectionIds[0]);
    if (selected && selected.bookId === bookId && sectionIds.includes(selected.sectionId)) setSelected(null);
    if (current && sectionIds.includes(current.sectionId)) setCurrent(null);
    setRecents(saveRecents(uid, loadRecents(uid).filter((r) => !sectionIds.includes(r.sectionId))));
  };
  const removeNotebook = (bookId) => {
    deleteNotebook(uid, bookId);
    if (selected?.bookId === bookId) setSelected(null);
    if (current?.bookId === bookId) setCurrent(null);
    setRecents(saveRecents(uid, loadRecents(uid).filter((r) => r.bookId !== bookId)));
  };

  // Suche: alle Seiten bei Bedarf laden (max. alle 30 s neu)
  useEffect(() => {
    if (!query.trim()) return;
    if (allData && Date.now() - loadedAt.current < 30000) return;
    loadedAt.current = Date.now();
    getAllNotebookData(uid).then(setAllData).catch((err) => console.error("Notizsuche:", err));
  }, [query, uid, allData]);
  const results = useMemo(() => searchNotes(allData, deferredQuery), [allData, deferredQuery]);
  const needle = deferredQuery.trim().toLowerCase();

  // Tastatur: Strg+N neue Seite, Strg+F Suche (nur solange die Notizen offen sind)
  const keyRef = useRef(null);
  keyRef.current = { current, createPage };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n" && !e.shiftKey && keyRef.current.current) {
        e.preventDefault();
        keyRef.current.createPage(keyRef.current.current);
      } else if (k === "f") {
        e.preventDefault();
        setTreeHidden(false);
        setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 0);
      }
    };
    // Capture: vor den allgemeinen Kürzeln der Desktop-App (Strg+N = neues 2do)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => { store.set("my2do.notes.treeHidden", treeHidden); }, [treeHidden]);

  // Breite der Notizbuch-Leiste ziehen
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = treeWidth;
    let w = startW;
    const move = (ev) => { w = Math.max(200, Math.min(460, startW + ev.clientX - startX)); setTreeWidth(w); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      store.set("my2do.notes.treeWidth", w);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ctx = {
    uid, openIds, toggleOpen, openMany, selected, openPage, setCurrent, createPage,
    adding, setAdding, commitSection, renaming, setRenaming, setMoveCopy,
    removePage, removeSection, removeNotebook,
  };

  const breadcrumb = selected ? crumbOf(selected.bookId, selected.sectionName) : "";

  const sidebar = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 flex-shrink-0">
        <span className="flex-1 text-[13px] font-semibold text-slate-700">Notizbücher</span>
        <button type="button" className="btn-icon btn-icon-sm" disabled={!current}
          title={current ? `Neue Seite in „${current.sectionName}" (Strg+N)` : "Erst einen Abschnitt öffnen"}
          aria-label="Neue Seite" onClick={() => createPage(current)}>
          <FilePlus2 size={16} />
        </button>
        <button type="button" className="btn-icon btn-icon-sm" title="Neues Notizbuch" aria-label="Neues Notizbuch"
          onClick={() => { setQuery(""); setAdding({ type: "book" }); }}>
          <BookPlus size={16} />
        </button>
      </div>
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setQuery(""); e.currentTarget.blur(); }
              if (e.key === "Enter" && results[0]) {
                const r = results[0];
                openMany(r.openIds);
                openPage({ bookId: r.bookId, sectionId: r.sectionId, sectionName: r.sectionName, page: r.page });
              }
            }}
            placeholder="Notizen durchsuchen …" aria-label="Notizen durchsuchen"
            className="glass-input w-full h-8 pl-8 pr-7 rounded-lg text-[13px]" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Suche leeren"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-200/70">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3" role="tree" aria-label="Notizbücher">
        {query.trim() ? (
          <div className="space-y-0.5">
            {!allData && <p className="text-[12px] text-slate-400 px-2 py-3">Suche …</p>}
            {allData && results.length === 0 && (
              <p className="text-[12px] text-slate-400 px-2 py-3">Nichts gefunden für „{query.trim()}".</p>
            )}
            {results.map((r) => (
              <button key={r.key} type="button" data-search-hit={r.page.id}
                onClick={() => {
                  openMany(r.openIds);
                  openPage({ bookId: r.bookId, sectionId: r.sectionId, sectionName: r.sectionName, page: r.page });
                }}
                className={`nt-search-hit w-full text-left px-2.5 py-2 rounded-lg transition-colors ${selected?.page.id === r.page.id ? "bg-indigo-50" : "hover:bg-slate-100/80"}`}>
                <span className="block text-[13px] font-medium text-slate-700 truncate">
                  <Highlight text={r.page.title || UNTITLED} needle={needle} />
                </span>
                <span className="block text-[11px] text-slate-400 truncate">{r.crumb}</span>
                {r.snippet && (
                  <span className="block text-[12px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                    <Highlight text={r.snippet} needle={needle} />
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <>
            {adding?.type === "book" && (
              <div className="nt-row nt-book">
                <NotebookText size={15} className="flex-shrink-0 text-indigo-500 ml-5" />
                <TreeInput placeholder="Name des Notizbuchs" onCommit={commitBook} onCancel={() => setAdding(null)} />
              </div>
            )}
            {notebooks === null && <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" /></div>}
            {notebooks?.length === 0 && adding?.type !== "book" && (
              <div className="text-center px-3 py-8">
                <p className="text-[13px] text-slate-500 font-medium">Noch keine Notizbücher</p>
                <button type="button" onClick={() => setAdding({ type: "book" })}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-[13px] font-semibold hover:bg-indigo-600">
                  <BookPlus size={15} /> Notizbuch anlegen
                </button>
              </div>
            )}
            {notebooks?.map((nb) => <NotebookNode key={nb.id} ctx={ctx} notebook={nb} />)}
          </>
        )}
      </div>
    </div>
  );

  const empty = (
    <div className="h-full overflow-y-auto flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4 text-indigo-500">
          <FileText size={26} strokeWidth={1.6} />
        </div>
        <p className="text-slate-600 text-[15px] font-semibold">Keine Seite geöffnet</p>
        <p className="text-slate-400 text-[13px] mt-1 leading-relaxed">
          Wähle links eine Seite oder lege mit <Plus size={12} className="inline -mt-0.5" /> an einem Abschnitt eine neue an.
        </p>
        {current && (
          <button type="button" onClick={() => createPage(current)}
            className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 text-white text-[13px] font-semibold hover:bg-indigo-600">
            <FilePlus2 size={15} /> Neue Seite in „{current.sectionName}"
          </button>
        )}
        {recents.length > 0 && (
          <div className="mt-7 text-left">
            <p className="section-label flex items-center gap-1.5 px-1 mb-1.5"><History size={12} /> Zuletzt geöffnet</p>
            {recents.slice(0, 6).map((r) => (
              <button key={r.pageId} type="button" onClick={() => openRecent(r)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100/80">
                <FileText size={14} className="text-slate-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-slate-700 truncate">{r.title || UNTITLED}</span>
                  {r.crumb && <span className="block text-[11px] text-slate-400 truncate">{r.crumb}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const editorProps = selected && {
    uid,
    bookId: selected.bookId,
    sectionId: selected.sectionId,
    page: selected.page,
    breadcrumb,
    autoFocusTitle: !!selected.focusTitle,
    onClose: () => setSelected(null),
    onPoppedOut: () => { setFullscreen(false); setSelected(null); },
    onDeleted: () => { setRecents(removeRecent(uid, selected.page.id)); setSelected(null); setFullscreen(false); },
    onRequestMove: () => setMoveCopy({
      type: "page", label: selected.page.title, pageId: selected.page.id,
      bookId: selected.bookId, sectionId: selected.sectionId,
    }),
    onSaved: (patch) => { if ("title" in patch) setRecents(patchRecent(uid, selected.page.id, { title: patch.title })); },
  };

  const moveCopyModal = moveCopy && (
    <MoveCopyModal uid={uid} {...moveCopy} notebooks={notebooks || []}
      onClose={() => setMoveCopy(null)}
      onDone={(action) => {
        if (action === "move" && selected
          && ((moveCopy.type === "page" && selected.page.id === moveCopy.pageId)
            || (moveCopy.type === "section" && selected.sectionId === moveCopy.sectionId))) {
          setSelected(null);
        }
        setMoveCopy(null);
      }} />
  );

  // ── Handy: Liste, Seite öffnet bildschirmfüllend ──
  if (isMobile) {
    return (
      <>
        <div className="glass rounded-[24px] overflow-hidden flex flex-col" style={{ minHeight: "70vh" }}>
          {sidebar}
        </div>
        {selected && createPortal(
          <div className="fixed inset-0 z-50 bg-white flex flex-col"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <PageEditor key={selected.page.id} {...editorProps} layout="sheet" />
          </div>,
          document.body,
        )}
        {moveCopyModal}
      </>
    );
  }

  // ── Browser: Vollbild ──
  if (fullscreen && selected) {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <PageEditor key={selected.page.id} {...editorProps} fullscreen onToggleFullscreen={() => setFullscreen(false)} />
        {moveCopyModal}
      </div>,
      document.body,
    );
  }

  const editorPane = selected
    ? <PageEditor key={selected.page.id} {...editorProps}
        treeHidden={treeHidden} onToggleTree={() => setTreeHidden((v) => !v)}
        onToggleFullscreen={fill ? undefined : () => setFullscreen(true)} />
    : empty;

  // ── Desktop-App: eine Fläche, Leiste links (Breite ziehbar, ausblendbar) ──
  if (fill) {
    return (
      <div className="flex h-full min-h-0">
        {!treeHidden && (
          <aside className="relative flex-shrink-0 border-r border-slate-200/70 bg-slate-50/60" style={{ width: treeWidth }}>
            {sidebar}
            <div onPointerDown={startResize} title="Breite ändern"
              className="absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize z-10 hover:bg-indigo-300/50 transition-colors" />
          </aside>
        )}
        <main className="flex-1 min-w-0 flex flex-col bg-white/70">{editorPane}</main>
        {moveCopyModal}
      </div>
    );
  }

  // ── Browser: zwei Karten ──
  return (
    <div className="flex gap-3" style={{ minHeight: "70vh", height: "calc(100vh - 110px)", maxHeight: "1100px" }}>
      {!treeHidden && (
        <aside className="w-60 xl:w-72 flex-shrink-0 glass rounded-[24px] overflow-hidden">{sidebar}</aside>
      )}
      <main className="flex-1 min-w-0 glass rounded-[24px] overflow-hidden flex flex-col">{editorPane}</main>
      {moveCopyModal}
    </div>
  );
}
