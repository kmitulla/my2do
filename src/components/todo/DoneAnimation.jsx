import React, { useEffect, useState } from "react";

const COLORS = ["#10b981", "#34d399", "#6ee7b7", "#3b82f6", "#8b5cf6", "#f59e0b"];

function Spark({ x, y, color, angle, speed }) {
  const [pos, setPos] = useState({ x, y });
  const [op, setOp] = useState(1);

  useEffect(() => {
    let frame;
    let cx = x, cy = y, op = 1;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    let t = 0;
    const tick = () => {
      t++;
      cx += vx * Math.pow(0.93, t * 0.5);
      cy += vy * Math.pow(0.93, t * 0.5) + t * 0.3;
      op -= 0.03;
      setPos({ x: cx, y: cy });
      setOp(op);
      if (op > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (op <= 0) return null;
  return (
    <div style={{
      position: "fixed",
      left: pos.x - 3,
      top: pos.y - 3,
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: color,
      opacity: op,
      pointerEvents: "none",
      zIndex: 9996,
      boxShadow: `0 0 6px ${color}`,
    }} />
  );
}

export default function DoneAnimation({ x, y, onDone }) {
  const [sparks, setSparks] = useState([]);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setPulse(true);
    const pts = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: x ?? window.innerWidth / 2,
      y: y ?? window.innerHeight / 2,
      color: COLORS[i % COLORS.length],
      angle: (i / 20) * Math.PI * 2,
      speed: 4 + Math.random() * 5,
    }));
    setSparks(pts);
    const t = setTimeout(() => onDone?.(), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {sparks.map((s) => <Spark key={s.id} {...s} />)}
      {pulse && (
        <div style={{
          position: "fixed",
          left: (x ?? window.innerWidth / 2) - 20,
          top: (y ?? window.innerHeight / 2) - 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.6) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 9995,
          animation: "doneRipple 0.6s ease-out forwards",
        }} />
      )}
      <style>{`
        @keyframes doneRipple {
          from { transform: scale(0.5); opacity: 1; }
          to { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </>
  );
}