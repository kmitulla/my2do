import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import {
  subscribeNotebooks, addNotebook, updateNotebook, deleteNotebook,
  subscribeSections, addSection, updateSection, deleteSection,
  subscribePages, addPage, updatePage, deletePage,
} from "@/lib/todoService";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// ── tiny icon helpers ────────────────────────────────────────────────────────
const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ── Inline editable title ────────────────────────────────────────────────────
function InlineEdit({ value, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setVal(value); }, [value]);
  const save = () => { setEditing(false); if (val.trim() && val.trim() !== value) onSave(val.trim()); else setVal(value); };
  if (editing) return (
    <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
      onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
      className={`bg-transparent border-b border-indigo-400 outline-none w-full ${className}`} />
  );
  return <span onDoubleClick={() => setEditing(true)} className={`cursor-pointer ${className}`} title="Doppelklick zum Umbenennen">{value}</span>;
}

// ── Page Editor ──────────────────────────────────────────────────────────────
function PageEditor({ uid, bookId, sectionId, page }) {
  const [content, setContent] = useState(page.content || "");
  const [saved, setSaved] = useState(true);
  const timerRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => { setContent(page.content || ""); setSaved(true); }, [page.id]);

  const handleChange = (e) => {
    setContent(e.target.value);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await updatePage(uid, bookId, sectionId, page.id, { content: e.target.value });
      setSaved(true);
    }, 800);
  };

  const insertTimestamp = () => {
    const ts = format(new Date(), "dd.MM.yyyy HH:mm", { locale: de });
    const ta = editorRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = content.slice(0, start) + `[${ts}] ` + content.slice(end);
    setContent(newVal);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await updatePage(uid, bookId, sectionId, page.id, { content: newVal });
      setSaved(true);
    }, 800);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + ts.length + 3;
      ta.focus();
    }, 10);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-xs text-slate-400 font-medium">{page.title}</span>
        <div className="flex items-center gap-2">
          <button onClick={insertTimestamp}
            className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-100 transition-all font-medium flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Zeitmarke
          </button>
          <span className={`text-[10px] font-medium transition-colors ${saved ? "text-emerald-400" : "text-amber-400"}`}>
            {saved ? "✓ gespeichert" : "● speichert…"}
          </span>
        </div>
      </div>
      <textarea ref={editorRef} value={content} onChange={handleChange}
        placeholder="Hier tippen…"
        className="flex-1 w-full p-3 text-sm text-slate-700 bg-transparent resize-none focus:outline-none leading-relaxed min-h-[200px]" />
    </div>
  );
}

// ── Section tree (recursive) ─────────────────────────────────────────────────
function SectionNode({ uid, bookId, section, allSections, depth = 0, selectedPage, onSelectPage }) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState([]);
  const [addingPage, setAddingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [addingSubsection, setAddingSubsection] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    return subscribePages(uid, bookId, section.id, setPages);
  }, [uid, bookId, section.id, open]);

  const children = allSections.filter((s) => s.parentSectionId === section.id);

  const handleAddPage = async () => {
    const t = newPageTitle.trim();
    if (!t) return;
    const ref = await addPage(uid, bookId, section.id, t);
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

  const indent = depth * 12;

  return (
    <div style={{ marginLeft: indent }}>
      {/* Section header */}
      <div className={`flex items-center gap-1 px-2 py-1.5 rounded-xl group cursor-pointer hover:bg-slate-100/80 transition-all`}>
        <button onClick={() => setOpen(!open)} className="text-slate-400 flex-shrink-0 w-4 h-4 flex items-center justify-center">
          <ChevronIcon open={open} />
        </button>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <InlineEdit value={section.name}
          onSave={(name) => updateSection(uid, bookId, section.id, { name })}
          className="text-xs font-medium text-slate-700 flex-1 min-w-0" />
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={() => setAddingPage(!addingPage)} title="Seite hinzufügen"
            className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-500 flex items-center justify-center hover:bg-indigo-100">
            <PlusIcon />
          </button>
          <button onClick={() => setAddingSubsection(!addingSubsection)} title="Unterabschnitt"
            className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 text-[10px]">↳</button>
          <button onClick={handleDeleteSection}
            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${confirmDel ? "bg-red-500 text-white" : "bg-red-50 text-red-400 hover:bg-red-100"}`}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Add subsection input */}
      {addingSubsection && (
        <div style={{ marginLeft: 16 + indent }} className="flex gap-1 items-center py-1 pr-2">
          <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddSubsection(); if (e.key === "Escape") { setAddingSubsection(false); setNewSubName(""); } }}
            placeholder="Unterabschnitt Name…" autoFocus
            className="flex-1 px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <button onClick={handleAddSubsection} className="px-2 py-1 rounded-lg bg-slate-500 text-white text-xs">↵</button>
        </div>
      )}

      {open && (
        <div>
          {/* Pages */}
          {pages.map((p) => (
            <button key={p.id} onClick={() => onSelectPage({ page: p, bookId, sectionId: section.id })}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-left group transition-all ${
                selectedPage?.page.id === p.id ? "bg-indigo-100 text-indigo-700" : "hover:bg-slate-100/80 text-slate-600"
              }`} style={{ marginLeft: 16 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="text-xs flex-1 truncate">{p.title}</span>
              <button onClick={async (e) => { e.stopPropagation(); await deletePage(uid, bookId, section.id, p.id); if (selectedPage?.page.id === p.id) onSelectPage(null); }}
                className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 flex-shrink-0">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </button>
          ))}

          {/* Add page input */}
          {addingPage && (
            <div style={{ marginLeft: 16 }} className="flex gap-1 items-center py-1 pr-2">
              <input value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") { setAddingPage(false); setNewPageTitle(""); } }}
                placeholder="Seitenname…" autoFocus
                className="flex-1 px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <button onClick={handleAddPage} className="px-2 py-1 rounded-lg bg-indigo-500 text-white text-xs">↵</button>
            </div>
          )}

          {/* Child sections (recursive) */}
          {children.map((child) => (
            <SectionNode key={child.id} uid={uid} bookId={bookId} section={child}
              allSections={allSections} depth={depth + 1}
              selectedPage={selectedPage} onSelectPage={onSelectPage} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notebook node ────────────────────────────────────────────────────────────
function NotebookNode({ uid, notebook, selectedPage, onSelectPage }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

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

  return (
    <div className="mb-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl group cursor-pointer transition-all ${open ? "bg-indigo-50 border border-indigo-100" : "hover:bg-slate-100/80"}`}>
        <button onClick={() => setOpen(!open)} className="text-indigo-400 flex-shrink-0">
          <ChevronIcon open={open} />
        </button>
        <span className="text-base">📔</span>
        <InlineEdit value={notebook.name}
          onSave={(name) => updateNotebook(uid, notebook.id, { name })}
          className="text-sm font-semibold text-slate-800 flex-1 min-w-0" />
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={() => setAddingSection(!addingSection)} title="Abschnitt hinzufügen"
            className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center hover:bg-indigo-200">
            <PlusIcon />
          </button>
          <button onClick={handleDelete}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${confirmDel ? "bg-red-500 text-white" : "bg-red-50 text-red-400 hover:bg-red-100"}`}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {open && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {topLevelSections.map((s) => (
            <SectionNode key={s.id} uid={uid} bookId={notebook.id} section={s}
              allSections={sections} depth={0}
              selectedPage={selectedPage} onSelectPage={onSelectPage} />
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
            <p className="text-[11px] text-slate-400 px-3 py-1">Noch keine Abschnitte. Klick auf + um einen hinzuzufügen.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main NotesPanel ──────────────────────────────────────────────────────────
export default function NotesPanel() {
  const { user } = useFirebaseAuth();
  const [notebooks, setNotebooks] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null); // { page, bookId, sectionId }
  const [addingBook, setAddingBook] = useState(false);
  const [newBookName, setNewBookName] = useState("");

  useEffect(() => subscribeNotebooks(user.uid, setNotebooks), [user.uid]);

  const handleAddBook = async () => {
    const n = newBookName.trim();
    if (!n) return;
    await addNotebook(user.uid, n);
    setNewBookName(""); setAddingBook(false);
  };

  return (
    <div className="flex gap-3 h-full" style={{ minHeight: "60vh" }}>
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-2 flex flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Notizbücher</span>
          <button onClick={() => setAddingBook(!addingBook)}
            className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center hover:bg-indigo-200 transition-all">
            <PlusIcon />
          </button>
        </div>

        {addingBook && (
          <div className="flex gap-1 items-center px-1">
            <input value={newBookName} onChange={(e) => setNewBookName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddBook(); if (e.key === "Escape") { setAddingBook(false); setNewBookName(""); } }}
              placeholder="Notizbuchname…" autoFocus
              className="flex-1 px-2 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <button onClick={handleAddBook} className="px-2 py-1.5 rounded-xl bg-indigo-500 text-white text-xs">↵</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-0.5">
          {notebooks.length === 0 && !addingBook && (
            <p className="text-[11px] text-slate-400 px-2 py-2">Klick auf + um dein erstes Notizbuch zu erstellen.</p>
          )}
          {notebooks.map((nb) => (
            <NotebookNode key={nb.id} uid={user.uid} notebook={nb}
              selectedPage={selectedPage} onSelectPage={setSelectedPage} />
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 overflow-hidden">
        {selectedPage ? (
          <PageEditor
            uid={user.uid}
            bookId={selectedPage.bookId}
            sectionId={selectedPage.sectionId}
            page={selectedPage.page}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-center px-6 py-12">
            <div>
              <div className="text-5xl mb-4">📝</div>
              <p className="text-slate-400 text-sm">Wähle eine Seite aus der linken Leiste aus oder erstelle ein neues Notizbuch.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}