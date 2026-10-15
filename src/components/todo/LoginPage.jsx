import React, { useState } from "react";
import { useFirebaseAuth, authErrorMessage } from "@/lib/firebaseAuth";

export default function LoginPage() {
  const { login, resetPassword } = useFirebaseAuth();
  // "login" = Anmelden · "reset" = Passwort vergessen
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
  };

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

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setInfo("sent");
    } catch (err) {
      // Nicht verraten, ob es zu der Adresse ein Konto gibt
      if (err?.code === "auth/user-not-found") setInfo("sent");
      else setError(authErrorMessage(err));
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
            {mode === "login" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">E-Mail</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    placeholder="deine@email.de" autoComplete="username"
                    className="w-full px-4 py-3 rounded-2xl glass-input text-slate-800 placeholder-slate-400 transition-all text-[16px]" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-600">Passwort</label>
                    <button type="button" onClick={() => switchMode("reset")}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 py-1 -my-1 pl-2">
                      Passwort vergessen?
                    </button>
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    placeholder="••••••••" autoComplete="current-password"
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
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Passwort zurücksetzen</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">E-Mail</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    placeholder="deine@email.de" autoComplete="username"
                    className="w-full px-4 py-3 rounded-2xl glass-input text-slate-800 placeholder-slate-400 transition-all text-[16px]" />
                </div>

                {error && (
                  <div className="bg-red-50/80 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-2xl">
                    {error}
                  </div>
                )}
                {info && (
                  <div className="bg-emerald-50/80 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-2xl">
                    Falls ein Konto mit dieser E-Mail existiert, ist ein Link zum Zurücksetzen unterwegs.
                    Bitte prüfe auch deinen Spam-Ordner.
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold btn-liquid disabled:opacity-60 text-[16px]">
                  {loading ? "Senden..." : info ? "Link erneut senden" : "Link senden"}
                </button>
                <button type="button" onClick={() => switchMode("login")}
                  className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-700">
                  ← Zurück zur Anmeldung
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">2Do v0.5 · Sicher &amp; verschlüsselt</p>
        </div>
      </div>
    </>
  );
}
