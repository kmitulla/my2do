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
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="deine@email.de"
                className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all text-[16px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-300 transition-all text-[16px]"
              />
            </div>

            {error && (
              <div className="bg-red-50/80 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-2xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 text-[16px]"
            >
              {loading ? "Anmelden..." : "Anmelden"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">2Do v0.1 · Sicher & verschlüsselt</p>
      </div>
    </div>
  );
}