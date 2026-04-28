import React, { useState } from "react";
import { addTodo } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

/**
 * Shown when an .eml / .msg file (or text/html drag from Outlook) is dropped.
 * Parses headers and body, asks user whether Subject → Title.
 */
export default function EmailDropModal({ parsed, onCreated, onClose, prio = "B", category = "", wiedervorlage = null }) {
  const { user } = useFirebaseAuth();
  // If no subject was detected, always show free-text title field
  const [useSubjectAsTitle, setUseSubjectAsTitle] = useState(!!parsed.subject);
  const [customTitle, setCustomTitle] = useState(parsed.subject || "");
  const [saving, setSaving] = useState(false);

  const buildDescription = () => {
    const lines = [];
    if (parsed.from)    lines.push(`<b>Von:</b> ${parsed.from}`);
    if (parsed.to)      lines.push(`<b>An:</b> ${parsed.to}`);
    if (parsed.cc)      lines.push(`<b>CC:</b> ${parsed.cc}`);
    if (parsed.date)    lines.push(`<b>Datum:</b> ${parsed.date}`);
    if (lines.length > 0) lines.push(""); // spacer
    if (parsed.body)    lines.push(parsed.body);
    return lines.join("<br>");
  };

  const handleSave = async () => {
    setSaving(true);
    const title = customTitle.trim() || parsed.subject || "E-Mail Aufgabe";

    const newTodo = {
      title,
      description: buildDescription(),
      prio,
      status: "offen",
      category: category || "",
      deadline: null,
      wiedervorlage: wiedervorlage || null,
      archived: false,
    };
    const ref = await addTodo(user.uid, newTodo);
    setSaving(false);
    onCreated?.({ id: ref.id, ...newTodo });
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="w-full sm:max-w-lg bg-white/95 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/60 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-800 flex-1">E-Mail als Notiz</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Parsed meta preview */}
        <div className="bg-slate-50 rounded-2xl p-3 space-y-1 text-[12px]">
          {parsed.subject && <div><span className="text-slate-400 font-semibold">Betreff: </span><span className="text-slate-700">{parsed.subject}</span></div>}
          {parsed.from    && <div><span className="text-slate-400 font-semibold">Von: </span><span className="text-slate-700">{parsed.from}</span></div>}
          {parsed.to      && <div><span className="text-slate-400 font-semibold">An: </span><span className="text-slate-700">{parsed.to}</span></div>}
          {parsed.cc      && <div><span className="text-slate-400 font-semibold">CC: </span><span className="text-slate-700">{parsed.cc}</span></div>}
          {parsed.date    && <div><span className="text-slate-400 font-semibold">Datum: </span><span className="text-slate-700">{parsed.date}</span></div>}
        </div>

        {/* Title input — always editable */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notiz-Titel</p>
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Titel eingeben…"
            className="w-full px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            autoFocus
          />
          {!customTitle && (
            <p className="text-[11px] text-amber-500">⚠ Kein Betreff erkannt — bitte Titel manuell eingeben</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-medium">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold shadow-lg disabled:opacity-50"
          >
            {saving ? "Speichern…" : "Als Notiz speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}