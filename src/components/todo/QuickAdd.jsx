import React, { useState, useRef, useEffect } from "react";
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
const IconPlus = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconEdit = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
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
  const rootRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  // Optionen wieder einklappen, wenn außerhalb geklickt wird (und nichts gewählt ist)
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setExpanded(false); };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [expanded]);

  // Desktop-App: Strg+N / globales Tastenkürzel springt direkt hierher
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("my2do:focus-quick-add", focus);
    return () => window.removeEventListener("my2do:focus-quick-add", focus);
  }, []);

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
  // Optionen (Prio, Tags, Wiedervorlage) erst zeigen, wenn man erfasst
  const showOptions = expanded || hasText || tags.length > 0 || !!wiedervorlage || prio !== "B" || dragOver;

  return (
    <div
      ref={rootRef}
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

      {/* Eingabezeile */}
      <div
        className="flex gap-1.5 items-center relative rounded-[16px] transition-all"
        style={dragOver ? { boxShadow: "0 0 0 2px #6366f1, 0 0 20px rgba(99,102,241,0.25)" } : {}}
      >
        {dragOver && (
          <div className="absolute inset-0 rounded-[16px] bg-indigo-50/90 border-2 border-dashed border-indigo-400 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-indigo-500 text-xs font-semibold">📧 E-Mail hier ablegen</span>
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          <IconPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" size={16} />
          <input
            ref={inputRef}
            value={title}
            onChange={handleChange}
            onFocus={() => setExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
              else if (e.key === "Enter") handleQuickSave();
              else if (e.key === "Escape" && !hasText) { setExpanded(false); e.currentTarget.blur(); }
            }}
            placeholder="Neue Aufgabe …"
            className="w-full h-11 pl-9 pr-3 rounded-[15px] glass-input text-slate-800 placeholder-slate-400 text-[16px]"
          />
        </div>

        {/* Schnell speichern (ohne Editor) */}
        <button
          type="button"
          onClick={handleQuickSave}
          disabled={!hasText || loading}
          title="Speichern (Enter)"
          className={`w-11 h-11 rounded-[14px] flex items-center justify-center active:scale-90 transition-all flex-shrink-0 ${
            hasText ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30" : "bg-slate-200/70 text-slate-400"
          }`}
        >
          {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <IconCheck />}
        </button>

        {/* Speichern + Editor öffnen */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasText || loading}
          title="Speichern & bearbeiten (Strg+Enter)"
          className={`w-11 h-11 rounded-[14px] flex items-center justify-center active:scale-90 transition-all flex-shrink-0 ${
            hasText ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30" : "bg-slate-200/70 text-slate-400"
          }`}
        >
          <IconEdit />
        </button>
      </div>

      {/* Optionen – klappen beim Erfassen auf */}
      <div className={`grid transition-all duration-200 ease-out ${showOptions ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pt-2.5 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Prio: rund */}
              <div className="flex gap-1 flex-shrink-0">
                {PRIOS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrio(p)}
                    title={`Priorität ${p}`}
                    className={`w-8 h-8 rounded-full text-[13px] font-bold border-2 flex items-center justify-center transition-all active:scale-90 ${
                      prio === p ? PRIO_BASE[p].active : PRIO_BASE[p].base
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {categories.length > 0 && <div className="w-px h-6 bg-slate-200 flex-shrink-0" />}
              {/* Tags: eckig, eine scrollbare Zeile */}
              {categories.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar fade-x min-w-0 py-0.5 px-0.5">
                  {[...categories].sort((a, b) => Number(tags.includes(b.name)) - Number(tags.includes(a.name))).map((c) => {
                    const active = tags.includes(c.name);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setTags(active ? tags.filter((t) => t !== c.name) : [...tags, c.name])}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
                          active ? "bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-500/25" : "glass-chip text-slate-600 border-transparent"
                        }`}>
                        {active && "✓ "}#{c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Wiedervorlage */}
            <div className="flex gap-1 items-center overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 flex-shrink-0">Wiedervorlage</span>
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
                    title={n === 0 ? "Heute" : `In ${n} ${n === 1 ? "Tag" : "Tagen"}`}
                    className={`flex-shrink-0 min-w-[30px] px-1.5 py-1 rounded-md text-[11px] font-semibold transition-all active:scale-95 ${
                      isActive ? "bg-indigo-500 text-white" : "glass-chip text-slate-500 hover:text-indigo-600"
                    }`}
                  >
                    {n === 0 ? "Heute" : `+${n}`}
                  </button>
                );
              })}
              {wiedervorlage && (
                <>
                  <span className="text-[11px] text-indigo-500 font-semibold ml-1 flex-shrink-0">
                    {wiedervorlage.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <button type="button" onClick={() => setWiedervorlage(null)} title="Entfernen"
                    className="flex-shrink-0 px-1.5 py-1 rounded-md text-[10px] bg-red-50 text-red-400 hover:bg-red-100 transition-all">✕</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}