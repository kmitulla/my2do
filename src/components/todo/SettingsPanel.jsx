import React, { useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { deleteCategory, subscribeCategories } from "@/lib/todoService";
import { updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SettingsPanel({ categories, onCategoryDeleted }) {
  const { user, userProfile, logout } = useFirebaseAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmCatDelete, setConfirmCatDelete] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

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

  return (
    <div className="space-y-4">
      {/* Profile */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <div className="flex items-center gap-3 mb-3">
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

      {/* Password */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Passwort ändern</h3>
        <form onSubmit={handleChangePw} className="flex gap-2">
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
            placeholder="Neues Passwort (min. 6 Zeichen)" minLength={6} required
            className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <button type="submit" className="px-3 py-2 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 transition-all">OK</button>
        </form>
        {pwMsg && <p className={`text-xs mt-2 ${pwMsg.includes("Fehler") ? "text-red-500" : "text-emerald-600"}`}>{pwMsg}</p>}
      </div>

      {/* Categories */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Kategorien verwalten</h3>
        {categories.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Kategorien vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <span className="text-sm text-slate-700">{c.name}</span>
                <button onClick={() => handleDeleteCat(c)}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-all ${confirmCatDelete === c.id ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                  {confirmCatDelete === c.id ? "Sicher löschen?" : "Löschen"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={() => {
          if (!confirmLogout) { setConfirmLogout(true); return; }
          logout();
        }}
        className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
          confirmLogout ? "bg-red-500 text-white" : "bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
        }`}>
        {confirmLogout ? "Wirklich abmelden?" : "Abmelden"}
      </button>
    </div>
  );
}