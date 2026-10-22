import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import {
  subscribeTodos, subscribeCategories, subscribeDocLive, pageLockPath, getNoteBreadcrumb,
} from "@/lib/todoService";
import { isDesktop } from "@/lib/desktop";
import LoginPage from "@/components/todo/LoginPage";
import TodoDetail from "@/components/todo/TodoDetail";
import { PageEditor } from "@/components/todo/NotesPanel";

// Eigenes Fenster für ein 2do bzw. eine Notiz (Desktop-App: Windows-Fenster
// mit Mica, Browser: Popup). Route: #/todo/:id, #/note/:bookId/:sectionId/:pageId

function WindowFrame({ title, kind, children }) {
  useEffect(() => {
    document.title = title ? `${title} – 2Do` : "2Do";
  }, [title]);

  // Strg+W schließt das Fenster
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        window.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen flex flex-col relative overflow-hidden">
      <div className="liquid-bg" />
      {isDesktop && (
        <div className="win-titlebar relative z-10 flex-shrink-0">
          <div className="w-6 h-6 rounded-[8px] bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <span className="text-[12px] font-semibold text-slate-600 flex-shrink-0">2Do</span>
          <span className="text-[11px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md flex-shrink-0">{kind === "note" ? "Notiz" : "Aufgabe"}</span>
          {title && <span className="text-[12px] text-slate-400 truncate">{title}</span>}
        </div>
      )}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="flex-1 flex items-center justify-center p-8 text-center">{children}</div>;
}

const Spinner = () => (
  <Centered><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></Centered>
);

function Gone({ text }) {
  return (
    <Centered>
      <div>
        <div className="w-14 h-14 rounded-2xl glass mx-auto mb-3 flex items-center justify-center text-2xl">🗂️</div>
        <p className="text-slate-600 text-sm font-medium">{text}</p>
        <button onClick={() => window.close()} className="mt-4 px-4 py-2 rounded-xl glass-chip text-sm font-semibold text-slate-600">
          Fenster schließen
        </button>
      </div>
    </Centered>
  );
}

// Laden / Anmelden ebenfalls im Fensterrahmen (Titelleiste zum Verschieben)
function useAuthed(render) {
  const { user, loading } = useFirebaseAuth();
  if (loading) return <WindowFrame><Spinner /></WindowFrame>;
  if (!user) return <WindowFrame><div className="flex-1 overflow-y-auto"><LoginPage /></div></WindowFrame>;
  return render(user);
}

export function TodoWindowPage() {
  const { id } = useParams();
  return useAuthed((user) => <TodoWindow uid={user.uid} id={id} />);
}

function TodoWindow({ uid, id }) {
  const [todos, setTodos] = useState(null);
  const [categories, setCategories] = useState([]);
  // Beim ersten Laden einfrieren – der Editor arbeitet mit seinem Formular
  // und bekommt Änderungen von anderswo über die Bearbeitungssperre live
  const [todo, setTodo] = useState(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const a = subscribeTodos(uid, setTodos);
    const b = subscribeCategories(uid, setCategories);
    return () => { a(); b(); };
  }, [uid]);

  useEffect(() => {
    if (!todo && todos) setTodo(todos.find((t) => t.id === id) || null);
  }, [todos, todo, id]);

  const close = () => {
    setClosed(true);
    window.close();
  };

  return (
    <WindowFrame title={todo?.title} kind="todo">
      {closed ? <Gone text="Gespeichert. Du kannst dieses Fenster schließen." />
        : todos === null ? <Spinner />
        : !todo ? <Gone text="Dieses 2do gibt es nicht mehr." />
        : <TodoDetail todo={todo} categories={categories} onClose={close} onDelete={close} layout="window" />}
    </WindowFrame>
  );
}

export function NoteWindowPage() {
  const { bookId, sectionId, pageId } = useParams();
  return useAuthed((user) => <NoteWindow uid={user.uid} bookId={bookId} sectionId={sectionId} pageId={pageId} />);
}

function NoteWindow({ uid, bookId, sectionId, pageId }) {
  // undefined = lädt, null = nicht gefunden
  const [page, setPage] = useState(undefined);
  const [crumb, setCrumb] = useState("");

  useEffect(() => {
    return subscribeDocLive(pageLockPath(uid, bookId, sectionId, pageId), (p) => {
      // erste Fassung einfrieren (Live-Änderungen regelt der Editor selbst)
      setPage((prev) => (prev ? prev : p));
    });
  }, [uid, bookId, sectionId, pageId]);

  useEffect(() => {
    getNoteBreadcrumb(uid, bookId, sectionId)
      .then(({ bookName, sectionName }) => setCrumb([bookName, sectionName].filter(Boolean).join(" › ")));
  }, [uid, bookId, sectionId]);

  return (
    <WindowFrame title={page?.title} kind="note">
      {page === undefined ? <Spinner />
        : page === null ? <Gone text="Diese Notiz gibt es nicht mehr." />
        : <PageEditor uid={uid} bookId={bookId} sectionId={sectionId} page={page} breadcrumb={crumb} layout="window" />}
    </WindowFrame>
  );
}
