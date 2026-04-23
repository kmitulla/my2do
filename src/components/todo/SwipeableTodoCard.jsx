import React, { useRef, useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { updateTodo, deleteTodo } from "@/lib/todoService";

const PRIO_COLORS = { A: "bg-red-100 text-red-600 border-red-200", B: "bg-amber-100 text-amber-600 border-amber-200", C: "bg-green-100 text-green-600 border-green-200" };
const STATUS_COLORS = { offen: "text-slate-400", erledigt: "text-green-500", "in Bearbeitung": "text-blue-500", warten: "text-amber-500" };

const WIEDERVORLAGE_STEPS = [
  { label: "Morgen", days: 1 },
  { label: "3 Tage", days: 3 },
  { label: "1 Woche", days: 7 },
  { label: "2 Wochen", days: 14 },
  { label: "1 Monat", days: 30 },
];

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

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

const STEP_WIDTH = 36; // px per wiedervorlage step
const MAX_LEFT = 100;  // px max left swipe (delete/done zone)

export default function SwipeableTodoCard({ todo, onClick }) {
  const { user } = useFirebaseAuth();
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // { action, label, wDate? }
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const lockedStage = useRef(-1);
  const cardRef = useRef(null);

  // ---- Touch handlers ----
  const onTouchStart = (e) => {
    if (confirmed) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    lockedStage.current = -1;
    setIsDragging(false);
  };

  const onTouchMove = (e) => {
    if (confirmed) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    if (!isDragging && Math.abs(dx) < 8) return;
    if (!isDragging && dy > Math.abs(dx)) return; // vertical scroll wins

    setIsDragging(true);
    currentX.current = dx;

    if (dx < 0) {
      // Swipe LEFT → done / delete
      const clamped = Math.max(dx, -MAX_LEFT);
      setOffsetX(clamped);
      // Haptic stages
      const stage = Math.abs(clamped) > 60 ? 1 : Math.abs(clamped) > 30 ? 0 : -1;
      if (stage !== lockedStage.current) {
        lockedStage.current = stage;
        if (stage >= 0) vibrate(stage === 0 ? 10 : [10, 30, 10]);
      }
    } else if (dx > 0) {
      // Swipe RIGHT → Wiedervorlage
      const stageIdx = Math.min(Math.floor(dx / STEP_WIDTH), WIEDERVORLAGE_STEPS.length - 1);
      const clamped = Math.min(dx, WIEDERVORLAGE_STEPS.length * STEP_WIDTH);
      setOffsetX(clamped);
      if (stageIdx !== lockedStage.current && stageIdx >= 0) {
        lockedStage.current = stageIdx;
        vibrate(15);
      }
    }
  };

  const onTouchEnd = () => {
    if (confirmed) return;
    setIsDragging(false);
    const dx = currentX.current;

    if (dx < -60) {
      // Confirm delete
      setConfirmed({ action: "delete", label: "🗑 Löschen?" });
      setOffsetX(0);
    } else if (dx < -25) {
      // Confirm done
      setConfirmed({ action: "done", label: "✓ Erledigt?" });
      setOffsetX(0);
    } else if (dx > STEP_WIDTH * 0.8) {
      const stageIdx = Math.min(Math.floor(dx / STEP_WIDTH), WIEDERVORLAGE_STEPS.length - 1);
      const step = WIEDERVORLAGE_STEPS[stageIdx];
      setConfirmed({ action: "wiedervorlage", label: `📅 ${step.label}?`, days: step.days });
      setOffsetX(0);
    } else {
      setOffsetX(0);
    }
    lockedStage.current = -1;
  };

  const handleConfirmTap = async () => {
    if (!confirmed) return;
    const { action, days } = confirmed;
    setConfirmed(null);

    if (action === "done") {
      await updateTodo(user.uid, todo.id, { status: "erledigt" });
    } else if (action === "delete") {
      await deleteTodo(user.uid, todo.id);
    } else if (action === "wiedervorlage") {
      await updateTodo(user.uid, todo.id, { wiedervorlage: addDays(days) });
    }
  };

  const handleCardClick = () => {
    if (confirmed) {
      handleConfirmTap();
    } else {
      onClick(todo);
    }
  };

  // Determine background hint
  const leftBg = offsetX < -60 ? "bg-red-50" : offsetX < -20 ? "bg-green-50" : "";
  const rightBg = offsetX > 20 ? "bg-blue-50" : "";
  const bgHint = leftBg || rightBg || "";

  // Right side label for wiedervorlage
  const wStageIdx = offsetX > 0 ? Math.min(Math.floor(offsetX / STEP_WIDTH), WIEDERVORLAGE_STEPS.length - 1) : -1;
  const wLabel = wStageIdx >= 0 ? WIEDERVORLAGE_STEPS[wStageIdx].label : null;

  const isOverdue = todo.deadline && (() => {
    const d = todo.deadline.toDate ? todo.deadline.toDate() : new Date(todo.deadline);
    return d < new Date() && todo.status !== "erledigt";
  })();

  return (
    <div className="relative overflow-hidden rounded-2xl select-none">
      {/* Background action hints */}
      {offsetX < -20 && (
        <div className="absolute inset-0 flex items-center px-5 justify-end pointer-events-none">
          <span className="text-sm font-semibold text-slate-500">{offsetX < -60 ? "🗑" : "✓"}</span>
        </div>
      )}
      {offsetX > 20 && wLabel && (
        <div className="absolute inset-0 flex items-center px-5 justify-start pointer-events-none">
          <span className="text-sm font-semibold text-blue-400">📅 {wLabel}</span>
        </div>
      )}

      {/* Confirmation overlay */}
      {confirmed && (
        <div
          onClick={handleConfirmTap}
          className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-blue-500/90 cursor-pointer"
        >
          <span className="text-white font-bold text-sm">{confirmed.label} Tippen zum Bestätigen</span>
        </div>
      )}

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleCardClick}
        className={`relative flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm transition-colors cursor-pointer active:bg-slate-50 ${bgHint} ${todo.status === "erledigt" ? "opacity-60" : ""}`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(.22,.68,0,1.2)",
          touchAction: "pan-y",
        }}
      >
        {/* Priority dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${todo.prio === "A" ? "bg-red-400" : todo.prio === "C" ? "bg-green-400" : "bg-amber-400"}`} />

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
              <span className="text-[10px] text-blue-400">📅 {formatDate(todo.wiedervorlage)}</span>
            )}
          </div>
        </div>

        {/* Prio badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${PRIO_COLORS[todo.prio] || PRIO_COLORS.B}`}>
          {todo.prio}
        </span>

        {/* Status dot */}
        <span className={`text-[10px] ${STATUS_COLORS[todo.status] || "text-slate-400"}`}>
          {todo.status === "erledigt" ? "✓" : todo.status === "in Bearbeitung" ? "▶" : todo.status === "warten" ? "⏸" : "○"}
        </span>
      </div>
    </div>
  );
}