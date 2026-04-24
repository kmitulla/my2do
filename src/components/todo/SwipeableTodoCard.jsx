import React, { useRef, useState, useEffect, useCallback, useId } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { updateTodo, deleteTodo } from "@/lib/todoService";

const PRIO_DOT = { A: "#f87171", B: "#fbbf24", C: "#4ade80" };
const STATUS_ICON = { erledigt: "✓", "in Arbeit": "▶", wartend: "⏸" };

const WIEDERVORLAGE_STEPS = [
  { label: "+1", days: 1 },
  { label: "+2", days: 2 },
  { label: "+3", days: 3 },
  { label: "+4", days: 4 },
  { label: "+5", days: 5 },
  { label: "+6", days: 6 },
  { label: "+7", days: 7 },
  { label: "📅", days: null }, // calendar
];

const LEFT_STAGES = [
  { threshold: 38,  label: "✓ Erledigt",    action: "done",    bg: "rgba(34,197,94,0.92)",  bg2: "rgba(16,185,129,0.88)" },
  { threshold: 80,  label: "📦 Archivieren", action: "archive", bg: "rgba(245,158,11,0.92)", bg2: "rgba(217,119,6,0.88)" },
  { threshold: 130, label: "🗑 Löschen",     action: "delete",  bg: "rgba(239,68,68,0.92)",  bg2: "rgba(220,38,38,0.88)" },
];

const STEP_W = 34;
const MAX_RIGHT = WIEDERVORLAGE_STEPS.length * STEP_W + 10;
const MAX_LEFT = 150;

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
      {[0, 1, 2].map((i) => (
        <div key={i} className="absolute rounded-full" style={{
          border: `2px solid ${color}`,
          animation: `burst-ripple 0.8s ease-out ${i * 0.15}s forwards`,
          opacity: 0,
        }} />
      ))}
      {sparks.map((s, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: s.size, height: s.size,
          background: i % 3 === 0 ? color : i % 3 === 1 ? "#facc15" : "#818cf8",
          animation: `spark-fly 0.9s ease-out ${i * 0.03}s forwards`,
          "--dx": `${s.dx}px`,
          "--dy": `${s.dy}px`,
        }} />
      ))}
      <div className="absolute" style={{ animation: "done-icon 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both", fontSize: 28 }}>✓</div>
      <style>{`
        @keyframes burst-ripple { 0% { width:20px;height:20px;opacity:0.8 } 100% { width:100px;height:100px;opacity:0 } }
        @keyframes spark-fly { 0% { transform:translate(0,0) scale(1);opacity:1 } 100% { transform:translate(var(--dx),var(--dy)) scale(0);opacity:0 } }
        @keyframes done-icon { 0% { transform:scale(0) rotate(-30deg);opacity:0 } 100% { transform:scale(1) rotate(0deg);opacity:1 } }
      `}</style>
    </div>
  );
}

// Calendar button using label+input trick — no showPicker needed, works in iframes
function CalendarPickerButton({ onPick }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-600 cursor-pointer select-none active:scale-95 transition-all"
      onClick={(e) => e.stopPropagation()}
    >
      📅
      <input
        id={id}
        type="date"
        min={new Date().toISOString().split("T")[0]}
        onChange={(e) => { if (e.target.value) onPick(new Date(e.target.value)); }}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
      />
    </label>
  );
}

export default function SwipeableTodoCard({ todo, onClick }) {
  const { user } = useFirebaseAuth();
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // only for left-swipe actions
  const [showBurst, setShowBurst] = useState(null);
  // When swiped right and released on calendar step → keep card revealed + show picker
  const [showCalendarReveal, setShowCalendarReveal] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const dx = useRef(0);
  const lockedStage = useRef(-1);
  const confirmTimer = useRef(null);
  const isDirectional = useRef(null);
  const isDragging = useRef(false);

  // Auto-dismiss left-swipe confirmation after 2.3s
  useEffect(() => {
    if (confirmed) {
      confirmTimer.current = setTimeout(() => {
        setConfirmed(null);
        setOffsetX(0);
      }, 2300);
    }
    return () => clearTimeout(confirmTimer.current);
  }, [confirmed]);

  // Auto-dismiss calendar reveal after 8s if no pick
  useEffect(() => {
    if (showCalendarReveal) {
      const t = setTimeout(() => {
        setShowCalendarReveal(false);
        setOffsetX(0);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [showCalendarReveal]);

  const handlePointerStart = useCallback((clientX, clientY) => {
    if (confirmed || showBurst || showCalendarReveal) return;
    startX.current = clientX;
    startY.current = clientY;
    dx.current = 0;
    lockedStage.current = -1;
    isDirectional.current = null;
    isDragging.current = false;
    setDragging(false);
  }, [confirmed, showBurst, showCalendarReveal]);

  const handlePointerMove = useCallback((clientX, clientY) => {
    if (confirmed || showBurst || showCalendarReveal) return;
    const ddx = clientX - startX.current;
    const ddy = clientY - startY.current;

    if (!isDirectional.current) {
      if (Math.abs(ddx) < 5 && Math.abs(ddy) < 5) return;
      isDirectional.current = Math.abs(ddx) >= Math.abs(ddy) ? "h" : "v";
    }
    if (isDirectional.current === "v") return;

    isDragging.current = true;
    setDragging(true);
    dx.current = ddx;

    if (ddx < 0) {
      const clamped = Math.max(ddx, -MAX_LEFT);
      setOffsetX(clamped);
      const abs = Math.abs(clamped);
      const stageIdx = LEFT_STAGES.findIndex((s) => abs < s.threshold);
      const stage = stageIdx === -1 ? LEFT_STAGES.length - 1 : stageIdx;
      if (stage !== lockedStage.current) {
        lockedStage.current = stage;
        vibrate(stage === 0 ? 8 : stage === 1 ? [8, 20, 8] : [10, 30, 10, 30, 10]);
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
  }, [confirmed, showBurst, showCalendarReveal]);

  const handlePointerEnd = useCallback(() => {
    if (confirmed || showBurst || showCalendarReveal) return;
    setDragging(false);
    const d = dx.current;
    isDirectional.current = null;

    if (d < -LEFT_STAGES[0].threshold) {
      const abs = Math.abs(d);
      let picked = LEFT_STAGES[0];
      for (const s of LEFT_STAGES) { if (abs >= s.threshold) picked = s; }
      setConfirmed({ action: picked.action, label: `${picked.label}?`, bg: picked.bg, bg2: picked.bg2 });
      setOffsetX(0);
    } else if (d > STEP_W * 0.7) {
      const stageIdx = Math.min(Math.floor(d / STEP_W), WIEDERVORLAGE_STEPS.length - 1);
      const step = WIEDERVORLAGE_STEPS[stageIdx];
      if (step.days === null) {
        // Calendar step: keep card slid open, show the picker buttons
        setShowCalendarReveal(true);
        setOffsetX(MAX_RIGHT); // keep fully revealed
      } else {
        // Direct wiedervorlage +n days — no confirmation needed
        const newDate = addDays(step.days);
        setOffsetX(0);
        setShowBurst("wiedervorlage");
        updateTodo(user.uid, todo.id, { wiedervorlage: newDate });
      }
    } else {
      setOffsetX(0);
    }
    lockedStage.current = -1;
    dx.current = 0;
  }, [confirmed, showBurst, showCalendarReveal, user.uid, todo.id]);

  // Touch events
  const onTouchStart = (e) => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handlePointerEnd();

  // Mouse events (for desktop)
  const mouseDown = useRef(false);
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    mouseDown.current = true;
    handlePointerStart(e.clientX, e.clientY);
  };
  const onMouseMove = (e) => {
    if (!mouseDown.current) return;
    handlePointerMove(e.clientX, e.clientY);
  };
  const onMouseUp = () => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    handlePointerEnd();
  };

  useEffect(() => {
    const move = (e) => onMouseMove(e);
    const up = () => onMouseUp();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });

  const executeLeftAction = async (action) => {
    clearTimeout(confirmTimer.current);
    setConfirmed(null);
    if (action === "done") {
      setShowBurst("done");
      await updateTodo(user.uid, todo.id, { status: "erledigt" });
    } else if (action === "archive") {
      setShowBurst("archive");
      await updateTodo(user.uid, todo.id, { archived: true, status: "erledigt" });
    } else if (action === "delete") {
      await deleteTodo(user.uid, todo.id);
    }
  };

  const handleDatePicked = async (date) => {
    setShowCalendarReveal(false);
    setOffsetX(0);
    setShowBurst("wiedervorlage");
    await updateTodo(user.uid, todo.id, { wiedervorlage: date });
  };

  const handleCardClick = () => {
    if (showCalendarReveal) return;
    if (confirmed) {
      executeLeftAction(confirmed.action);
    } else if (!isDragging.current) {
      onClick(todo);
    }
  };

  const rightStageIdx = offsetX > 0 ? Math.min(Math.floor(offsetX / STEP_W), WIEDERVORLAGE_STEPS.length - 1) : -1;
  const rightLabel = rightStageIdx >= 0 ? WIEDERVORLAGE_STEPS[rightStageIdx].label : null;

  const absLeft = Math.abs(Math.min(offsetX, 0));
  const leftStage = LEFT_STAGES.reduce((acc, s) => (absLeft >= s.threshold ? s : acc), null);

  const isOverdue = todo.deadline && (() => {
    const d = todo.deadline.toDate ? todo.deadline.toDate() : new Date(todo.deadline);
    return d < new Date() && todo.status !== "erledigt";
  })();

  return (
    <div className="relative overflow-visible rounded-2xl" style={{ minHeight: 56 }}>
      {showBurst && (
        <BurstAnimation
          color={showBurst === "done" ? "#22c55e" : showBurst === "archive" ? "#f59e0b" : "#818cf8"}
          onDone={() => setShowBurst(null)}
        />
      )}

      {/* Left background hint */}
      {offsetX < -20 && leftStage && (
        <div className="absolute inset-0 flex items-center justify-end px-4 pointer-events-none rounded-2xl"
          style={{ background: `linear-gradient(270deg, ${leftStage.bg2}, transparent)`, opacity: 0.15 + Math.min(absLeft / MAX_LEFT, 1) * 0.4 }}>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-base">{leftStage.label.split(" ")[0]}</span>
            <span className="text-[10px] font-bold text-white/80">{leftStage.label.slice(leftStage.label.indexOf(" ") + 1)}</span>
          </div>
        </div>
      )}

      {/* Right background hint (while dragging) */}
      {offsetX > 20 && !showCalendarReveal && rightLabel && (
        <div className="absolute inset-0 flex items-center justify-start px-4 pointer-events-none rounded-2xl"
          style={{ background: "rgba(99,102,241,0.08)" }}>
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-xs font-bold text-indigo-500">{rightLabel}</span>
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

      {/* Calendar reveal panel — visible behind the card when swiped to calendar step */}
      {showCalendarReveal && (
        <div className="absolute inset-0 flex items-center justify-start pl-3 gap-1.5 rounded-2xl"
          style={{ background: "rgba(99,102,241,0.1)" }}>
          <span className="text-[10px] font-semibold text-indigo-500 mr-0.5">Datum:</span>
          <CalendarPickerButton onPick={handleDatePicked} />
          <button
            onClick={(e) => { e.stopPropagation(); setShowCalendarReveal(false); setOffsetX(0); }}
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-200 text-slate-500 active:scale-95 transition-all"
          >✕</button>
        </div>
      )}

      {/* Left-swipe confirm overlay */}
      {confirmed && (
        <div
          onClick={(e) => { e.stopPropagation(); executeLeftAction(confirmed.action); }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl cursor-pointer"
          style={{ background: `linear-gradient(135deg, ${confirmed.bg}, ${confirmed.bg2})`, backdropFilter: "blur(4px)" }}>
          <span className="text-white font-bold text-sm">{confirmed.label}</span>
          <span className="text-white/70 text-[10px] mt-0.5">Tippen zum Bestätigen</span>
        </div>
      )}

      {/* Card */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onClick={handleCardClick}
        className={`relative flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm cursor-pointer select-none ${todo.status === "erledigt" ? "opacity-55" : ""}`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging ? "none" : "transform 0.28s cubic-bezier(.22,.68,0,1.2)",
          touchAction: "pan-y",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PRIO_DOT[todo.prio] || PRIO_DOT.B }} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${todo.status === "erledigt" ? "line-through text-slate-400" : "text-slate-800"}`}>
            {todo.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
          todo.prio === "A" ? "bg-red-100 text-red-600" : todo.prio === "C" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
        }`}>{todo.prio}</span>

        <span className={`text-[11px] flex-shrink-0 ${todo.status === "erledigt" ? "text-green-500" : "text-slate-400"}`}>
          {STATUS_ICON[todo.status] || "○"}
        </span>
      </div>
    </div>
  );
}