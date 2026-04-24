import React, { useState, useRef, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { addTodo } from "@/lib/todoService";

const PRIOS = ["A", "B", "C"];
const PRIO_BASE = {
  A: { bg: "bg-red-100", text: "text-red-600", ring: "ring-red-400", glow: "rgba(239,68,68,0.5)" },
  B: { bg: "bg-amber-100", text: "text-amber-600", ring: "ring-amber-400", glow: "rgba(245,158,11,0.5)" },
  C: { bg: "bg-green-100", text: "text-green-600", ring: "ring-green-400", glow: "rgba(34,197,94,0.5)" },
};

// Sequential pulsing: each button pulses 0.9s after the previous
const PULSE_DELAYS = { A: 0, B: 0.9, C: 1.8 };
const PULSE_CYCLE = 3.6; // seconds for one full cycle

function PulseButton({ label, active, color, onClick, pulseDelay }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Start with offset so pulses are sequential
    const initial = setTimeout(() => {
      setTick((t) => t + 1);
      const interval = setInterval(() => setTick((t) => t + 1), PULSE_CYCLE * 1000);
      return () => clearInterval(interval);
    }, pulseDelay * 1000);
    return () => clearTimeout(initial);
  }, [pulseDelay]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-1.5 rounded-lg text-xs font-bold transition-all border overflow-visible ${
        active
          ? `${color.bg} ${color.text} border-transparent ring-2 ring-offset-1 ${color.ring} shadow-sm`
          : "bg-white/80 text-slate-500 border-slate-200"
      }`}
      style={active ? { boxShadow: `0 0 12px ${color.glow}, 0 2px 8px rgba(0,0,0,0.08)` } : {}}
    >
      <span key={tick} className="absolute inset-0 rounded-lg pointer-events-none"
        style={{ border: `1.5px solid ${color.glow}`, animation: "quick-pulse 0.9s ease-out forwards" }} />
      Prio {label}
    </button>
  );
}

function InputParticle({ x, y, color }) {
  return (
    <div className="absolute pointer-events-none" style={{
      left: x, top: y, width: 4, height: 4, borderRadius: "50%",
      background: color, animation: "particle-float 0.8s ease-out forwards", zIndex: 10,
    }} />
  );
}

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

export default function QuickAdd({ categories, onCreated }) {
  const { user } = useFirebaseAuth();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("B");
  const [category, setCategory] = useState("");
  const [wiedervorlage, setWiedervorlage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [particles, setParticles] = useState([]);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const particleId = useRef(0);

  const handleChange = (e) => {
    setTitle(e.target.value);
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1000);

    if (inputRef.current && e.target.value.length % 2 === 0) {
      const rect = inputRef.current.getBoundingClientRect();
      const containerRect = inputRef.current.parentElement.getBoundingClientRect();
      const colors = ["#818cf8", "#a78bfa", "#38bdf8", "#34d399", "#fb923c"];
      const id = particleId.current++;
      const px = rect.left - containerRect.left + Math.random() * rect.width;
      const py = rect.top - containerRect.top + Math.random() * rect.height;
      const color = colors[Math.floor(Math.random() * colors.length)];
      setParticles((prev) => [...prev.slice(-8), { id, x: px, y: py, color }]);
      setTimeout(() => setParticles((prev) => prev.filter((p) => p.id !== id)), 900);
    }
  };

  // Quick save: just save, no popup
  const handleQuickSave = async () => {
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = {
      title: t, prio, category: category || "",
      status: "offen", description: "",
      deadline: null,
      wiedervorlage: wiedervorlage || null,
    };
    await addTodo(user.uid, newTodo);
    setTitle("");
    setWiedervorlage(null);
    setLoading(false);
    setTyping(false);
    inputRef.current?.focus();
  };

  // + Button: save + open popup
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = {
      title: t, prio, category: category || "",
      status: "offen", description: "",
      deadline: null,
      wiedervorlage: wiedervorlage || null,
    };
    const ref = await addTodo(user.uid, newTodo);
    setTitle("");
    setWiedervorlage(null);
    setLoading(false);
    setTyping(false);
    inputRef.current?.focus();
    if (onCreated) onCreated({ id: ref.id, ...newTodo });
  };

  const hasText = title.trim().length > 0;

  return (
    <div className="space-y-2.5">
      {/* Input row */}
      <div className="flex gap-2 items-center relative">
        <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
          {particles.map((p) => <InputParticle key={p.id} x={p.x} y={p.y} color={p.color} />)}
        </div>

        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={title}
            onChange={handleChange}
            onKeyDown={(e) => e.key === "Enter" && handleQuickSave()}
            placeholder="Neue Aufgabe hinzufügen…"
            className="w-full px-3 py-2.5 rounded-xl bg-white/80 border text-slate-800 placeholder-slate-400 focus:outline-none text-[16px] transition-all duration-300"
            style={{
              borderColor: typing ? "rgba(99,102,241,0.6)" : "rgba(203,213,225,1)",
              boxShadow: typing ? "0 0 0 3px rgba(99,102,241,0.15), 0 0 20px rgba(99,102,241,0.1)" : "none",
            }}
          />
          {typing && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
              <div style={{
                height: "100%",
                background: "linear-gradient(90deg, transparent, #818cf8, #a78bfa, #38bdf8, transparent)",
                animation: "scan-input 1.2s linear infinite",
              }} />
            </div>
          )}
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
            <>
              <IconPlus />
              {hasText && (
                <span className="absolute inset-0 rounded-xl" style={{
                  animation: "btn-pulse 1.5s ease-in-out infinite",
                  border: "2px solid rgba(99,102,241,0.5)",
                }} />
              )}
            </>
          )}
        </button>
      </div>

      {/* Prio + category */}
      <div className="flex gap-2 flex-wrap items-center">
        {PRIOS.map((p) => (
          <PulseButton
            key={p}
            label={p}
            active={prio === p}
            color={PRIO_BASE[p]}
            onClick={() => setPrio(p)}
            pulseDelay={PULSE_DELAYS[p]}
          />
        ))}

        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/80 border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400/50">
            <option value="">Kategorie…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
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

      <style>{`
        @keyframes quick-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes btn-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.18); opacity: 0.15; }
        }
        @keyframes particle-float {
          0% { transform: translate(0, 0) scale(1); opacity: 0.9; }
          100% { transform: translate(0px, -30px) scale(0); opacity: 0; }
        }
        @keyframes scan-input {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}