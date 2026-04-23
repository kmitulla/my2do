import React, { useEffect, useState } from "react";

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Phase 0→1: icon drops in (300ms)
    const t1 = setTimeout(() => setPhase(1), 100);
    // Phase 1→2: rings expand (600ms)
    const t2 = setTimeout(() => setPhase(2), 400);
    // Phase 2→3: text slides up (900ms)
    const t3 = setTimeout(() => setPhase(3), 750);
    // Phase 3→4: fade out (1400ms)
    const t4 = setTimeout(() => setPhase(4), 1400);
    // Done (1700ms)
    const t5 = setTimeout(() => onDone?.(), 1750);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1e40af 0%, #4f46e5 50%, #7c3aed 100%)",
        opacity: phase === 4 ? 0 : 1,
        transition: phase === 4 ? "opacity 0.35s ease-out" : "none",
        pointerEvents: phase === 4 ? "none" : "all",
      }}
    >
      {/* Animated background circles */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${(i + 1) * 220}px`,
            height: `${(i + 1) * 220}px`,
            border: "1.5px solid rgba(255,255,255,0.15)",
            transform: phase >= 2 ? "scale(1)" : "scale(0)",
            opacity: phase >= 2 ? 1 : 0,
            transition: `transform ${0.6 + i * 0.15}s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.08}s, opacity 0.4s ease ${i * 0.08}s`,
          }}
        />
      ))}

      {/* Particle dots */}
      {phase >= 2 && Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        const radius = 110 + (i % 3) * 20;
        const size = 3 + (i % 3) * 2;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: size,
              height: size,
              opacity: 0.3 + (i % 4) * 0.15,
              transform: `rotate(${angle}deg) translateX(${radius}px)`,
              animation: `spin ${6 + i * 0.5}s linear infinite`,
            }}
          />
        );
      })}

      {/* Main icon */}
      <div className="relative flex flex-col items-center gap-6">
        <div
          style={{
            transform: phase >= 1
              ? "translateY(0) scale(1) rotate(0deg)"
              : "translateY(-80px) scale(0.3) rotate(-30deg)",
            opacity: phase >= 1 ? 1 : 0,
            transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
          }}
        >
          {/* Icon glow */}
          <div
            className="absolute inset-0 rounded-3xl blur-2xl"
            style={{
              background: "rgba(255,255,255,0.35)",
              transform: "scale(1.4)",
              opacity: phase >= 2 ? 1 : 0,
              transition: "opacity 0.4s ease 0.3s",
            }}
          />
          <div
            className="w-28 h-28 rounded-3xl bg-white/20 backdrop-blur-xl border border-white/40 shadow-2xl flex items-center justify-center relative"
            style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)" }}
          >
            {/* Animated checkmark */}
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle
                cx="26" cy="26" r="22"
                stroke="white"
                strokeWidth="3"
                strokeDasharray="138"
                strokeDashoffset={phase >= 1 ? "0" : "138"}
                style={{
                  transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.1s",
                  strokeLinecap: "round",
                }}
              />
              <polyline
                points="14,26 22,34 38,18"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="36"
                strokeDashoffset={phase >= 2 ? "0" : "36"}
                style={{
                  transition: "stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.5s",
                }}
              />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div
          className="flex flex-col items-center gap-1"
          style={{
            transform: phase >= 3 ? "translateY(0)" : "translateY(20px)",
            opacity: phase >= 3 ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease",
          }}
        >
          <span className="text-white font-black text-5xl tracking-tight" style={{ textShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
            2Do
          </span>
          <span className="text-white/60 text-sm font-medium tracking-widest uppercase">
            Deine Aufgaben
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(var(--start, 0deg)) translateX(var(--r, 110px)); }
          to { transform: rotate(calc(var(--start, 0deg) + 360deg)) translateX(var(--r, 110px)); }
        }
      `}</style>
    </div>
  );
}