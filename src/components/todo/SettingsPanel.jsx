import React, { useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { deleteCategory } from "@/lib/todoService";
import { updatePassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import ExportPanel from "./ExportPanel";

export default function SettingsPanel({ categories, todos, onCategoryDeleted }) {
  const { user, userProfile, logout } = useFirebaseAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCatDelete, setConfirmCatDelete] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [openaiKey, setOpenaiKey] = useState(userProfile?.openaiKey || "");
  const [aiEnabled, setAiEnabled] = useState(userProfile?.aiEnabled || false);
  const [aiSaved, setAiSaved] = useState(false);

  const handleDeleteCat = async (cat) => {
    if (confirmCatDelete !== cat.id) { setConfirmCatDelete(cat.id); return; }
    await deleteCategory(user.uid, cat.id);
    setConfirmCatDelete(null);
    onCategoryDeleted?.();
  };

  const handleChangePw = async (e) => {
    e.preventDefault();
    try {
      await updatePassword(auth.currentUser, newPw);
      setPwMsg("Passwort erfolgreich geändert!");
      setNewPw("");
    } catch (err) {
      setPwMsg("Fehler: " + err.message);
    }
  };

  const handleSaveAI = async () => {
    await updateDoc(doc(db, "users", user.uid), { openaiKey, aiEnabled });
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Profile */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
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

      {/* KI Feature */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4 space-y-3">
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

      {/* Password */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Passwort ändern</h3>
        <form onSubmit={handleChangePw} className="flex gap-2">
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
            placeholder="Neues Passwort (min. 6 Zeichen)" minLength={6} required
            className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <button type="submit" className="px-3 py-2 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600">OK</button>
        </form>
        {pwMsg && <p className={`text-xs mt-2 ${pwMsg.includes("Fehler") ? "text-red-500" : "text-emerald-600"}`}>{pwMsg}</p>}
      </div>

      {/* Categories */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Tags verwalten</h3>
        {categories.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Tags vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-700">{c.name}</span>
                <button onClick={() => handleDeleteCat(c)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-all ${confirmCatDelete === c.id ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                  {confirmCatDelete === c.id ? "Sicher?" : "Löschen"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export & Backup */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Export & Backup</h3>
        <ExportPanel todos={todos} categories={categories} />
      </div>

      {/* Logout */}
      <button onClick={() => { if (!confirmLogout) { setConfirmLogout(true); return; } logout(); }}
        className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${confirmLogout ? "bg-red-500 text-white" : "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"}`}>
        {confirmLogout ? "Wirklich abmelden?" : "Abmelden"}
      </button>
    </div>
  );
}