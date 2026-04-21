import React, { useState, useEffect } from "react";
import { updateTodo, deleteTodo, addCategory } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { format } from "date-fns";

const STATUSES = ["offen", "in Arbeit", "wartend", "erledigt"];
const PRIOS = ["A", "B", "C"];
const PRIO_STYLES = {
  A: "bg-red-500",
  B: "bg-orange-400",
  C: "bg-emerald-500",
};

function toInputDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export default function TodoDetail({ todo, categories, onClose, onDelete }) {
  const { user } = useFirebaseAuth();
  const [form, setForm] = useState({ ...todo });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [emailTitle, setEmailTitle] = useState("");
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    setForm({ ...todo });
  }, [todo]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const data = { ...form };
    // Convert date strings to timestamps
    ["deadline", "wiedervorlage", "reminder"].forEach((k) => {
      if (data[k] && typeof data[k] === "string") {
        data[k] = new Date(data[k]);
      }
    });
    await updateTodo(user.uid, todo.id, data);
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteTodo(user.uid, todo.id);
    onDelete?.();
    onClose();
  };

  const handleArchive = async () => {
    await updateTodo(user.uid, todo.id, { archived: true, status: "erledigt" });
    onClose();
  };

  const addNewCategory = async () => {
    if (!newCat.trim()) return;
    await addCategory(user.uid, newCat.trim(), "#6366f1");
    set("category", newCat.trim());
    setNewCat("");
    setShowNewCat(false);
  };

  const openEmail = () => {
    const subject = encodeURIComponent(emailTitle);
    const body = encodeURIComponent(emailBody);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-lg bg-white/80 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/60 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center gap-3 z-10 rounded-t-3xl">
          <div className={`w-3 h-3 rounded-full ${PRIO_STYLES[form.prio] || "bg-orange-400"}`} />
          <h2 className="text-base font-semibold text-slate-800 flex-1 truncate">Aufgabe bearbeiten</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Titel *</label>
            <input
              value={form.title || ""}
              onChange={(e) => set("title", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[15px]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Beschreibung</label>
            <textarea
              value={form.description || ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[15px] resize-none"
            />
          </div>

          {/* Prio + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Priorität</label>
              <div className="flex gap-2">
                {PRIOS.map((p) => (
                  <button key={p} type="button" onClick={() => set("prio", p)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${form.prio === p ? `${PRIO_STYLES[p]} text-white shadow-md` : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
              <select value={form.status || "offen"} onChange={(e) => set("status", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Kategorie</label>
            <div className="flex gap-2">
              <select value={form.category || ""} onChange={(e) => set("category", e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50">
                <option value="">Keine Kategorie</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={() => setShowNewCat(!showNewCat)} type="button"
                className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 transition-all whitespace-nowrap">
                + Neu
              </button>
            </div>
            {showNewCat && (
              <div className="flex gap-2 mt-2">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Kategoriename"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  onKeyDown={(e) => e.key === "Enter" && addNewCategory()} />
                <button onClick={addNewCategory} className="px-3 py-2 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 transition-all">OK</button>
              </div>
            )}
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">📅 Deadline</label>
            <input type="datetime-local" value={toInputDate(form.deadline)} onChange={(e) => set("deadline", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          </div>

          {/* Wiedervorlage */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">🔄 Wiedervorlage</label>
            <input type="datetime-local" value={toInputDate(form.wiedervorlage)} onChange={(e) => set("wiedervorlage", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          </div>

          {/* Reminder */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">🔔 Reminder</label>
            <input type="datetime-local" value={toInputDate(form.reminder)} onChange={(e) => set("reminder", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          </div>

          {/* Email Section */}
          <div className="border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">✉️ E-Mail aus Notiz erstellen</label>
            <input value={emailTitle} onChange={(e) => setEmailTitle(e.target.value)} placeholder="E-Mail Betreff"
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="E-Mail Text..." rows={3}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
            <button onClick={openEmail} disabled={!emailTitle}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-slate-600 to-slate-700 text-white text-sm font-medium hover:from-slate-700 hover:to-slate-800 transition-all disabled:opacity-40">
              📨 E-Mail öffnen
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 flex gap-2 rounded-b-3xl">
          <button onClick={handleArchive}
            className="flex-1 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 text-sm font-medium hover:bg-amber-100 transition-all">
            Archivieren
          </button>
          <button onClick={handleDelete}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all ${confirmDelete ? "bg-red-500 text-white" : "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"}`}>
            {confirmDelete ? "Wirklich löschen?" : "Löschen"}
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-60">
            {saving ? "..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}