import React, { useState, useRef, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { addTodo } from "@/lib/todoService";

const PRIOS = ["A", "B", "C"];
const PRIO_BASE = {
  A: { bg: "bg-red-100", text: "text-red-600", ring: "ring-red-400", glow: "rgba(239,68,68,0.5)" },
  B: { bg: "bg-amber-100", text: "text-amber-600", ring: "ring-amber-400", glow: "rgba(245,158,11,0.5)" },
  C: { bg: "bg-green-100", text: "text-green-600", ring: "ring-green-400", glow: "rgba(34,197,94,0.5)" },
};

// Shared pulse tick — all buttons pulse together
let _sharedTick = 0;
const _listeners = new Set();
function startSharedPulse() {
  const schedule = () => {
    // Irregular but shared: 1.5s–3.5s
    const delay = 1500 + Math.random() * 2000;
    setTimeout(() => {
      _sharedTick++;
      _listeners.forEach((fn) => fn(_sharedTick));
      schedule();
    }, delay);
  };
  schedule();
}
startSharedPulse();

function usePulseTick() {
  const [tick, setTick] = useState(_sharedTick);
  useEffect(() => {
    _listeners.add(setTick);
    return () => _listeners.delete(setTick);
  }, []);
  return tick;
}

function PulseButton({ label, active, color, onClick }) {
  const tick = usePulseTick();

  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-1.5 rounded-lg text-xs font-bold transition-all border overflow-visible ${
        active
          ? `${color.bg} ${color.text} border-transparent ring-2 ring-offset-1 ${color.ring} shadow-sm`
          : "bg-white/80 text-slate-500 border-slate-200"
      }`}
      style={active ? { boxShadow: `0 0 12px ${color.glow}, 0 2px 8px rgba(0,0,0,0.08)` } : {}}
    >
      {/* Sync pulse ring */}
      <span
        key={tick}
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `1.5px solid ${color.glow}`,
          animation: "quick-pulse 0.9s ease-out forwards",
        }}
      />
      Prio {label}
    </button>
  );
}

// Floating particles around input when typing
function InputParticle({ x, y, color }) {
  return (
    <div className="absolute pointer-events-none" style={{
      left: x, top: y,
      width: 4, height: 4,
      borderRadius: "50%",
      background: color,
      animation: "particle-float 0.8s ease-out forwards",
      zIndex: 10,
    }} />
  );
}

export default function QuickAdd({ categories, onCreated }) {
  const { user } = useFirebaseAuth();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("B");
  const [category, setCategory] = useState("");
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

    // Spawn particle
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

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    const newTodo = { title: t, prio, category: category || "", status: "offen", description: "", deadline: null, wiedervorlage: null };
    const ref = await addTodo(user.uid, newTodo);
    setTitle("");
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
        {/* Particle container */}
        <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
          {particles.map((p) => <InputParticle key={p.id} x={p.x} y={p.y} color={p.color} />)}
        </div>

        {/* Input with typing glow */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={title}
            onChange={handleChange}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Neue Aufgabe hinzufügen…"
            className="w-full px-3 py-2.5 rounded-xl bg-white/80 border text-slate-800 placeholder-slate-400 focus:outline-none text-[16px] transition-all duration-300"
            style={{
              borderColor: typing ? "rgba(99,102,241,0.6)" : "rgba(203,213,225,1)",
              boxShadow: typing
                ? "0 0 0 3px rgba(99,102,241,0.15), 0 0 20px rgba(99,102,241,0.1)"
                : "none",
            }}
          />
          {/* Typing scan line */}
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

        {/* + Button with pulse */}
        <button
          onClick={handleSubmit}
          disabled={!hasText || loading}
          className="w-10 h-10 rounded-xl text-white flex items-center justify-center text-xl font-bold active:scale-90 transition-all relative"
          style={{
            background: hasText
              ? "linear-gradient(135deg, #6366f1, #818cf8)"
              : "rgba(148,163,184,0.5)",
            boxShadow: hasText ? "0 0 20px rgba(99,102,241,0.6), 0 4px 12px rgba(99,102,241,0.3)" : "none",
            transition: "all 0.3s ease",
          }}
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            <>
              <span>+</span>
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
          <PulseButton key={p} label={p} active={prio === p} color={PRIO_BASE[p]} onClick={() => setPrio(p)} />
        ))}

        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/80 border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400/50">
            <option value="">Kategorie…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
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
          100% { transform: translate(${() => (Math.random() - 0.5) * 40}px, -30px) scale(0); opacity: 0; }
        }
        @keyframes scan-input {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}