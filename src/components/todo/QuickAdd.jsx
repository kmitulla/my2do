import React, { useState, useRef } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { addTodo } from "@/lib/todoService";

const PRIOS = ["A", "B", "C"];
const PRIO_COLORS = { A: "bg-red-100 text-red-600", B: "bg-amber-100 text-amber-600", C: "bg-green-100 text-green-600" };

export default function QuickAdd({ categories, onCreated, aiEnabled }) {
  const { user } = useFirebaseAuth();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("B");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = {
      title: t,
      prio,
      category: category || "",
      status: "offen",
      description: "",
      deadline: null,
      wiedervorlage: null,
    };
    const ref = await addTodo(user.uid, newTodo);
    setTitle("");
    setLoading(false);
    inputRef.current?.focus();
    if (onCreated) onCreated({ id: ref.id, ...newTodo });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Neue Aufgabe hinzufügen…"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[16px]"
        />
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || loading}
          className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center text-xl font-bold disabled:opacity-40 active:scale-95 transition-all shadow-sm"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          ) : "+"}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {PRIOS.map((p) => (
          <button
            key={p}
            onClick={() => setPrio(p)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
              prio === p
                ? `${PRIO_COLORS[p]} border-transparent ring-2 ring-offset-1 ring-blue-400`
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Prio {p}
          </button>
        ))}

        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          >
            <option value="">Kategorie…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}