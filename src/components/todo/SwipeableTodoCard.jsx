import React, { useRef, useState } from "react";
import { updateTodo, deleteTodo } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIO_STYLES = {
  A: { bar: "bg-red-500", badge: "bg-red-100 text-red-600 border-red-200", label: "Prio A" },
  B: { bar: "bg-orange-400", badge: "bg-orange-100 text-orange-600 border-orange-200", label: "Prio B" },
  C: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-600 border-emerald-200", label: "Prio C" },
};

const STATUS_STYLES = {
  offen: "bg-slate-100 text-slate-600",
  "in Arbeit": "bg-blue-100 text-blue-600",
  erledigt: "bg-emerald-100 text-emerald-600",
  wartend: "bg-amber-100 text-amber-600",
};

function formatDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "dd.MM.yy", { locale: de });
}

// Swipe stages for LEFT swipe (Wiedervorlage)
// Stage 0: no swipe, Stage 1-7: +1..+7 Tage, Stage 8: Kalender öffnen
const WV_STAGES = [1, 2, 3, 4, 5, 6, 7, "📅"];
const STAGE_WIDTH = 48; // px per stage

export default function SwipeableTodoCard({ todo, onClick }) {
  const { user } = useFirebaseAuth();
  const prio = PRIO_STYLES[todo.prio] || PRIO_STYLES.B;
  const isOverdue = todo.deadline && !["erledigt"].includes(todo.status) &&
    (todo.deadline.toDate ? todo.deadline.toDate() : new Date(todo.deadline)) < new Date();

  // Swipe state
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const startXRef = useRef(null);
  const startYRef = useRef(null);
  const isHorizontalRef = useRef(null);
  const cardRef = useRef(null);

  // Stage for left swipe (wiedervorlage): negative offsetX
  const leftStage = Math.min(Math.floor(Math.abs(Math.min(offsetX, 0)) / STAGE_WIDTH), WV_STAGES.length);

  // Right swipe stages: positive offsetX
  // Stage 1 (80px): Erledigt/Archivieren, Stage 2 (160px+): Löschen
  const rightStage = offsetX > 0 ? (offsetX >= 160 ? 2 : offsetX >= 80 ? 1 : 0) : 0;

  const getWiedervorlageDate = () => {
    const base = todo.wiedervorlage
      ? (todo.wiedervorlage.toDate ? todo.wiedervorlage.toDate() : new Date(todo.wiedervorlage))
      : new Date();
    const d = new Date(base);
    d.setDate(d.getDate() + leftStage);
    return d;
  };

  const onPointerDown = (e) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isHorizontalRef.current = null;
    setIsDragging(false);
  };

  const onPointerMove = (e) => {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    // Determine axis on first significant movement
    if (isHorizontalRef.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }

    if (!isHorizontalRef.current) return; // vertical → don't swipe

    e.preventDefault();
    setIsDragging(true);
    // Limit left swipe to 8 stages, right swipe to 200px
    const maxLeft = -(WV_STAGES.length * STAGE_WIDTH);
    const clamped = Math.max(maxLeft, Math.min(200, dx));
    setOffsetX(clamped);
  };

  const onPointerUp = async (e) => {
    if (startXRef.current === null) return;
    const wasHorizontal = isHorizontalRef.current;
    const wasDragging = isDragging;
    startXRef.current = null;
    startYRef.current = null;
    isHorizontalRef.current = null;
    setIsDragging(false);
    setOffsetX(0);

    if (!wasHorizontal || !wasDragging) return;

    // Handle left swipe (wiedervorlage)
    if (leftStage > 0) {
      if (leftStage > WV_STAGES.length - 1) {
        // Open calendar picker
        const input = document.createElement("input");
        input.type = "date";
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.top = "0";
        document.body.appendChild(input);
        input.focus();
        input.click();
        input.addEventListener("change", async () => {
          if (input.value) {
            await updateTodo(user.uid, todo.id, { wiedervorlage: new Date(input.value) });
          }
          document.body.removeChild(input);
        });
        input.addEventListener("blur", () => {
          setTimeout(() => document.body.contains(input) && document.body.removeChild(input), 500);
        });
      } else {
        const newDate = getWiedervorlageDate();
        await updateTodo(user.uid, todo.id, { wiedervorlage: newDate });
      }
    }

    // Handle right swipe
    if (rightStage === 1) {
      // Mark done & archive
      await updateTodo(user.uid, todo.id, { status: "erledigt", archived: true });
    } else if (rightStage === 2) {
      if (deleteConfirm) {
        await deleteTodo(user.uid, todo.id);
        setDeleteConfirm(false);
      } else {
        setDeleteConfirm(true);
        setTimeout(() => setDeleteConfirm(false), 3000);
      }
    }
  };

  const onPointerCancel = () => {
    startXRef.current = null;
    setIsDragging(false);
    setOffsetX(0);
  };

  const toggleDone = async (e) => {
    e.stopPropagation();
    if (todo.status === "erledigt") {
      // Restore previous status
      const prev = todo.previousStatus || "offen";
      await updateTodo(user.uid, todo.id, { status: prev, previousStatus: null });
    } else {
      await updateTodo(user.uid, todo.id, { status: "erledigt", previousStatus: todo.status });
    }
  };

  const handleCardClick = (e) => {
    if (isDragging || Math.abs(offsetX) > 5) return;
    onClick(todo);
  };

  // Background colors based on swipe direction and stage
  let bgColor = "transparent";
  let bgContent = null;
  if (offsetX < -10) {
    const stage = leftStage;
    if (stage <= 7 && stage > 0) {
      const intensity = Math.min(stage / 7, 1);
      bgColor = `rgba(139, 92, 246, ${0.15 + intensity * 0.5})`;
      bgContent = (
        <div className="absolute right-3 top-0 h-full flex items-center">
          <div className="text-right">
            <div className="text-white font-bold text-sm">+{stage}T</div>
            <div className="text-white/70 text-[10px]">Wiedervorlage</div>
          </div>
        </div>
      );
    } else if (stage > 7) {
      bgColor = "rgba(99, 102, 241, 0.8)";
      bgContent = (
        <div className="absolute right-3 top-0 h-full flex items-center">
          <div className="text-white text-center">
            <div className="text-lg">📅</div>
            <div className="text-[10px] font-medium">Kalender</div>
          </div>
        </div>
      );
    }
  } else if (offsetX > 10) {
    if (rightStage === 2) {
      bgColor = deleteConfirm ? "rgba(220, 38, 38, 0.9)" : "rgba(220, 38, 38, 0.7)";
      bgContent = (
        <div className="absolute left-3 top-0 h-full flex items-center">
          <div className="text-white text-center">
            <div className="text-lg">🗑️</div>
            <div className="text-[10px] font-medium">{deleteConfirm ? "Loslassen!" : "Löschen"}</div>
          </div>
        </div>
      );
    } else if (rightStage === 1) {
      bgColor = "rgba(16, 185, 129, 0.7)";
      bgContent = (
        <div className="absolute left-3 top-0 h-full flex items-center">
          <div className="text-white text-center">
            <div className="text-lg">✓</div>
            <div className="text-[10px] font-medium">Erledigt</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ touchAction: "pan-y" }}>
      {/* Background layer */}
      <div
        className="absolute inset-0 rounded-2xl transition-colors duration-150"
        style={{ backgroundColor: bgColor }}
      >
        {bgContent}
      </div>

      {/* Card layer */}
      <div
        ref={cardRef}
        onClick={handleCardClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          touchAction: "pan-y",
          userSelect: "none",
        }}
        className="relative bg-white/65 backdrop-blur-xl rounded-2xl border border-white/70 shadow-sm flex items-center gap-3 px-4 py-3 cursor-pointer"
      >
        {/* Prio bar - wider */}
        <div className={`absolute top-0 left-0 w-1.5 h-full ${prio.bar} rounded-l-2xl`} />

        <button onClick={toggleDone} className="flex-shrink-0 pl-1" onPointerDown={(e) => e.stopPropagation()}>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
            todo.status === "erledigt" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-400"
          }`}>
            {todo.status === "erledigt" && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-slate-800 truncate ${todo.status === "erledigt" ? "line-through opacity-50" : ""}`}>
            {todo.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${prio.badge}`}>{prio.label}</span>
            {todo.status && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[todo.status] || STATUS_STYLES.offen}`}>{todo.status}</span>}
            {todo.category && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">{todo.category}</span>}
            {todo.deadline && <span className={`text-[10px] font-medium ${isOverdue ? "text-red-500" : "text-slate-400"}`}>📅 {formatDate(todo.deadline)}{isOverdue ? " · überfällig" : ""}</span>}
            {todo.wiedervorlage && <span className="text-[10px] text-purple-500">🔄 {formatDate(todo.wiedervorlage)}</span>}
          </div>
        </div>
        <svg className="w-4 h-4 text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6" /></svg>
      </div>
    </div>
  );
}