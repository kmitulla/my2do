import React, { useEffect, useState } from "react";

/**
 * Liquid-Glass-Intro (~1s):
 * Eine Glaskachel "verflüssigt" sich aus Unschärfe in die Schärfe,
 * der Haken zeichnet sich, ein Lichtreflex streicht über das Glas,
 * ein feiner Ring pulst nach außen — dann löst sich alles nahtlos
 * in den App-Hintergrund auf.
 */
export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 880);
    const t2 = setTimeout(() => onDone?.(), 1150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(1.04)" : "scale(1)",
        transition: "opacity 0.28s ease-out, transform 0.28s ease-out",
        pointerEvents: leaving ? "none" : "all",
      }}
    >
      {/* Derselbe Liquid-Hintergrund wie in der App — nahtloser Übergang */}
      <div className="liquid-bg">
        <div className="liquid-blob liquid-blob-1" />
        <div className="liquid-blob liquid-blob-2" />
        <div className="liquid-blob liquid-blob-3" />
        <div className="liquid-blob liquid-blob-4" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Kachel + Ring */}
        <div className="relative">
          <div className="splash-ring" />
          <div className="splash-tile flex items-center justify-center">
            <div className="splash-sheen" />
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <defs>
                <linearGradient id="splashCheckGrad" x1="13" y1="36" x2="39" y2="17" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              <polyline
                points="13,27 22,36 39,17"
                stroke="url(#splashCheckGrad)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="splash-check"
              />
            </svg>
          </div>
        </div>

        {/* Wortmarke */}
        <div className="splash-text flex flex-col items-center mt-6">
          <span className="text-4xl font-bold tracking-tight text-slate-800">2Do</span>
          <span className="text-[11px] font-medium text-slate-400 mt-1.5 tracking-[0.24em] uppercase">
            Aufgaben &middot; Notizen
          </span>
        </div>
      </div>

      <style>{`
        .splash-tile {
          width: 108px;
          height: 108px;
          border-radius: 30px;
          overflow: hidden;
          background: linear-gradient(150deg, rgba(255,255,255,0.92), rgba(255,255,255,0.55));
          -webkit-backdrop-filter: blur(30px) saturate(200%);
          backdrop-filter: blur(30px) saturate(200%);
          border: 1px solid rgba(255,255,255,0.9);
          box-shadow:
            0 24px 60px rgba(63, 81, 235, 0.20),
            0 4px 16px rgba(31, 41, 90, 0.08),
            inset 0 1px 0 rgba(255,255,255,1),
            inset 0 -1px 0 rgba(255,255,255,0.35);
          animation: splash-tile-in 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both;
        }
        @keyframes splash-tile-in {
          0%   { transform: scale(0.5); border-radius: 54px; opacity: 0; filter: blur(16px); }
          55%  { opacity: 1; }
          100% { transform: scale(1); border-radius: 30px; opacity: 1; filter: blur(0); }
        }

        .splash-sheen {
          position: absolute;
          inset: -40%;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.9) 50%, transparent 58%);
          animation: splash-sheen-sweep 0.55s ease-out 0.32s both;
        }
        @keyframes splash-sheen-sweep {
          from { transform: translateX(-75%); }
          to   { transform: translateX(75%); }
        }

        .splash-check {
          stroke-dasharray: 46;
          stroke-dashoffset: 46;
          animation: splash-check-draw 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s forwards;
        }
        @keyframes splash-check-draw { to { stroke-dashoffset: 0; } }

        .splash-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 108px;
          height: 108px;
          margin: -54px 0 0 -54px;
          border-radius: 34px;
          border: 1.5px solid rgba(99, 102, 241, 0.35);
          pointer-events: none;
          animation: splash-ring-out 0.7s ease-out 0.32s both;
        }
        @keyframes splash-ring-out {
          0%   { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1.9); opacity: 0; }
        }

        .splash-text {
          animation: splash-text-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.26s both;
        }
        @keyframes splash-text-in {
          from { transform: translateY(14px); opacity: 0; filter: blur(6px); }
          to   { transform: translateY(0); opacity: 1; filter: blur(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-tile, .splash-sheen, .splash-check, .splash-ring, .splash-text {
            animation: none !important;
          }
          .splash-check { stroke-dashoffset: 0; }
          .splash-ring { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
