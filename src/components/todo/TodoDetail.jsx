import React, { useState, useEffect, useRef } from "react";
import { updateTodo, deleteTodo, addCategory, sendTodoToUsers, getAllUsers } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { format } from "date-fns";
import RichEditor from "./RichEditor";

const STATUSES = ["offen", "in Arbeit", "wartend", "erledigt"];
const PRIOS = ["A", "B", "C"];
const PRIO_STYLES = { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" };
const PRIO_BTN = {
  A: { active: "bg-red-500 text-white shadow-md", base: "bg-slate-100 text-slate-500" },
  B: { active: "bg-orange-400 text-white shadow-md", base: "bg-slate-100 text-slate-500" },
  C: { active: "bg-emerald-500 text-white shadow-md", base: "bg-slate-100 text-slate-500" },
};
const STATUS_BTN = {
  "offen": { active: "bg-slate-600 text-white", base: "bg-slate-100 text-slate-500" },
  "in Arbeit": { active: "bg-blue-500 text-white", base: "bg-slate-100 text-slate-500" },
  "wartend": { active: "bg-amber-400 text-white", base: "bg-slate-100 text-slate-500" },
  "erledigt": { active: "bg-emerald-500 text-white", base: "bg-slate-100 text-slate-500" },
};

function toInputDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export default function TodoDetail({ todo, categories, onClose, onDelete }) {
  const { user, userProfile } = useFirebaseAuth();
  const [form, setForm] = useState({ ...todo });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);

  // Share state
  const [showShare, setShowShare] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUids, setSelectedUids] = useState([]);
  const [collaborate, setCollaborate] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Track if dirty (for auto-save vs X close)
  const isDirtyRef = useRef(false);
  const closedWithX = useRef(false);

  useEffect(() => {
    setForm({ ...todo });
    isDirtyRef.current = false;
  }, [todo]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    isDirtyRef.current = true;
  };

  const buildSaveData = () => {
    const data = { ...form };
    ["deadline", "wiedervorlage"].forEach((k) => {
      if (data[k] && typeof data[k] === "string") data[k] = new Date(data[k]);
      if (data[k] === "") data[k] = null;
    });
    return data;
  };

  const save = async () => {
    setSaving(true);
    await updateTodo(user.uid, todo.id, buildSaveData());
    setSaving(false);
    onClose();
  };

  // Auto-save on backdrop click (not X)
  const handleBackdropClick = async (e) => {
    if (e.target !== e.currentTarget) return;
    if (isDirtyRef.current && !closedWithX.current) {
      await updateTodo(user.uid, todo.id, buildSaveData());
    }
    onClose();
  };

  const handleXClose = () => {
    closedWithX.current = true;
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

  const openCalendar = () => {
    const title = form.title || "Aufgabe";
    const deadlineDate = form.deadline
      ? (form.deadline.toDate ? form.deadline.toDate() : new Date(form.deadline))
      : new Date();
    const endDate = new Date(deadlineDate.getTime() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const fmtIcs = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const cleanDesc = (form.description || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n/g, "\\n");
    const notes = `Priorität: ${form.prio || "B"}\\nStatus: ${form.status || "offen"}\\nKategorie: ${form.category || "–"}\\nDeadline: ${form.deadline ? format(deadlineDate, "dd.MM.yyyy HH:mm") : "–"}\\n\\n${cleanDesc}`;
    // Build .ics content – opens in Outlook on PC, default calendar on iPhone
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${title}`,
      `DTSTART:${fmtIcs(deadlineDate)}`,
      `DTEND:${fmtIcs(endDate)}`,
      `DESCRIPTION:${notes}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openEmailClient = () => {
    const subject = encodeURIComponent(form.title || "");
    const cleanDesc = (form.description || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const deadlineDate = form.deadline ? (form.deadline.toDate ? form.deadline.toDate() : new Date(form.deadline)) : null;
    const wiedervorlageDate = form.wiedervorlage ? (form.wiedervorlage.toDate ? form.wiedervorlage.toDate() : new Date(form.wiedervorlage)) : null;
    const info = [
      "",
      "---",
      `Priorität: ${form.prio || "–"}`,
      `Status: ${form.status || "–"}`,
      `Kategorie: ${form.category || "–"}`,
      `Deadline: ${deadlineDate ? format(deadlineDate, "dd.MM.yyyy HH:mm") : "–"}`,
      `Wiedervorlage: ${wiedervorlageDate ? format(wiedervorlageDate, "dd.MM.yyyy HH:mm") : "–"}`,
    ].join("\n");
    const body = encodeURIComponent(cleanDesc + info);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const loadUsers = async () => {
    const users = await getAllUsers();
    setAllUsers(users.filter((u) => u.id !== user.uid));
    setShowShare(true);
  };

  const toggleUser = (uid) => {
    setSelectedUids((prev) => prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]);
  };

  const handleShare = async () => {
    if (selectedUids.length === 0) return;
    setSharing(true);
    try {
      await sendTodoToUsers(user.uid, userProfile?.displayName || user.email, form, selectedUids, collaborate);
      setShareSuccess(true);
      setTimeout(() => { setShareSuccess(false); setShowShare(false); setSelectedUids([]); }, 1500);
    } catch (err) {
      console.error("Share failed:", err);
      alert("Fehler beim Senden: " + err.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleBackdropClick}

>
      <div className="w-full sm:max-w-lg bg-white/85 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/60 max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex-shrink-0 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center gap-3 rounded-t-3xl">
          <div className={`w-3 h-3 rounded-full ${PRIO_STYLES[form.prio] || "bg-orange-400"}`} />
          <h2 className="text-base font-semibold text-slate-800 flex-1 truncate">Notiz bearbeiten</h2>
          <button onClick={handleXClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Titel *</label>
            <input value={form.title || ""} onChange={(e) => set("title", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[15px]" />
          </div>

          {/* Description - rich editor */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Beschreibung</label>
            <RichEditor
              value={form.description || ""}
              onChange={(v) => set("description", v)}
              placeholder="Beschreibung eingeben..."
              minHeight={200}
            />
          </div>

          {/* Prio */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Priorität</label>
            <div className="flex gap-2">
              {PRIOS.map((p) => (
                <button key={p} type="button" onClick={() => set("prio", p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${form.prio === p ? PRIO_BTN[p].active : PRIO_BTN[p].base}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Status - tap buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => set("status", s)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${form.status === s ? STATUS_BTN[s].active : STATUS_BTN[s].base}`}>
                  {s}
                </button>
              ))}
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
                className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 transition-all">
                + Neu
              </button>
            </div>
            {showNewCat && (
              <div className="flex gap-2 mt-2">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Kategoriename"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  onKeyDown={(e) => e.key === "Enter" && addNewCategory()} />
                <button onClick={addNewCategory} className="px-3 py-2 rounded-xl bg-blue-500 text-white text-sm">OK</button>
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

          {/* Email + Calendar - compact side by side */}
          <div className="border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">📨 E-Mail &amp; 📆 Kalender</label>
            <div className="flex gap-2">
              <button onClick={openEmailClient}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-slate-600 to-slate-700 text-white text-sm font-medium hover:from-slate-700 hover:to-slate-800 transition-all">
                📨 E-Mail
              </button>
              <button onClick={openCalendar}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:shadow-lg transition-all">
                📆 Kalender
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 text-center">E-Mail: Titel als Betreff · Kalender: .ics öffnet Outlook / iPhone-Kalender</p>
          </div>

          {/* Share Section */}
          <div className="border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">👥 Notiz teilen</label>
            {!showShare ? (
              <button onClick={loadUsers}
                className="w-full py-2.5 rounded-2xl bg-violet-50 border border-violet-200 text-violet-600 text-sm font-medium hover:bg-violet-100 transition-all">
                Notiz an User senden
              </button>
            ) : (
              <div className="space-y-3">
                {/* User list */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {allUsers.length === 0 && <p className="text-xs text-slate-400">Keine anderen User gefunden.</p>}
                  {allUsers.map((u) => (
                    <button key={u.id} onClick={() => toggleUser(u.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all ${selectedUids.includes(u.id) ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-700"}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${selectedUids.includes(u.id) ? "bg-white/20 text-white" : "bg-violet-200 text-violet-600"}`}>
                        {(u.displayName || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.displayName || "–"}</p>
                        <p className={`text-[10px] truncate ${selectedUids.includes(u.id) ? "text-white/70" : "text-slate-400"}`}>{u.email}</p>
                      </div>
                      {selectedUids.includes(u.id) && <span className="text-white text-sm">✓</span>}
                    </button>
                  ))}
                </div>

                {/* Collaborate toggle */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <button onClick={() => setCollaborate(!collaborate)}
                    className={`w-10 h-6 rounded-full transition-all relative ${collaborate ? "bg-purple-500" : "bg-slate-300"}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${collaborate ? "left-5" : "left-1"}`} />
                  </button>
                  <div>
                    <p className="text-xs font-semibold text-purple-700">Zusammenarbeit</p>
                    <p className="text-[10px] text-purple-400">Beide können die Notiz bearbeiten</p>
                  </div>
                </div>

                {shareSuccess ? (
                  <div className="py-2.5 text-center text-emerald-600 text-sm font-medium">✓ Gesendet!</div>
                ) : (
                  <button onClick={handleShare} disabled={sharing || selectedUids.length === 0}
                    className="w-full py-2.5 rounded-2xl bg-violet-500 text-white text-sm font-semibold disabled:opacity-40">
                    {sharing ? "Sende..." : `An ${selectedUids.length > 0 ? selectedUids.length : ""} User senden`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 flex gap-2 rounded-b-3xl">
          <button onClick={handleArchive}
            className="flex-1 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 text-sm font-medium hover:bg-amber-100 transition-all">
            Archivieren
          </button>
          <button onClick={handleDelete}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all ${confirmDelete ? "bg-red-500 text-white" : "bg-red-50 border border-red-200 text-red-600"}`}>
            {confirmDelete ? "Wirklich?" : "Löschen"}
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold shadow-lg disabled:opacity-60">
            {saving ? "..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Auto-growing textarea
function AutoGrowTextarea({ value, onChange, placeholder, minRows = 4 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      rows={minRows}
      className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none overflow-hidden" />
  );
}