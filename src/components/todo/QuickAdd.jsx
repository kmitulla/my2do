import React, { useState } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { todosCol } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

export default function QuickAdd({ categories, onCreated, aiEnabled }) {
  const { user } = useFirebaseAuth();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("B");
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const ref = await addDoc(todosCol(user.uid), {
      title: title.trim(),
      description: "",
      prio,
      status: "offen",
      category: "",
      deadline: null,
      wiedervorlage: null,
      emailTitle: "",
      emailBody: "",
      archived: false,
      userId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setTitle("");
    setLoading(false);
    // Open the newly created todo immediately
    onCreated?.({ id: ref.id, title: title.trim(), description: "", prio, status: "offen", category: "", deadline: null, wiedervorlage: null, emailTitle: "", emailBody: "", archived: false });
  };

  const prioColors = { A: "bg-red-500 text-white", B: "bg-orange-400 text-white", C: "bg-emerald-500 text-white" };

  return (
    <form onSubmit={handleAdd} className="flex gap-2 items-center">
      <div className="flex gap-1">
        {["A", "B", "C"].map((p) => (
          <button key={p} type="button" onClick={() => setPrio(p)}
            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${prio === p ? prioColors[p] + " shadow-md scale-110" : "bg-white/60 text-slate-500 border border-slate-200"}`}>
            {p}
          </button>
        ))}
      </div>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Neue Notiz..."
        className="flex-1 px-4 py-2.5 rounded-2xl bg-white/70 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all text-[16px]" />
      <button type="submit" disabled={!title.trim() || loading}
        className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-40">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </form>
  );
}