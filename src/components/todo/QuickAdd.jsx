import React, { useState, useRef } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { addTodo } from "@/lib/todoService";
import EmailDropModal from "./EmailDropModal";
import { parseMsgFile } from "@/lib/msgParser";


const PRIOS = ["A", "B", "C"];
// Runde Prio-Buttons — bewusst anders geformt als die eckigen Tag-Buttons
const PRIO_BASE = {
  A: { active: "bg-red-500 border-red-500 text-white shadow-md", base: "bg-white text-red-500 border-red-300" },
  B: { active: "bg-amber-500 border-amber-500 text-white shadow-md", base: "bg-white text-amber-500 border-amber-300" },
  C: { active: "bg-emerald-500 border-emerald-500 text-white shadow-md", base: "bg-white text-emerald-500 border-emerald-300" },
};

function addDaysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}

const WIEDERVORLAGE_DAYS = [0, 1, 2, 3, 4, 5, 6, 7];

// SVG icons for buttons
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// Parse RFC-2822 header from text
function parseEmailText(text) {
  const header = (name) => {
    const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  const subject = header("Subject") || header("Betreff");
  const from    = header("From")    || header("Von");
  const to      = header("To")      || header("An");
  const cc      = header("Cc")      || header("CC");
  const date    = header("Date")    || header("Datum");
  const bodyMatch = text.match(/\r?\n\r?\n([\s\S]*)/);
  const body = bodyMatch ? bodyMatch[1].trim().replace(/\n/g, "<br>") : "";
  return { subject, from, to, cc, date, body };
}

// Extract subject from Outlook HTML drag (looks in <title> and common Outlook patterns)
function extractSubjectFromHtml(html) {
  // Outlook puts subject in <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  // Some Outlook versions use a Subject: line in the HTML
  const subjectMatch = html.match(/Subject:\s*([^\r\n<]+)/i);
  if (subjectMatch) return subjectMatch[1].trim();
  return "";
}

// Extract From/To/CC/Date from Outlook HTML (embedded in table headers)
function extractHeaderFromHtml(html, label) {
  // Outlook embeds headers like: <b>Von:</b> Name &lt;email&gt;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`${escaped}[^>]*>\\s*([^<]+)`, "i"));
  return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
}

export default function QuickAdd({ categories, onCreated }) {
  const { user } = useFirebaseAuth();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("B");
  const [tags, setTags] = useState([]);
  const [wiedervorlage, setWiedervorlage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [emailParsed, setEmailParsed] = useState(null);
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;

    // Log all available types so we can debug what Outlook sends
    const types = Array.from(dt.types || []);
    console.log("[EmailDrop] types:", types);
    types.forEach((t) => {
      try { console.log(`[EmailDrop] ${t}:`, dt.getData(t).substring(0, 300)); } catch {}
    });

    // Try .msg file (Outlook binary format) first
    const files = Array.from(dt.files || []);
    const msgFile = files.find((f) => f.name.endsWith(".msg"));
    if (msgFile) {
      const buffer = await msgFile.arrayBuffer();
      const parsed = parseMsgFile(buffer);
      setEmailParsed(parsed);
      return;
    }

    // Try .eml file
    const emlFile = files.find((f) => f.name.endsWith(".eml") || f.type === "message/rfc822");
    if (emlFile) {
      const text = await emlFile.text();
      setEmailParsed(parseEmailText(text));
      return;
    }

    const plain = dt.getData("text/plain");
    const html  = dt.getData("text/html");

    // Case 1: plain text has RFC-2822 headers (e.g. .eml content or some clients)
    if (plain && (plain.includes("Subject:") || plain.includes("From:") || plain.includes("Betreff:"))) {
      const parsed = parseEmailText(plain);
      if (html && !parsed.subject) parsed.subject = extractSubjectFromHtml(html);
      if (html) parsed.body = html;
      setEmailParsed(parsed);
      return;
    }

    // Case 2: Outlook drag — only HTML, no RFC headers in plain text
    if (html) {
      const subject = extractSubjectFromHtml(html);
      const from = extractHeaderFromHtml(html, "Von") || extractHeaderFromHtml(html, "From");
      const to   = extractHeaderFromHtml(html, "An")  || extractHeaderFromHtml(html, "To");
      const cc   = extractHeaderFromHtml(html, "CC")  || extractHeaderFromHtml(html, "Cc");
      const date = extractHeaderFromHtml(html, "Datum") || extractHeaderFromHtml(html, "Date") || extractHeaderFromHtml(html, "Gesendet") || extractHeaderFromHtml(html, "Sent");
      setEmailParsed({ subject, from, to, cc, date, body: html });
      return;
    }

    // Case 3: plain text only — use as body, ask user for subject in modal
    if (plain) {
      setEmailParsed({ subject: "", from: "", to: "", cc: "", date: "", body: plain.replace(/\n/g, "<br>") });
    }
  };

  const handleChange = (e) => {
    setTitle(e.target.value);
  };

  // Quick save: just save, no popup
  const handleQuickSave = async () => {
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = {
      title: t, prio, tags,
      status: "offen", description: "",
      deadline: null,
      wiedervorlage: wiedervorlage || null,
    };
    await addTodo(user.uid, newTodo);
    setTitle("");
    setTags([]);
    setWiedervorlage(null);
    setLoading(false);
    inputRef.current?.focus();
  };

  // + Button: save + open popup
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = {
      title: t, prio, tags,
      status: "offen", description: "",
      deadline: null,
      wiedervorlage: wiedervorlage || null,
    };
    const ref = await addTodo(user.uid, newTodo);
    setTitle("");
    setTags([]);
    setWiedervorlage(null);
    setLoading(false);
    inputRef.current?.focus();
    if (onCreated) onCreated({ id: ref.id, ...newTodo });
  };

  const hasText = title.trim().length > 0;

  return (
    <div
      className="space-y-2.5"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {emailParsed && (
        <EmailDropModal
          parsed={emailParsed}
          prio={prio}
          tags={tags}
          wiedervorlage={wiedervorlage}
          onCreated={(todo) => {
            setEmailParsed(null);
            onCreated?.(todo);
          }}
          onClose={() => setEmailParsed(null)}
        />
      )}

      {/* Input row */}
      <div
        className="flex gap-2 items-center relative rounded-xl transition-all"
        style={dragOver ? { boxShadow: "0 0 0 2px #6366f1, 0 0 20px rgba(99,102,241,0.25)" } : {}}
      >
        {dragOver && (
          <div className="absolute inset-0 rounded-xl bg-indigo-50/80 border-2 border-dashed border-indigo-400 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-indigo-500 text-xs font-semibold">📧 E-Mail als Notiz ablegen</span>
          </div>
        )}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={title}
            onChange={handleChange}
            onKeyDown={(e) => e.key === "Enter" && handleQuickSave()}
            placeholder="Neue Aufgabe hinzufügen…"
            className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-[16px]"
          />
        </div>

        {/* Quick save (no popup) */}
        <button
          type="button"
          onClick={handleQuickSave}
          disabled={!hasText || loading}
          title="Schnell speichern"
          className="w-10 h-10 rounded-xl text-white flex items-center justify-center active:scale-90 transition-all"
          style={{
            background: hasText ? "linear-gradient(135deg, #10b981, #059669)" : "rgba(148,163,184,0.5)",
            boxShadow: hasText ? "0 0 16px rgba(16,185,129,0.5)" : "none",
            transition: "all 0.3s ease",
          }}
        >
          {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <IconCheck />}
        </button>

        {/* + Button: save + open popup */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasText || loading}
          title="Speichern & bearbeiten"
          className="w-10 h-10 rounded-xl text-white flex items-center justify-center active:scale-90 transition-all relative"
          style={{
            background: hasText ? "linear-gradient(135deg, #6366f1, #818cf8)" : "rgba(148,163,184,0.5)",
            boxShadow: hasText ? "0 0 20px rgba(99,102,241,0.6), 0 4px 12px rgba(99,102,241,0.3)" : "none",
            transition: "all 0.3s ease",
          }}
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            <IconPlus />
          )}
        </button>
      </div>

      {/* Prio + category */}
      <div className="flex gap-2 flex-wrap items-center">
        {PRIOS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrio(p)}
            title={`Priorität ${p}`}
            className={`w-9 h-9 rounded-full text-sm font-bold border-2 flex items-center justify-center transition-all active:scale-90 ${
              prio === p ? `${PRIO_BASE[p].active} scale-110` : PRIO_BASE[p].base
            }`}
          >
            {p}
          </button>
        ))}

        {/* Trenner: Prio (rund) vs. Tags (eckig) */}
        {categories.length > 0 && <div className="w-px h-6 bg-slate-300 mx-1" />}

        {categories.length > 0 && categories.map((c) => {
          const active = tags.includes(c.name);
          return (
            <button key={c.id} type="button"
              onClick={() => setTags(active ? tags.filter((t) => t !== c.name) : [...tags, c.name])}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                active ? "bg-indigo-500 text-white border-indigo-500" : "bg-white/80 text-slate-600 border-slate-200"
              }`}>
              {active && "✓ "}#{c.name}
            </button>
          );
        })}
      </div>

      {/* Wiedervorlage quick buttons */}
      <div>
        <div className="flex gap-1 flex-wrap items-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" className="mr-0.5">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
          </svg>
          {WIEDERVORLAGE_DAYS.map((n) => {
            const isActive = wiedervorlage && (() => {
              const target = addDaysFromNow(n);
              return Math.abs(wiedervorlage.getTime() - target.getTime()) < 60 * 60 * 1000;
            })();
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  const newDate = addDaysFromNow(n);
                  setWiedervorlage(isActive ? null : newDate);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all active:scale-95 ${
                  isActive
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600"
                }`}
              >
                {n === 0 ? "+0" : `+${n}`}
              </button>
            );
          })}
          {wiedervorlage && (
            <button
              type="button"
              onClick={() => setWiedervorlage(null)}
              className="px-1.5 py-0.5 rounded-md text-[10px] bg-red-50 text-red-400 hover:bg-red-100 transition-all"
            >✕</button>
          )}
          {wiedervorlage && (
            <span className="text-[10px] text-indigo-500 font-medium ml-1">
              {wiedervorlage.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
      </div>

    </div>
  );
}