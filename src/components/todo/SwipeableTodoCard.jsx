import React, { useRef, useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { updateTodo, deleteTodo } from "@/lib/todoService";

const PRIO_DOT = { A: "#f87171", B: "#fbbf24", C: "#4ade80" };
const STATUS_ICON = { erledigt: "✓", "in Arbeit": "▶", wartend: "⏸", "in Bearbeitung": "▶" };

// 1 day steps up to +7, then calendar
const WIEDERVORLAGE_STEPS = [
  { label: "+1 Tag", days: 1 },
  { label: "+2 Tage", days: 2 },
  { label: "+3 Tage", days: 3 },
  { label: "+4 Tage", days: 4 },
  { label: "+5 Tage", days: 5 },
  { label: "+6 Tage", days: 6 },
  { label: "+7 Tage", days: 7 },
  { label: "📅 Datum", days: null }, // calendar picker
];

const STEP_W = 34; // px per step
const MAX_RIGHT = WIEDERVORLAGE_STEPS.length * STEP_W + 10;
const MAX_LEFT = 110;

function addDays(d) {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function vibrate(p) {
  if (navigator.vibrate) navigator.vibrate(p);
}

// Done/Archive celebration animation
function BurstAnimation({ onDone, color = "#22c55e" }) {
  const sparks = Array.from({ length: 14 }).map((_, i) => {
    const angle = (i / 14) * 360;
    const dist = 40 + Math.random() * 30;
    const rad = (angle * Math.PI) / 180;
    return { dx: Math.cos(rad) * dist, dy: Math.sin(rad) * dist, size: 3 + Math.random() * 4 };
  });

  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center overflow-visible">
      {/* Ripples */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="absolute rounded-full" style={{
          border: `2px solid ${color}`,
          animation: `burst-ripple 0.8s ease-out ${i * 0.15}s forwards`,
          opacity: 0,
        }} />
      ))}
      {/* Sparks */}
      {sparks.map((s, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: s.size, height: s.size,
          background: i % 3 === 0 ? color : i % 3 === 1 ? "#facc15" : "#818cf8",
          animation: `spark-fly 0.9s ease-out ${i * 0.03}s forwards`,
          "--dx": `${s.dx}px`,
          "--dy": `${s.dy}px`,
        }} />
      ))}
      {/* Icon */}
      <div className="absolute flex items-center justify-center" style={{
        animation: "done-icon 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both",
        fontSize: 28,
      }}>
        ✓
      </div>
      <style>{`
        @keyframes burst-ripple {
          0% { width: 20px; height: 20px; opacity: 0.8; }
          100% { width: 100px; height: 100px; opacity: 0; }
        }
        @keyframes spark-fly {
          0% { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
        @keyframes done-icon {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function SwipeableTodoCard({ todo, onClick }) {
  const { user } = useFirebaseAuth();
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [showBurst, setShowBurst] = useState(null); // "done" | "archive"
  const [showCalendar, setShowCalendar] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dx = useRef(0);
  const lockedStage = useRef(-1);
  const confirmTimer = useRef(null);

  // Auto-dismiss confirmation after 2.3s
  useEffect(() => {
    if (confirmed) {
      confirmTimer.current = setTimeout(() => {
        setConfirmed(null);
        setOffsetX(0);
      }, 2300);
    }
    return () => clearTimeout(confirmTimer.current);
  }, [confirmed]);

  const onTouchStart = (e) => {
    if (confirmed || showBurst) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dx.current = 0;
    lockedStage.current = -1;
    setDragging(false);
  };

  const onTouchMove = (e) => {
    if (confirmed || showBurst) return;
    const ddx = e.touches[0].clientX - startX.current;
    const ddy = Math.abs(e.touches[0].clientY - startY.current);
    if (!dragging && Math.abs(ddx) < 6) return;
    if (!dragging && ddy > Math.abs(ddx)) return;
    setDragging(true);
    dx.current = ddx;

    if (ddx < 0) {
      // Left: done / delete
      const clamped = Math.max(ddx, -MAX_LEFT);
      setOffsetX(clamped);
      const stage = Math.abs(clamped) > 70 ? 1 : Math.abs(clamped) > 30 ? 0 : -1;
      if (stage !== lockedStage.current) {
        lockedStage.current = stage;
        if (stage >= 0) vibrate(stage === 0 ? 8 : [8, 20, 8]);
      }
    } else if (ddx > 0) {
      const stageIdx = Math.min(Math.floor(ddx / STEP_W), WIEDERVORLAGE_STEPS.length - 1);
      const clamped = Math.min(ddx, MAX_RIGHT);
      setOffsetX(clamped);
      if (stageIdx !== lockedStage.current) {
        lockedStage.current = stageIdx;
        vibrate(12);
      }
    }
  };

  const onTouchEnd = () => {
    if (confirmed || showBurst) return;
    setDragging(false);
    const d = dx.current;

    if (d < -70) {
      setConfirmed({ action: "delete", label: "🗑 Löschen?" });
      setOffsetX(0);
    } else if (d < -28) {
      setConfirmed({ action: "done", label: "✓ Erledigt?" });
      setOffsetX(0);
    } else if (d > STEP_W * 0.7) {
      const stageIdx = Math.min(Math.floor(d / STEP_W), WIEDERVORLAGE_STEPS.length - 1);
      const step = WIEDERVORLAGE_STEPS[stageIdx];
      if (step.days === null) {
        // Calendar picker
        setShowCalendar(true);
        setOffsetX(0);
      } else {
        setConfirmed({ action: "wiedervorlage", label: `📅 ${step.label}?`, days: step.days });
        setOffsetX(0);
      }
    } else {
      setOffsetX(0);
    }
    lockedStage.current = -1;
    dx.current = 0;
  };

  const executeAction = async (action, days) => {
    clearTimeout(confirmTimer.current);
    setConfirmed(null);

    if (action === "done") {
      setShowBurst("done");
      await updateTodo(user.uid, todo.id, { status: "erledigt" });
    } else if (action === "delete") {
      await deleteTodo(user.uid, todo.id);
    } else if (action === "wiedervorlage") {
      setShowBurst("wiedervorlage");
      await updateTodo(user.uid, todo.id, { wiedervorlage: addDays(days) });
    } else if (action === "archive") {
      setShowBurst("archive");
      await updateTodo(user.uid, todo.id, { archived: true, status: "erledigt" });
    }
  };

  const handleCalendarChange = async (e) => {
    const date = new Date(e.target.value);
    setShowCalendar(false);
    if (!isNaN(date.getTime())) {
      setShowBurst("wiedervorlage");
      await updateTodo(user.uid, todo.id, { wiedervorlage: date });
    }
  };

  const handleCardClick = () => {
    if (confirmed) {
      executeAction(confirmed.action, confirmed.days);
    } else if (!dragging) {
      onClick(todo);
    }
  };

  // Swipe indicator
  const rightStageIdx = offsetX > 0 ? Math.min(Math.floor(offsetX / STEP_W), WIEDERVORLAGE_STEPS.length - 1) : -1;
  const rightLabel = rightStageIdx >= 0 ? WIEDERVORLAGE_STEPS[rightStageIdx].label : null;
  const leftIcon = offsetX < -70 ? "🗑" : offsetX < -28 ? "✓" : null;

  const isOverdue = todo.deadline && (() => {
    const d = todo.deadline.toDate ? todo.deadline.toDate() : new Date(todo.deadline);
    return d < new Date() && todo.status !== "erledigt";
  })();

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: 56 }}>
      {/* Burst overlay */}
      {showBurst && (
        <BurstAnimation
          color={showBurst === "done" ? "#22c55e" : showBurst === "archive" ? "#f59e0b" : "#818cf8"}
          onDone={() => setShowBurst(null)}
        />
      )}

      {/* Background hint - left */}
      {offsetX < -20 && (
        <div className="absolute inset-0 flex items-center justify-end px-4 pointer-events-none"
          style={{ background: offsetX < -70 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)" }}>
          <span className="text-lg">{offsetX < -70 ? "🗑" : "✓"}</span>
        </div>
      )}

      {/* Background hint - right */}
      {offsetX > 20 && rightLabel && (
        <div className="absolute inset-0 flex items-center justify-start px-4 pointer-events-none"
          style={{ background: "rgba(99,102,241,0.08)" }}>
          <div className="flex flex-col items-start">
            <span className="text-xs font-bold text-indigo-500">{rightLabel}</span>
            {/* Step indicators */}
            <div className="flex gap-0.5 mt-0.5">
              {WIEDERVORLAGE_STEPS.map((_, i) => (
                <div key={i} className="h-1 rounded-full transition-all" style={{
                  width: 6,
                  background: i <= rightStageIdx ? "#818cf8" : "rgba(99,102,241,0.2)",
                }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm overlay */}
      {confirmed && (
        <div onClick={() => executeAction(confirmed.action, confirmed.days)}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl cursor-pointer"
          style={{
            background: confirmed.action === "delete"
              ? "linear-gradient(135deg, rgba(239,68,68,0.92), rgba(220,38,38,0.88))"
              : confirmed.action === "done"
              ? "linear-gradient(135deg, rgba(34,197,94,0.92), rgba(16,185,129,0.88))"
              : "linear-gradient(135deg, rgba(99,102,241,0.92), rgba(139,92,246,0.88))",
            backdropFilter: "blur(4px)",
          }}>
          <span className="text-white font-bold text-sm">{confirmed.label}</span>
          <span className="text-white/70 text-[10px] mt-0.5">Tippen zum Bestätigen</span>
        </div>
      )}

      {/* Calendar picker */}
      {showCalendar && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/95 backdrop-blur-sm shadow-lg border border-indigo-200">
          <div className="flex flex-col items-center gap-2 p-4">
            <span className="text-xs font-bold text-slate-600">Wiedervorlage-Datum</span>
            <input type="date" className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              onChange={handleCalendarChange} />
            <button onClick={() => setShowCalendar(false)} className="text-[11px] text-slate-400 mt-1">Abbrechen</button>
          </div>
        </div>
      )}

      {/* Card */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleCardClick}
        className={`relative flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm cursor-pointer ${todo.status === "erledigt" ? "opacity-55" : ""}`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging ? "none" : "transform 0.28s cubic-bezier(.22,.68,0,1.2)",
          touchAction: "pan-y",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        {/* Prio dot */}
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PRIO_DOT[todo.prio] || PRIO_DOT.B }} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${todo.status === "erledigt" ? "line-through text-slate-400" : "text-slate-800"}`}>
            {todo.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {todo.category && <span className="text-[10px] text-slate-400">{todo.category}</span>}
            {todo.deadline && (
              <span className={`text-[10px] font-medium ${isOverdue ? "text-red-500" : "text-slate-400"}`}>
                {isOverdue ? "⚠ " : ""}{formatDate(todo.deadline)}
              </span>
            )}
            {todo.wiedervorlage && (
              <span className="text-[10px] text-indigo-400">📅 {formatDate(todo.wiedervorlage)}</span>
            )}
          </div>
        </div>

        {/* Prio badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
          todo.prio === "A" ? "bg-red-100 text-red-600" : todo.prio === "C" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
        }`}>{todo.prio}</span>

        {/* Status */}
        <span className={`text-[11px] ${todo.status === "erledigt" ? "text-green-500" : "text-slate-400"}`}>
          {STATUS_ICON[todo.status] || "○"}
        </span>
      </div>
    </div>
  );
}