import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import {
  subscribeNotebooks, addNotebook, updateNotebook, deleteNotebook,
  subscribeSections, addSection, updateSection, deleteSection,
  subscribePages, addPage, updatePage, deletePage,
  copyPage, movePage, copySection, moveSection,
  saveNotesTreeState, getNotesTreeState,
} from "@/lib/todoService";
import RichEditor from "./RichEditor";

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const BookIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);
const FolderIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const FileIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);
const FullscreenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
);
const ExitFullscreenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
  </svg>
);
const DotsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
  </svg>
);

// ── Inline editable title ─────────────────────────────────────────────────────
function InlineEdit({ value, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setVal(value); }, [value]);
  const save = () => {
    setEditing(false);
    if (val.trim() && val.trim() !== value) onSave(val.trim());
    else setVal(value);
  };
  if (editing) return (
    <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
      className={`bg-transparent border-b border-indigo-400 outline-none w-full ${className}`} />
  );
  return (
    <span onDoubleClick={() => setEditing(true)} className={`cursor-pointer ${className}`} title="Doppelklick zum Umbenennen">
      {value}
    </span>
  );
}

// ── Move/Copy Picker ──────────────────────────────────────────────────────────
function MoveCopyModal({ uid, type, label, notebooks, currentBookId, currentSectionId, pageId, sectionId, onDone, onClose }) {
  const [targetBookId, setTargetBookId] = useState(currentBookId);
  const [targetSections, setTargetSections] = useState([]);
  const [targetSectionId, setTargetSectionId] = useState(currentSectionId || "");
  const [busy, setBusy] = useState(false);

  // Load sections reactively when targetBook changes (for page moves)
  useEffect(() => {
    if (type !== "page") return;
    let unsub;
    import("@/lib/todoService").then(({ subscribeSections }) => {
      unsub = subscribeSections(uid, targetBookId, (secs) => {
        setTargetSections(secs.filter(s => !s.parentSectionId)); // top-level only for simplicity
        if (!secs.find(s => s.id === targetSectionId)) setTargetSectionId(secs[0]?.id || "");
      });
    });
    return () => unsub?.();
  }, [targetBookId, uid, type]);

  const handleAction = async (action) => {
    setBusy(true);
    try {
      if (type === "page") {
        if (action === "move") await movePage(uid, currentBookId, currentSectionId, pageId, targetBookId, targetSectionId);
        else await copyPage(uid, currentBookId, currentSectionId, pageId, targetBookId, targetSectionId);
      } else if (type === "section") {
        if (action === "move") await moveSection(uid, currentBookId, sectionId, targetBookId);
        else await copySection(uid, currentBookId, sectionId, targetBookId, null);
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">„{label}" verschieben / kopieren</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Ziel-Notizbuch</label>
        <select value={targetBookId} onChange={(e) => setTargetBookId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          {notebooks.map(nb => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
        </select>

        {type === "page" && (
          <>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Ziel-Abschnitt</label>
            <select value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {targetSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={() => handleAction("copy")} disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-100 disabled:opacity-50">
            Kopieren
          </button>
          <button onClick={() => handleAction("move")} disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
            {busy ? "…" : "Verschieben"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Context Menu (⋯ button dropdown) ─────────────────────────────────────────
function ContextMenu({ items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-7 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[140px]">
      {items.map((item, i) => (
        item === "---"
          ? <div key={i} className="border-t border-slate-100 my-1" />
          : <button key={i} onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-all ${item.danger ? "text-red-500" : "text-slate-700"}`}>
              {item.label}
            </button>
      ))}
    </div>
  );
}

// ── Page Editor ───────────────────────────────────────────────────────────────
function PageEditor({ uid, bookId, sectionId, page, fullscreen, onToggleFullscreen }) {
  const [content, setContent] = useState(page.content || "");
  const [saved, setSaved] = useState(true);
  const timerRef = useRef(null);
  const richEditorRef = useRef(null);

  useEffect(() => {
    setContent(page.content || "");
    setSaved(true);
  }, [page.id]);

  const handleChange = useCallback((val) => {
    setContent(val);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await updatePage(uid, bookId, sectionId, page.id, { content: val });
      setSaved(true);
    }, 800);
  }, [uid, bookId, sectionId, page.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 flex-shrink-0 gap-2">
        <span className="text-xs font-semibold text-slate-600 truncate flex-1">{page.title}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-medium transition-colors ${saved ? "text-emerald-500" : "text-amber-400"}`}>
            {saved ? "✓ gespeichert" : "● speichert…"}
          </span>
          <button onClick={onToggleFullscreen} title={fullscreen ? "Vollbild beenden" : "Vollbild"}
            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-all">
            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <RichEditor ref={richEditorRef} value={content} onChange={handleChange}
          placeholder="Hier tippen… (Strg+T für Zeitmarke)"
          minHeight={fullscreen ? 600 : 300} />
      </div>
    </div>
  );
}

// ── Section tree (recursive) ──────────────────────────────────────────────────
function SectionNode({ uid, bookId, section, allSections, depth = 0, selectedPage, onSelectPage, notebooks, openIds, onToggleOpen, onMoveCopy }) {
  const open = openIds.has(section.id);
  const [pages, setPages] = useState([]);
  const [addingPage, setAddingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [addingSubsection, setAddingSubsection] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!open) return;
    return subscribePages(uid, bookId, section.id, setPages);
  }, [uid, bookId, section.id, open]);

  const children = allSections.filter((s) => s.parentSectionId === section.id);

  const handleAddPage = async () => {
    const t = newPageTitle.trim();
    if (!t) return;
    await addPage(uid, bookId, section.id, t);
    setNewPageTitle(""); setAddingPage(false);
  };

  const handleAddSubsection = async () => {
    const n = newSubName.trim();
    if (!n) return;
    await addSection(uid, bookId, n, section.id);
    setNewSubName(""); setAddingSubsection(false);
  };

  const handleDeleteSection = async () => {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
    await deleteSection(uid, bookId, section.id);
  };

  const indent = depth * 10;

  const menuItems = [
    { label: "Seite hinzufügen", onClick: () => { onToggleOpen(section.id, true); setAddingPage(true); } },
    { label: "Unterabschnitt", onClick: () => { onToggleOpen(section.id, true); setAddingSubsection(true); } },
    "---",
    { label: "In anderes Buch verschieben/kopieren", onClick: () => onMoveCopy({ type: "section", label: section.name, sectionId: section.id, bookId }) },
    "---",
    { label: confirmDel ? "Wirklich löschen?" : "Löschen", danger: true, onClick: handleDeleteSection },
  ];

  return (
    <div style={{ marginLeft: indent }}>
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl group hover:bg-slate-100/80 transition-all relative">
        {/* Clickable area: chevron + icon + name all toggle open */}
        <button onClick={() => onToggleOpen(section.id)} className="flex items-center gap-1 flex-1 min-w-0 text-left">
          <span className="text-slate-400 flex-shrink-0 w-4 h-4 flex items-center justify-center">
            <ChevronIcon open={open} />
          </span>
          <span className="text-slate-400 flex-shrink-0"><FolderIcon /></span>
          <InlineEdit value={section.name}
            onSave={(name) => updateSection(uid, bookId, section.id, { name })}
            className="text-xs font-medium text-slate-700 flex-1 min-w-0" />
        </button>
        {/* Context menu button */}
        <div className="relative flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
            className="w-5 h-5 rounded-md text-slate-400 flex items-center justify-center hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-all">
            <DotsIcon />
          </button>
          {showMenu && <ContextMenu items={menuItems} onClose={() => setShowMenu(false)} />}
        </div>
      </div>

      {addingSubsection && (
        <div style={{ marginLeft: 16 + indent }} className="flex gap-1 items-center py-1 pr-2">
          <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddSubsection(); if (e.key === "Escape") { setAddingSubsection(false); setNewSubName(""); } }}
            placeholder="Unterabschnitt…" autoFocus
            className="flex-1 px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <button onClick={handleAddSubsection} className="px-2 py-1 rounded-lg bg-slate-500 text-white text-xs">↵</button>
        </div>
      )}

      {open && (
        <div>
          {pages.map((p) => (
            <PageRow key={p.id} uid={uid} bookId={bookId} sectionId={section.id} page={p}
              selectedPage={selectedPage} onSelectPage={onSelectPage}
              notebooks={notebooks} indent={16} onMoveCopy={onMoveCopy} />
          ))}

          {addingPage && (
            <div style={{ marginLeft: 16 }} className="flex gap-1 items-center py-1 pr-2">
              <input value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") { setAddingPage(false); setNewPageTitle(""); } }}
                placeholder="Seitenname…" autoFocus
                className="flex-1 px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={handleAddPage} className="px-2 py-1 rounded-lg bg-indigo-500 text-white text-xs">↵</button>
            </div>
          )}

          {children.map((child) => (
            <SectionNode key={child.id} uid={uid} bookId={bookId} section={child}
              allSections={allSections} depth={depth + 1}
              selectedPage={selectedPage} onSelectPage={onSelectPage}
              notebooks={notebooks} openIds={openIds} onToggleOpen={onToggleOpen} onMoveCopy={onMoveCopy} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page row ─────────────────────────────────────────────────────────────────
function PageRow({ uid, bookId, sectionId, page, selectedPage, onSelectPage, notebooks, indent, onMoveCopy }) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
    await deletePage(uid, bookId, sectionId, page.id);
    if (selectedPage?.page.id === page.id) onSelectPage(null);
  };

  const menuItems = [
    { label: "In anderen Abschnitt verschieben/kopieren", onClick: () => onMoveCopy({ type: "page", label: page.title, pageId: page.id, bookId, sectionId }) },
    "---",
    { label: confirmDel ? "Wirklich löschen?" : "Löschen", danger: true, onClick: handleDelete },
  ];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl group transition-all cursor-pointer relative ${
      selectedPage?.page.id === page.id ? "bg-indigo-100 text-indigo-700" : "hover:bg-slate-100/80 text-slate-600"
    }`} style={{ marginLeft: indent }} onClick={() => onSelectPage({ page, bookId, sectionId })}>
      <span className="flex-shrink-0 text-slate-400"><FileIcon /></span>
      <span className="text-xs flex-1 truncate">{page.title}</span>
      <div className="relative flex-shrink-0">
        <button onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 transition-all">
          <DotsIcon />
        </button>
        {showMenu && <ContextMenu items={menuItems} onClose={() => setShowMenu(false)} />}
      </div>
    </div>
  );
}

// ── Notebook node ─────────────────────────────────────────────────────────────
function NotebookNode({ uid, notebook, selectedPage, onSelectPage, notebooks, openIds, onToggleOpen, onMoveCopy }) {
  const open = openIds.has(notebook.id);
  const [sections, setSections] = useState([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!open) return;
    return subscribeSections(uid, notebook.id, setSections);
  }, [uid, notebook.id, open]);

  const topLevelSections = sections.filter((s) => !s.parentSectionId);

  const handleAddSection = async () => {
    const n = newSectionName.trim();
    if (!n) return;
    await addSection(uid, notebook.id, n, null);
    setNewSectionName(""); setAddingSection(false);
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
    await deleteNotebook(uid, notebook.id);
  };

  const menuItems = [
    { label: "Abschnitt hinzufügen", onClick: () => { onToggleOpen(notebook.id, true); setAddingSection(true); } },
    "---",
    { label: confirmDel ? "Wirklich löschen?" : "Löschen", danger: true, onClick: handleDelete },
  ];

  return (
    <div className="mb-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl group transition-all relative ${open ? "bg-indigo-50 border border-indigo-100" : "hover:bg-slate-100/80"}`}>
        {/* Clickable area: chevron + icon + name */}
        <button onClick={() => onToggleOpen(notebook.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className="text-indigo-400 flex-shrink-0"><ChevronIcon open={open} /></span>
          <span className="text-indigo-400 flex-shrink-0"><BookIcon /></span>
          <InlineEdit value={notebook.name}
            onSave={(name) => updateNotebook(uid, notebook.id, { name })}
            className="text-sm font-semibold text-slate-800 flex-1 min-w-0" />
        </button>
        {/* Context menu */}
        <div className="relative flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
            className="w-6 h-6 rounded-lg text-slate-400 flex items-center justify-center hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-all">
            <DotsIcon />
          </button>
          {showMenu && <ContextMenu items={menuItems} onClose={() => setShowMenu(false)} />}
        </div>
      </div>

      {open && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {topLevelSections.map((s) => (
            <SectionNode key={s.id} uid={uid} bookId={notebook.id} section={s}
              allSections={sections} depth={0}
              selectedPage={selectedPage} onSelectPage={onSelectPage}
              notebooks={notebooks} openIds={openIds} onToggleOpen={onToggleOpen} onMoveCopy={onMoveCopy} />
          ))}

          {addingSection && (
            <div className="flex gap-1 items-center py-1 px-2">
              <input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
                placeholder="Abschnittsname…" autoFocus
                className="flex-1 px-2 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={handleAddSection} className="px-2 py-1.5 rounded-xl bg-indigo-500 text-white text-xs">↵</button>
            </div>
          )}

          {topLevelSections.length === 0 && !addingSection && (
            <p className="text-[11px] text-slate-400 px-3 py-1">Noch keine Abschnitte. Tippe auf ⋯ um einen hinzuzufügen.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mobile Page Modal ─────────────────────────────────────────────────────────
function PageModal({ uid, selectedPage, onClose }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-2xl flex flex-col">
        <PageEditor uid={uid} bookId={selectedPage.bookId} sectionId={selectedPage.sectionId}
          page={selectedPage.page} fullscreen={true} onToggleFullscreen={() => setFullscreen(false)} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(12px)" }}>
      <div className="w-full bg-white rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: "92vh" }}>
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-700 truncate">{selectedPage.page.title}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PageEditor uid={uid} bookId={selectedPage.bookId} sectionId={selectedPage.sectionId}
            page={selectedPage.page} fullscreen={false} onToggleFullscreen={() => setFullscreen(true)} />
        </div>
      </div>
    </div>
  );
}

// ── Main NotesPanel ───────────────────────────────────────────────────────────
export default function NotesPanel() {
  const { user } = useFirebaseAuth();
  const [notebooks, setNotebooks] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [addingBook, setAddingBook] = useState(false);
  const [newBookName, setNewBookName] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [moveCopyTarget, setMoveCopyTarget] = useState(null); // { type, label, ... }

  // Persistent open/close state — stored as a Set of IDs
  const [openIds, setOpenIds] = useState(new Set());
  const saveTimerRef = useRef(null);

  // Reactive mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load openIds from Firestore on mount
  useEffect(() => {
    getNotesTreeState(user.uid).then((ids) => setOpenIds(new Set(ids)));
  }, [user.uid]);

  // Toggle open state, persist with debounce
  const handleToggleOpen = useCallback((id, forceOpen = false) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (forceOpen) next.add(id);
      else if (next.has(id)) next.delete(id);
      else next.add(id);
      // Debounced save
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveNotesTreeState(user.uid, [...next]);
      }, 1000);
      return next;
    });
  }, [user.uid]);

  useEffect(() => subscribeNotebooks(user.uid, setNotebooks), [user.uid]);

  const handleAddBook = async () => {
    const n = newBookName.trim();
    if (!n) return;
    const ref = await addNotebook(user.uid, n);
    setNewBookName(""); setAddingBook(false);
  };

  // Desktop fullscreen overlay
  if (!isMobile && fullscreen && selectedPage) {
    return (
      <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-2xl flex flex-col">
        <PageEditor uid={user.uid} bookId={selectedPage.bookId} sectionId={selectedPage.sectionId}
          page={selectedPage.page} fullscreen={true} onToggleFullscreen={() => setFullscreen(false)} />
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Notizbücher</span>
        <button onClick={() => setAddingBook(!addingBook)}
          className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center hover:bg-indigo-200 transition-all">
          <PlusIcon />
        </button>
      </div>

      {addingBook && (
        <div className="flex gap-1 items-center px-2 py-2 border-b border-slate-100">
          <input value={newBookName} onChange={(e) => setNewBookName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddBook(); if (e.key === "Escape") { setAddingBook(false); setNewBookName(""); } }}
            placeholder="Notizbuchname…" autoFocus
            className="flex-1 px-2 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <button onClick={handleAddBook} className="px-2 py-1.5 rounded-xl bg-indigo-500 text-white text-xs">↵</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {notebooks.length === 0 && !addingBook && (
          <p className="text-[11px] text-slate-400 px-2 py-3 text-center">Klick auf + um dein erstes Notizbuch zu erstellen.</p>
        )}
        {notebooks.map((nb) => (
          <NotebookNode key={nb.id} uid={user.uid} notebook={nb}
            selectedPage={selectedPage} onSelectPage={setSelectedPage}
            notebooks={notebooks} openIds={openIds} onToggleOpen={handleToggleOpen}
            onMoveCopy={setMoveCopyTarget} />
        ))}
      </div>
    </>
  );

  return (
    <>
      {isMobile ? (
        <>
          <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 flex flex-col overflow-hidden" style={{ minHeight: "70vh" }}>
            {sidebarContent}
          </div>
          {selectedPage && (
            <PageModal uid={user.uid} selectedPage={selectedPage} onClose={() => setSelectedPage(null)} />
          )}
        </>
      ) : (
        <div className="flex gap-3" style={{ minHeight: "70vh", height: "calc(100vh - 220px)", maxHeight: "900px" }}>
          <div className="w-52 xl:w-64 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 flex flex-col overflow-hidden">
            {sidebarContent}
          </div>
          <div className="flex-1 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 overflow-hidden flex flex-col">
            {selectedPage ? (
              <PageEditor uid={user.uid} bookId={selectedPage.bookId} sectionId={selectedPage.sectionId}
                page={selectedPage.page} fullscreen={false} onToggleFullscreen={() => setFullscreen(true)} />
            ) : (
              <div className="flex items-center justify-center h-full text-center px-6 py-12">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm font-medium mb-1">Keine Seite ausgewählt</p>
                  <p className="text-slate-400 text-xs">Wähle eine Seite aus der linken Leiste.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move/Copy Modal */}
      {moveCopyTarget && (
        <MoveCopyModal
          uid={user.uid}
          {...moveCopyTarget}
          notebooks={notebooks}
          onDone={() => setMoveCopyTarget(null)}
          onClose={() => setMoveCopyTarget(null)}
        />
      )}
    </>
  );
}