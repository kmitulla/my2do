import React from "react";
import { updateTodo } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIO_STYLES = {
  A: { bar: "bg-red-500", badge: "bg-red-100 text-red-600 border-red-200", label: "Prio A" },
  B: { bar: "bg-orange-400", badge: "bg-orange-100 text-orange-600 border-orange-200", label: "Prio B" },
  C: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-600 border-emerald-200", label: "Prio C" },
};

const STATUS_STYLES = {
  offen: "bg-slate-100 text-slate-600",
  "in Arbeit": "bg-blue-100 text-blue-600",
  erledigt: "bg-emerald-100 text-emerald-600",
  wartend: "bg-amber-100 text-amber-600",
};

function formatDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "dd.MM.yy", { locale: de });
}

export default function TodoCard({ todo, view, onClick, onDelete }) {
  const { user } = useFirebaseAuth();
  const prio = PRIO_STYLES[todo.prio] || PRIO_STYLES.B;
  const isOverdue = todo.deadline && !["erledigt"].includes(todo.status) &&
    (todo.deadline.toDate ? todo.deadline.toDate() : new Date(todo.deadline)) < new Date();

  const toggleDone = async (e) => {
    e.stopPropagation();
    const newStatus = todo.status === "erledigt" ? "offen" : "erledigt";
    await updateTodo(user.uid, todo.id, { status: newStatus });
  };

  if (view === "grid") {
    return (
      <div
        onClick={() => onClick(todo)}
        className="relative bg-white/65 backdrop-blur-xl rounded-2xl border border-white/70 shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer overflow-hidden group"
      >
        <div className={`absolute top-0 left-0 w-1 h-full ${prio.bar} rounded-l-2xl`} />
        <div className="p-3.5 pl-4">
          <div className="flex items-start gap-2">
            <button onClick={toggleDone} className="mt-0.5 flex-shrink-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                todo.status === "erledigt" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-400"
              }`}>
                {todo.status === "erledigt" && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>
                )}
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold text-slate-800 leading-snug line-clamp-2 ${todo.status === "erledigt" ? "line-through opacity-50" : ""}`}>
                {todo.title}
              </p>
              {todo.description && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{todo.description}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${prio.badge}`}>{prio.label}</span>
                {todo.status && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[todo.status] || STATUS_STYLES.offen}`}>{todo.status}</span>}
                {todo.category && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">{todo.category}</span>}
              </div>
              {todo.deadline && (
                <p className={`text-[10px] mt-1.5 font-medium ${isOverdue ? "text-red-500" : "text-slate-400"}`}>
                  📅 {formatDate(todo.deadline)}{isOverdue ? " · überfällig" : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      onClick={() => onClick(todo)}
      className="relative bg-white/65 backdrop-blur-xl rounded-2xl border border-white/70 shadow-sm hover:shadow-md hover:scale-[1.002] active:scale-[0.999] transition-all cursor-pointer overflow-hidden group flex items-center gap-3 px-4 py-3"
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${prio.bar}`} />
      <button onClick={toggleDone} className="flex-shrink-0 pl-1">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          todo.status === "erledigt" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-400"
        }`}>
          {todo.status === "erledigt" && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>
          )}
        </div>
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-slate-800 truncate ${todo.status === "erledigt" ? "line-through opacity-50" : ""}`}>
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${prio.badge}`}>{prio.label}</span>
          {todo.status && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[todo.status] || STATUS_STYLES.offen}`}>{todo.status}</span>}
          {todo.category && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">{todo.category}</span>}
          {todo.deadline && <span className={`text-[10px] font-medium ${isOverdue ? "text-red-500" : "text-slate-400"}`}>📅 {formatDate(todo.deadline)}{isOverdue ? " · überfällig" : ""}</span>}
          {todo.wiedervorlage && <span className="text-[10px] text-purple-500">🔄 {formatDate(todo.wiedervorlage)}</span>}
        </div>
      </div>
      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6" /></svg>
    </div>
  );
}