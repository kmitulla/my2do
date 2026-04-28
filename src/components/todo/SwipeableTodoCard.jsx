import React, { useRef, useState, useEffect, useCallback } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { updateTodo, deleteTodo } from "@/lib/todoService";

const PRIO_DOT = { A: "#f87171", B: "#fbbf24", C: "#4ade80" };

// SVG icons instead of emojis
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconArchive = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconWarning = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconPlay = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);
const IconPause = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
);
const IconDone = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);

// +1 … +7 days only (no calendar step)
const WIEDERVORLAGE_STEPS = [
  { label: "+1", days: 1 },
  { label: "+2", days: 2 },
  { label: "+3", days: 3 },
  { label: "+4", days: 4 },
  { label: "+5", days: 5 },
  { label: "+6", days: 6 },
  { label: "+7", days: 7 },
];

const LEFT_STAGES = [
  { threshold: 38,  label: "Erledigt",    action: "done",    bg: "rgba(34,197,94,0.92)",  bg2: "rgba(16,185,129,0.88)",  Icon: IconCheck },
  { threshold: 80,  label: "Archivieren", action: "archive", bg: "rgba(245,158,11,0.92)", bg2: "rgba(217,119,6,0.88)",   Icon: IconArchive },
  { threshold: 130, label: "Löschen",     action: "delete",  bg: "rgba(239,68,68,0.92)",  bg2: "rgba(220,38,38,0.88)",   Icon: IconTrash },
];

const STEP_W = 38;
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

function formatCreatedAt(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
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
          "--dx": `${s.dx}px`, "--dy": `${s.dy}px`,
        }} />
      ))}
      <style>{`
        @keyframes burst-ripple { 0% { width:20px;height:20px;opacity:0.8 } 100% { width:100px;height:100px;opacity:0 } }
        @keyframes spark-fly { 0% { transform:translate(0,0) scale(1);opacity:1 } 100% { transform:translate(var(--dx),var(--dy)) scale(0);opacity:0 } }
      `}</style>
    </div>
  );
}

export default function SwipeableTodoCard({ todo, onClick }) {
  const { user } = useFirebaseAuth();
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [showBurst, setShowBurst] = useState(null);

  const startX = useRef(0);
  const startY = useRef(0);
  const dx = useRef(0);
  const lockedStage = useRef(-1);
  const confirmTimer = useRef(null);
  const isDirectional = useRef(null);
  const isDragging = useRef(false);
  const mouseDown = useRef(false);

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

  const handlePointerStart = useCallback((clientX, clientY) => {
    if (confirmed || showBurst) return;
    startX.current = clientX;
    startY.current = clientY;
    dx.current = 0;
    lockedStage.current = -1;
    isDirectional.current = null;
    isDragging.current = false;
    setDragging(false);
  }, [confirmed, showBurst]);

  const handlePointerMove = useCallback((clientX, clientY) => {
    if (confirmed || showBurst) return;
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
  }, [confirmed, showBurst]);

  const handlePointerEnd = useCallback(() => {
    if (confirmed || showBurst) return;
    setDragging(false);
    const d = dx.current;
    isDirectional.current = null;

    // Reset isDragging after a short delay so click handler sees it correctly
    setTimeout(() => { isDragging.current = false; }, 50);

    if (d < -LEFT_STAGES[0].threshold) {
      const abs = Math.abs(d);
      let picked = LEFT_STAGES[0];
      for (const s of LEFT_STAGES) { if (abs >= s.threshold) picked = s; }
      setConfirmed({ action: picked.action, label: picked.label, bg: picked.bg, bg2: picked.bg2, Icon: picked.Icon });
      setOffsetX(0);
    } else if (d > STEP_W * 0.7) {
      const stageIdx = Math.min(Math.floor(d / STEP_W), WIEDERVORLAGE_STEPS.length - 1);
      const step = WIEDERVORLAGE_STEPS[stageIdx];
      // Alle Wiedervorlage-Schritte direkt speichern (kein extra Confirm)
      const newDate = addDays(step.days);
      setOffsetX(0);
      setShowBurst("wiedervorlage");
      updateTodo(user.uid, todo.id, { wiedervorlage: newDate });
    } else {
      setOffsetX(0);
    }
    lockedStage.current = -1;
    dx.current = 0;
  }, [confirmed, showBurst, user.uid, todo.id]);

  // Touch events
  const onTouchStart = (e) => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = (e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchEnd = () => handlePointerEnd();

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    mouseDown.current = true;
    handlePointerStart(e.clientX, e.clientY);
  };
  const onMouseMove = (e) => { if (!mouseDown.current) return; handlePointerMove(e.clientX, e.clientY); };
  const onMouseUp = () => { if (!mouseDown.current) return; mouseDown.current = false; handlePointerEnd(); };

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  });

  const executeConfirmed = async () => {
    if (!confirmed) return;
    clearTimeout(confirmTimer.current);
    const action = confirmed.action;
    setConfirmed(null);
    if (action === "done") {
      setShowBurst("done");
      await updateTodo(user.uid, todo.id, { status: "erledigt" });
    } else if (action === "archive") {
      setShowBurst("archive");
      await updateTodo(user.uid, todo.id, { archived: true, status: "erledigt" });
    } else if (action === "delete") {
      await deleteTodo(user.uid, todo.id);
    } else if (action === "wiedervorlage7") {
      setShowBurst("wiedervorlage");
      await updateTodo(user.uid, todo.id, { wiedervorlage: addDays(7) });
    }
  };

  const handleCardClick = () => {
    if (confirmed) {
      executeConfirmed();
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

  const statusIcon = todo.status === "erledigt"
    ? <IconDone />
    : todo.status === "in Arbeit"
    ? <IconPlay />
    : todo.status === "wartend"
    ? <IconPause />
    : <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 inline-block" />;

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
            <leftStage.Icon />
            <span className="text-[10px] font-bold text-white/80">{leftStage.label}</span>
          </div>
        </div>
      )}

      {/* Right background hint (while dragging) */}
      {offsetX > 20 && rightLabel && (
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

      {/* Confirm overlay */}
      {confirmed && (
        <div
          onClick={(e) => { e.stopPropagation(); executeConfirmed(); }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl cursor-pointer"
          style={{ background: `linear-gradient(135deg, ${confirmed.bg}, ${confirmed.bg2})`, backdropFilter: "blur(4px)" }}>
          <span className="text-white font-bold text-sm">{confirmed.label}?</span>
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
              <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isOverdue ? "text-red-500" : "text-slate-400"}`}>
                {isOverdue ? <IconWarning /> : <IconCalendar />}
                {formatDate(todo.deadline)}
              </span>
            )}
            {todo.wiedervorlage && (
              <span className="flex items-center gap-0.5 text-[10px] text-indigo-400">
                <IconClock />{formatDate(todo.wiedervorlage)}
              </span>
            )}
            {todo.createdAt && (
              <span className="text-[10px] text-slate-300 ml-auto">
                {formatCreatedAt(todo.createdAt)}
              </span>
            )}
          </div>
        </div>

        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
          todo.prio === "A" ? "bg-red-100 text-red-600" : todo.prio === "C" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
        }`}>{todo.prio}</span>

        <span className={`flex-shrink-0 ${todo.status === "erledigt" ? "text-green-500" : "text-slate-400"}`}>
          {statusIcon}
        </span>
      </div>
    </div>
  );
}