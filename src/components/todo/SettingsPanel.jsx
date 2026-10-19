import React, { useState } from "react";
import { useFirebaseAuth, DEFAULT_UNDO_DURATION_SEC, authErrorMessage } from "@/lib/firebaseAuth";
import { deleteCategory } from "@/lib/todoService";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import ExportPanel from "./ExportPanel";
import useConfirmReset from "@/hooks/useConfirmReset";
import { isDesktop, sendAppCommand } from "@/lib/desktop";

export default function SettingsPanel({ categories, todos, onCategoryDeleted }) {
  const { user, userProfile, logout, updateUserProfile, changePassword, resetPassword } = useFirebaseAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCatDelete, setConfirmCatDelete] = useState(null);
  // Klick woanders → Bestätigungszustand zurücksetzen
  const logoutBtnRef = useConfirmReset(confirmLogout, () => setConfirmLogout(false));
  const catBtnRef = useConfirmReset(confirmCatDelete !== null, () => setConfirmCatDelete(null));
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  // { ok: bool, text: string }
  const [pwMsg, setPwMsg] = useState(null);
  const [openaiKey, setOpenaiKey] = useState(userProfile?.openaiKey || "");
  const [aiEnabled, setAiEnabled] = useState(userProfile?.aiEnabled || false);
  const [aiSaved, setAiSaved] = useState(false);
  const [undoDuration, setUndoDuration] = useState(
    userProfile?.undoDurationSec ?? DEFAULT_UNDO_DURATION_SEC
  );
  const [undoSaved, setUndoSaved] = useState(false);

  const handleDeleteCat = async (cat) => {
    if (confirmCatDelete !== cat.id) { setConfirmCatDelete(cat.id); return; }
    await deleteCategory(user.uid, cat.id);
    setConfirmCatDelete(null);
    onCategoryDeleted?.();
  };

  const handleChangePw = async (e) => {
    e.preventDefault();
    if (newPw !== newPw2) {
      setPwMsg({ ok: false, text: "Die neuen Passwörter stimmen nicht überein." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      await changePassword(currentPw, newPw);
      setPwMsg({ ok: true, text: "Passwort erfolgreich geändert!" });
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
    } catch (err) {
      setPwMsg({ ok: false, text: authErrorMessage(err) });
    }
    setPwBusy(false);
  };

  // Aktuelles Passwort vergessen → Link zum Zurücksetzen an die eigene Adresse
  const handleSendResetMail = async () => {
    setPwBusy(true);
    setPwMsg(null);
    try {
      await resetPassword(user.email);
      setPwMsg({ ok: true, text: `Link zum Zurücksetzen an ${user.email} gesendet. Bitte auch den Spam-Ordner prüfen.` });
    } catch (err) {
      setPwMsg({ ok: false, text: authErrorMessage(err) });
    }
    setPwBusy(false);
  };

  const handleSaveAI = async () => {
    await updateDoc(doc(db, "users", user.uid), { openaiKey, aiEnabled });
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const handleSaveUndo = async () => {
    await updateUserProfile({ undoDurationSec: undoDuration });
    setUndoSaved(true);
    setTimeout(() => setUndoSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Profile */}
      <div className="glass rounded-[24px] p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">
            {(userProfile?.displayName || user?.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{userProfile?.displayName || "–"}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${userProfile?.role === "admin" ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-500"}`}>
              {userProfile?.role || "user"}
            </span>
          </div>
        </div>
      </div>

      {/* Windows-Desktop-App */}
      {isDesktop && (
        <div className="glass rounded-[24px] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">🖥️ Desktop-App</h3>
          <p className="text-xs text-slate-500">Tastenkürzel, automatisches Einfahren, Bildschirmrand, Breite und Autostart.</p>
          <div className="flex gap-2">
            <button onClick={() => sendAppCommand({ type: "settings" })}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold btn-liquid">
              Desktop-Einstellungen
            </button>
            <button onClick={() => sendAppCommand({ type: "help" })}
              className="flex-1 py-2.5 rounded-xl bg-white/70 border border-slate-200 text-slate-600 text-sm font-medium">
              Tastenkürzel
            </button>
          </div>
        </div>
      )}

      {/* KI Feature */}
      <div className="glass rounded-[24px] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs">✦</span>
          KI-Notiz Erstellung
        </h3>
        <div className="flex items-center gap-3">
          <button onClick={() => setAiEnabled(!aiEnabled)}
            className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${aiEnabled ? "bg-violet-500" : "bg-slate-300"}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${aiEnabled ? "left-[22px]" : "left-1"}`} />
          </button>
          <p className="text-sm text-slate-700">KI-Erstellung aktivieren</p>
        </div>
        {aiEnabled && (
          <>
            <input value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-... (OpenAI API Key)"
              type="password"
              className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
            <button onClick={handleSaveAI}
              className="w-full py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-all">
              {aiSaved ? "✓ Gespeichert!" : "API-Key speichern"}
            </button>
          </>
        )}
      </div>

      {/* Rückgängig-Banner Dauer */}
      <div className="glass rounded-[24px] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 flex items-center justify-center text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5L1 10"/>
            </svg>
          </span>
          Rückgängig-Anzeige
        </h3>
        <p className="text-xs text-slate-500">
          Wie lange das „Rückgängig?"-Banner nach einer Swipe-Aktion eingeblendet bleibt.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range" min={1} max={15} step={1}
            value={undoDuration}
            onChange={(e) => setUndoDuration(Number(e.target.value))}
            className="flex-1 accent-indigo-500"
          />
          <span className="text-sm font-semibold text-slate-700 w-12 text-right tabular-nums">
            {undoDuration}s
          </span>
        </div>
        <button onClick={handleSaveUndo}
          className="w-full py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-all">
          {undoSaved ? "✓ Gespeichert!" : "Dauer speichern"}
        </button>
      </div>

      {/* Password */}
      <div className="glass rounded-[24px] p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Passwort ändern</h3>
        <form onSubmit={handleChangePw} className="space-y-2">
          <input type="email" value={user?.email || ""} autoComplete="username" readOnly hidden />
          <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Aktuelles Passwort" required autoComplete="current-password"
            className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
            placeholder="Neues Passwort (min. 6 Zeichen)" minLength={6} required autoComplete="new-password"
            className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
            placeholder="Neues Passwort wiederholen" minLength={6} required autoComplete="new-password"
            className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <button type="submit" disabled={pwBusy}
            className="w-full py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all disabled:opacity-60">
            {pwBusy ? "Bitte warten..." : "Passwort ändern"}
          </button>
        </form>
        <button type="button" onClick={handleSendResetMail} disabled={pwBusy}
          className="w-full mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60">
          Aktuelles Passwort vergessen? Link zum Zurücksetzen per E-Mail senden
        </button>
        {pwMsg && <p className={`text-xs mt-2 ${pwMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{pwMsg.text}</p>}
      </div>

      {/* Categories */}
      <div className="glass rounded-[24px] p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Tags verwalten</h3>
        {categories.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Tags vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-700">{c.name}</span>
                <button ref={confirmCatDelete === c.id ? catBtnRef : null} onClick={() => handleDeleteCat(c)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-all ${confirmCatDelete === c.id ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                  {confirmCatDelete === c.id ? "Sicher?" : "Löschen"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export & Backup */}
      <div className="glass rounded-[24px] p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Export & Backup</h3>
        <ExportPanel todos={todos} categories={categories} />
      </div>

      {/* Logout */}
      <button ref={logoutBtnRef} onClick={() => { if (!confirmLogout) { setConfirmLogout(true); return; } logout(); }}
        className={`w-full py-3 rounded-[22px] text-sm font-semibold transition-all ${confirmLogout ? "bg-red-500 text-white shadow-lg shadow-red-500/30" : "bg-red-50/70 border border-red-200 text-red-600 hover:bg-red-100"}`}>
        {confirmLogout ? "Wirklich abmelden?" : "Abmelden"}
      </button>
    </div>
  );
}