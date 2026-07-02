import React, { useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

export default function LoginPage() {
  const { login } = useFirebaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="liquid-bg">
          <div className="liquid-blob liquid-blob-1" />
          <div className="liquid-blob liquid-blob-2" />
          <div className="liquid-blob liquid-blob-3" />
        </div>
        <div className="w-full max-w-sm mx-4 relative z-10">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-[28px] glass-strong flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">2Do</h1>
            <p className="text-slate-500 text-sm mt-1">Deine ultimative Aufgaben-App</p>
          </div>

          <div className="glass-strong rounded-[28px] p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">E-Mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  placeholder="deine@email.de"
                  className="w-full px-4 py-3 rounded-2xl glass-input text-slate-800 placeholder-slate-400 transition-all text-[16px]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Passwort</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-2xl glass-input text-slate-800 placeholder-slate-400 transition-all text-[16px]" />
              </div>

              {error && (
                <div className="bg-red-50/80 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-2xl">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold btn-liquid disabled:opacity-60 text-[16px]">
                {loading ? "Anmelden..." : "Anmelden"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">2Do v0.5 · Sicher &amp; verschlüsselt</p>
        </div>
      </div>
    </>
  );
}