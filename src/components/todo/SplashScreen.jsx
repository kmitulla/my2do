import React, { useEffect, useState } from "react";

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 50);    // icon drops in
    const t2 = setTimeout(() => setPhase(2), 200);   // rings + particles
    const t3 = setTimeout(() => setPhase(3), 350);   // text
    const t4 = setTimeout(() => setPhase(4), 550);   // glitch flash
    const t5 = setTimeout(() => setPhase(5), 650);   // scan line
    const t6 = setTimeout(() => setPhase(6), 800);   // fade out
    const t7 = setTimeout(() => onDone?.(), 1000);
    return () => [t1, t2, t3, t4, t5, t6, t7].forEach(clearTimeout);
  }, []);

  const particles = Array.from({ length: 20 }).map((_, i) => {
    const angle = (i / 20) * 360;
    const radius = 90 + (i % 4) * 28;
    const size = 2 + (i % 4) * 2;
    const dur = 4 + (i % 5) * 1.2;
    return { angle, radius, size, dur, delay: i * 0.07 };
  });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0e27 0%, #0f1b4d 40%, #1e1065 70%, #2d0072 100%)",
        opacity: phase >= 6 ? 0 : 1,
        transition: phase >= 6 ? "opacity 0.4s ease-out" : "none",
        pointerEvents: phase >= 6 ? "none" : "all",
      }}
    >
      {/* Grid overlay */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        opacity: phase >= 2 ? 0.8 : 0,
        transition: "opacity 0.6s ease",
      }} />

      {/* Scan line effect */}
      {phase >= 5 && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: "2px",
            background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.8), rgba(167,139,250,1), rgba(99,102,241,0.8), transparent)",
            animation: "scanline 1.1s ease-in-out forwards",
            boxShadow: "0 0 20px rgba(167,139,250,0.8), 0 0 60px rgba(99,102,241,0.4)",
          }} />
        </div>
      )}

      {/* Expanding rings */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: `${(i + 1) * 180}px`,
          height: `${(i + 1) * 180}px`,
          border: i % 2 === 0
            ? "1px solid rgba(99,102,241,0.25)"
            : "1px solid rgba(167,139,250,0.15)",
          transform: phase >= 2 ? "scale(1)" : "scale(0.1)",
          opacity: phase >= 2 ? 1 : 0,
          transition: `transform ${0.7 + i * 0.12}s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.07}s, opacity 0.5s ease ${i * 0.07}s`,
          animation: phase >= 2 ? `ring-pulse ${3 + i * 0.7}s ease-in-out infinite ${i * 0.4}s` : "none",
        }} />
      ))}

      {/* Particles */}
      {phase >= 2 && particles.map((p, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: p.size, height: p.size,
          background: i % 3 === 0 ? "#818cf8" : i % 3 === 1 ? "#a78bfa" : "#38bdf8",
          opacity: 0,
          transform: `rotate(${p.angle}deg) translateX(${p.radius}px)`,
          animation: `orbit-fade ${p.dur}s linear infinite ${p.delay}s`,
          boxShadow: `0 0 ${p.size * 2}px currentColor`,
        }} />
      ))}

      {/* Glitch flash */}
      {phase === 4 && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "rgba(99,102,241,0.12)",
          animation: "glitch-flash 0.4s ease-out forwards",
        }} />
      )}

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-8 z-10">
        {/* Main icon */}
        <div style={{
          transform: phase >= 1 ? "translateY(0) scale(1) rotate(0deg)" : "translateY(-120px) scale(0.2) rotate(-45deg)",
          opacity: phase >= 1 ? 1 : 0,
          transition: "transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease",
        }}>
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-3xl" style={{
            boxShadow: "0 0 80px rgba(99,102,241,0.7), 0 0 160px rgba(99,102,241,0.3)",
            opacity: phase >= 2 ? 1 : 0,
            transition: "opacity 0.5s ease 0.3s",
            borderRadius: "28px",
          }} />

          <div className="w-32 h-32 flex items-center justify-center relative" style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(167,139,250,0.2) 100%)",
            backdropFilter: "blur(20px)",
            border: "1.5px solid rgba(167,139,250,0.5)",
            borderRadius: "28px",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}>
            {/* Corner accents */}
            {[
              { top: 4, left: 4 }, { top: 4, right: 4 },
              { bottom: 4, left: 4 }, { bottom: 4, right: 4 }
            ].map((pos, i) => (
              <div key={i} className="absolute" style={{
                width: 12, height: 12,
                ...pos,
                borderTop: (pos.top !== undefined) ? "2px solid rgba(167,139,250,0.8)" : "none",
                borderBottom: (pos.bottom !== undefined) ? "2px solid rgba(167,139,250,0.8)" : "none",
                borderLeft: (pos.left !== undefined) ? "2px solid rgba(167,139,250,0.8)" : "none",
                borderRight: (pos.right !== undefined) ? "2px solid rgba(167,139,250,0.8)" : "none",
                opacity: phase >= 2 ? 1 : 0,
                transition: `opacity 0.3s ease ${0.5 + i * 0.05}s`,
              }} />
            ))}

            <svg width="56" height="56" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="22" stroke="rgba(167,139,250,0.6)" strokeWidth="2"
                strokeDasharray="138" strokeDashoffset={phase >= 1 ? "0" : "138"}
                style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s", strokeLinecap: "round" }} />
              <polyline points="14,26 22,34 38,18" stroke="white" strokeWidth="4"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="36" strokeDashoffset={phase >= 2 ? "0" : "36"}
                style={{ transition: "stroke-dashoffset 0.45s cubic-bezier(0.4,0,0.2,1) 0.55s" }} />
            </svg>
          </div>
        </div>

        {/* Text block */}
        <div className="flex flex-col items-center gap-2" style={{
          transform: phase >= 3 ? "translateY(0)" : "translateY(30px)",
          opacity: phase >= 3 ? 1 : 0,
          transition: "transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease",
        }}>
          <div className="flex items-baseline gap-2">
            <span className="font-black text-6xl tracking-tight" style={{
              background: "linear-gradient(135deg, #ffffff 0%, #a78bfa 50%, #38bdf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "none",
              filter: "drop-shadow(0 0 30px rgba(167,139,250,0.6))",
            }}>2Do</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{
              background: "rgba(99,102,241,0.3)",
              border: "1px solid rgba(167,139,250,0.4)",
              color: "rgba(167,139,250,0.9)",
              letterSpacing: "0.08em",
            }}>v0.5</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.6))" }} />
            <span className="text-xs tracking-[0.25em] uppercase font-medium" style={{ color: "rgba(167,139,250,0.6)" }}>
              Task System
            </span>
            <div className="h-px w-8" style={{ background: "linear-gradient(90deg, rgba(167,139,250,0.6), transparent)" }} />
          </div>

          {/* Loading bar */}
          <div className="mt-3 w-32 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(99,102,241,0.2)" }}>
            <div style={{
              height: "100%",
              background: "linear-gradient(90deg, #818cf8, #a78bfa, #38bdf8)",
              width: phase >= 3 ? "100%" : "0%",
              transition: "width 1.4s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "0 0 12px rgba(167,139,250,0.8)",
            }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes orbit-fade {
          0% { opacity: 0; }
          10% { opacity: 0.7; }
          90% { opacity: 0.7; }
          100% { opacity: 0; }
        }
        @keyframes scanline {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes glitch-flash {
          0% { opacity: 1; }
          30% { opacity: 0; transform: translateX(3px); }
          60% { opacity: 0.5; transform: translateX(-3px); }
          100% { opacity: 0; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}