import React, { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

function LoginAnimation({ onDone }) {
  const [phase, setPhase] = useState(0);
  // scanY: 0..100 (percent), active when phase>=4
  const [scanY, setScanY] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 500);
    const t3 = setTimeout(() => setPhase(3), 1000);
    const t4 = setTimeout(() => setPhase(4), 1800);
    const t5 = setTimeout(() => setPhase(5), 2400);
    const t6 = setTimeout(() => onDone(), 3050);
    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
  }, []);

  // Animate scan line from top to bottom between phase 4 and 5
  useEffect(() => {
    if (phase !== 4) return;
    setScanY(0);
    const start = performance.now();
    const dur = 600; // ms
    const raf = (now) => {
      const p = Math.min((now - start) / dur, 1);
      setScanY(p * 100);
      if (p < 1) requestAnimationFrame(raf);
    };
    const id = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const bars = Array.from({ length: 16 });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0e27 0%, #0f1b4d 40%, #1e1065 70%, #2d0072 100%)",
        opacity: phase >= 5 ? 0 : 1,
        transition: phase >= 5 ? "opacity 0.6s ease-out" : "none",
        pointerEvents: phase >= 5 ? "none" : "all",
      }}>

      {/* Grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
      }} />

      {/* Rotating outer ring */}
      <div className="absolute" style={{
        width: 320, height: 320,
        border: "1px solid rgba(99,102,241,0.3)",
        borderRadius: "50%",
        animation: "spin-slow 8s linear infinite",
        opacity: phase >= 2 ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}>
        {/* Tick marks on ring */}
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            top: "50%", left: "50%",
            width: i % 6 === 0 ? 10 : 5,
            height: 1.5,
            background: i % 6 === 0 ? "rgba(167,139,250,0.8)" : "rgba(99,102,241,0.4)",
            transformOrigin: "-160px 0",
            transform: `rotate(${i * 15}deg) translateY(-50%)`,
          }} />
        ))}
      </div>

      {/* Inner spinning dashed ring */}
      <div className="absolute" style={{
        width: 220, height: 220,
        border: "1.5px dashed rgba(167,139,250,0.3)",
        borderRadius: "50%",
        animation: "spin-rev 6s linear infinite",
        opacity: phase >= 2 ? 1 : 0,
        transition: "opacity 0.5s ease 0.2s",
      }} />

      {/* Scan reveal: app background appears behind the scan line as it falls */}
      {phase >= 4 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 5 }}>
          {/* App bg revealed above the scan line (curtain pulling down) */}
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: `${scanY}%`,
            background: "linear-gradient(135deg, #e0e7ff 0%, #dbeafe 50%, #e0f2fe 100%)",
            filter: "blur(6px)",
            opacity: 0.85,
            transition: "none",
          }} />
          {/* Scan line itself */}
          <div style={{
            position: "absolute",
            top: `${scanY}%`,
            left: 0, right: 0,
            height: "3px",
            background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.2) 10%, rgba(167,139,250,1) 40%, rgba(56,189,248,1) 60%, rgba(167,139,250,1) 90%, transparent 100%)",
            boxShadow: "0 0 24px rgba(167,139,250,0.9), 0 0 60px rgba(99,102,241,0.5)",
            transition: "none",
          }} />
        </div>
      )}

      {/* EQ bars - data visualization feel */}
      <div className="absolute bottom-16 flex items-end gap-0.5" style={{
        opacity: phase >= 3 ? 0.6 : 0,
        transition: "opacity 0.5s ease",
      }}>
        {bars.map((_, i) => (
          <div key={i} style={{
            width: 3,
            borderRadius: 2,
            background: "linear-gradient(to top, #6366f1, #a78bfa)",
            animation: `eq-bar ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate ${i * 0.05}s`,
          }} />
        ))}
      </div>

      {/* Center */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Hexagon-style icon */}
        <div style={{
          transform: phase >= 1 ? "scale(1) rotate(0deg)" : "scale(0) rotate(-90deg)",
          opacity: phase >= 1 ? 1 : 0,
          transition: "transform 0.7s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease",
        }}>
          <div style={{
            width: 100, height: 100,
            background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(167,139,250,0.3))",
            border: "1.5px solid rgba(167,139,250,0.6)",
            borderRadius: "24px",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 60px rgba(99,102,241,0.5), 0 0 120px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            backdropFilter: "blur(20px)",
            position: "relative",
          }}>
            <div className="absolute inset-0 rounded-3xl" style={{
              animation: phase >= 2 ? "border-pulse 2s ease-in-out infinite" : "none",
            }} />
            <svg width="44" height="44" viewBox="0 0 52 52" fill="none">
              <polyline points="14,26 22,34 38,18" stroke="white" strokeWidth="4.5"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="36" strokeDashoffset={phase >= 2 ? "0" : "36"}
                style={{ transition: "stroke-dashoffset 0.45s cubic-bezier(0.4,0,0.2,1) 0.4s" }} />
            </svg>
          </div>
        </div>

        {/* Scanning text */}
        <div style={{
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}>
          <div className="flex items-baseline gap-2 justify-center">
            <span className="font-black text-4xl" style={{
              background: "linear-gradient(135deg, #fff 0%, #a78bfa 60%, #38bdf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 20px rgba(167,139,250,0.5))",
            }}>2Do</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
              background: "rgba(99,102,241,0.3)",
              border: "1px solid rgba(167,139,250,0.4)",
              color: "rgba(167,139,250,0.9)",
              letterSpacing: "0.1em",
            }}>v0.4</span>
          </div>

          {/* Scanning status */}
          <div className="mt-3 text-center">
            {phase < 4 ? (
              <span className="text-[11px] tracking-[0.3em] uppercase" style={{ color: "rgba(99,102,241,0.7)" }}>
                Authentifiziere<span style={{ animation: "blink 0.8s steps(3) infinite" }}>...</span>
              </span>
            ) : (
              <span className="text-[11px] tracking-[0.3em] uppercase" style={{
                color: "rgba(52,211,153,0.8)",
                animation: "fade-in 0.3s ease",
              }}>
                ✓ Bereit
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes eq-bar {
          from { height: 4px; }
          to { height: ${Math.floor(Math.random() * 20 + 8)}px; }
        }
        @keyframes border-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          50% { box-shadow: 0 0 0 8px rgba(99,102,241,0.15); }
        }
        @keyframes blink {
          0% { opacity: 0; } 33% { opacity: 1; } 66% { opacity: 0; } 100% { opacity: 1; }
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAnim, setShowAnim] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError("Ungültige Anmeldedaten. Bitte erneut versuchen.");
    }
    setLoading(false);
  };

  return (
    <>
      {showAnim && <LoginAnimation onDone={() => setShowAnim(false)} />}
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
        <div className="w-full max-w-sm mx-4">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-white/70 backdrop-blur-xl shadow-2xl flex items-center justify-center border border-white/60">
              <span className="text-4xl">✓</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">2Do</h1>
            <p className="text-slate-500 text-sm mt-1">Deine ultimative Aufgaben-App</p>
          </div>

          <div className="bg-white/60 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">E-Mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  placeholder="deine@email.de"
                  className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all text-[16px]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Passwort</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all text-[16px]" />
              </div>

              {error && (
                <div className="bg-red-50/80 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-2xl">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 text-[16px]">
                {loading ? "Anmelden..." : "Anmelden"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">2Do v0.4 · Sicher &amp; verschlüsselt</p>
        </div>
      </div>
    </>
  );
}