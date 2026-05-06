import React, { useEffect, useState, useRef } from "react";
import TodoDetail from "./TodoDetail";

/**
 * iPhone-style glass sheet animation wrapper for TodoDetail.
 * - Open: card scales up + blurs in from below (like iOS share sheet)
 * - Close: slides down with spring
 * - Backdrop: blurred frosted glass
 */
export default function TodoDetailModal({ todo, categories, onClose, onDelete }) {
  const [phase, setPhase] = useState("entering"); // entering | open | closing
  const closeRef = useRef(false);

  useEffect(() => {
    // Trigger open animation
    const t = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    if (closeRef.current) return;
    closeRef.current = true;
    setPhase("closing");
    setTimeout(() => {
      closeRef.current = false;
      onClose();
    }, 380);
  };

  const handleDelete = () => {
    if (closeRef.current) return;
    closeRef.current = true;
    setPhase("closing");
    setTimeout(() => {
      closeRef.current = false;
      onDelete?.();
      onClose();
    }, 380);
  };

  const backdropStyle = {
    entering: { opacity: 0 },
    open:     { opacity: 1 },
    closing:  { opacity: 0 },
  }[phase];

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const sheetStyle = {
    entering: {
      transform: isMobile ? "translateY(100%) scale(0.96)" : "translateY(16px) scale(0.97)",
      opacity: 0,
    },
    open: {
      transform: "translateY(0%) scale(1)",
      opacity: 1,
    },
    closing: {
      transform: isMobile ? "translateY(100%) scale(0.96)" : "translateY(16px) scale(0.97)",
      opacity: 0,
    },
  }[phase];

  const transition = phase === "open"
    ? "transform 0.42s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease"
    : "transform 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.28s ease";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ perspective: "1200px" }}
    >
      {/* Backdrop — frosted glass */}
      <div
        className="absolute inset-0"
        onClick={handleClose}
        style={{
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(18px) saturate(180%)",
          WebkitBackdropFilter: "blur(18px) saturate(180%)",
          transition: "opacity 0.35s ease",
          ...backdropStyle,
        }}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-lg lg:max-w-2xl xl:max-w-3xl"
        style={{
          transition,
          willChange: "transform, opacity",
          ...sheetStyle,
        }}
      >
        {/* Drag handle indicator (iOS style) */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <div className="w-10 h-1 rounded-full bg-white/40" />
        </div>

        <TodoDetail
          todo={todo}
          categories={categories}
          onClose={handleClose}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}