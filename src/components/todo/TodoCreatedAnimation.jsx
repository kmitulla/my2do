import React, { useEffect, useState } from "react";

const CONFETTI_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];

function Particle({ x, y, color, vx, vy, size, shape }) {
  const [pos, setPos] = useState({ x, y });
  const [opacity, setOpacity] = useState(1);
  const [rot, setRot] = useState(Math.random() * 360);

  useEffect(() => {
    let frame;
    let curX = x, curY = y, curVx = vx, curVy = vy, curOp = 1, curRot = rot;
    const tick = () => {
      curVy += 0.4;
      curVx *= 0.97;
      curX += curVx;
      curY += curVy;
      curOp -= 0.018;
      curRot += curVx * 3;
      setPos({ x: curX, y: curY });
      setOpacity(curOp);
      setRot(curRot);
      if (curOp > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size,
        height: shape === "circle" ? size : size * 0.5,
        backgroundColor: color,
        borderRadius: shape === "circle" ? "50%" : "2px",
        opacity,
        transform: `rotate(${rot}deg)`,
        pointerEvents: "none",
        zIndex: 9998,
      }}
    />
  );
}

export default function TodoCreatedAnimation({ onDone }) {
  const [particles, setParticles] = useState([]);
  const [rings, setRings] = useState(false);
  const [checkVisible, setCheckVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Generate particles from center
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.38;

    const pts = Array.from({ length: 55 }, (_, i) => ({
      id: i,
      x: cx + (Math.random() - 0.5) * 30,
      y: cy,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      vx: (Math.random() - 0.5) * 18,
      vy: -12 - Math.random() * 10,
      size: 6 + Math.random() * 8,
      shape: Math.random() > 0.4 ? "rect" : "circle",
    }));

    setParticles(pts);
    setRings(true);
    setTimeout(() => setCheckVisible(true), 150);
    setTimeout(() => setTextVisible(true), 350);
    setTimeout(() => setFadeOut(true), 1100);
    setTimeout(() => onDone?.(), 1500);
  }, []);

  return (
    <>
      {/* Particles */}
      {particles.map((p) => <Particle key={p.id} {...p} />)}

      {/* Center burst */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "38%",
          transform: "translate(-50%, -50%)",
          zIndex: 9997,
          pointerEvents: "none",
          opacity: fadeOut ? 0 : 1,
          transition: "opacity 0.4s ease",
        }}
      >
        {/* Rings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${(i + 1) * 80}px`,
              height: `${(i + 1) * 80}px`,
              borderRadius: "50%",
              border: `2px solid`,
              borderColor: CONFETTI_COLORS[i],
              top: "50%",
              left: "50%",
              transform: rings
                ? `translate(-50%, -50%) scale(${1.5 + i * 0.5})`
                : "translate(-50%, -50%) scale(0)",
              opacity: rings ? 0 : 1,
              transition: `transform ${0.5 + i * 0.1}s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.05}s, opacity ${0.5 + i * 0.1}s ease ${i * 0.05}s`,
            }}
          />
        ))}

        {/* Check icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 40px rgba(16, 185, 129, 0.6)",
            transform: checkVisible ? "scale(1)" : "scale(0)",
            transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <polyline
              points="7,18 14,25 29,10"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="32"
              strokeDashoffset={checkVisible ? "0" : "32"}
              style={{ transition: "stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.15s" }}
            />
          </svg>
        </div>

        {/* Label */}
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: textVisible ? "translate(-50%, 12px)" : "translate(-50%, 24px)",
            opacity: textVisible ? 1 : 0,
            transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Notiz erstellt! ✨
          </span>
        </div>
      </div>
    </>
  );
}