import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

export default function AdminPanel() {
  const { createUser, isAdmin } = useFirebaseAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ email: "", password: "", displayName: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "users"));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      await createUser(newUser.email, newUser.password, newUser.displayName);
      setSuccess(`User "${newUser.displayName}" wurde erstellt.`);
      setNewUser({ email: "", password: "", displayName: "" });
      fetchUsers();
    } catch (err) {
      setError(err.message || "Fehler beim Erstellen.");
    }
    setCreating(false);
  };

  const setRole = async (uid, role) => {
    await updateDoc(doc(db, "users", uid), { role });
    fetchUsers();
  };

  const handleDeleteUser = async (uid) => {
    if (confirmDelete !== uid) { setConfirmDelete(uid); return; }
    await deleteDoc(doc(db, "users", uid));
    setConfirmDelete(null);
    fetchUsers();
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-slate-400 text-sm">Kein Zugriff. Nur für Admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create User */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Neuen User anlegen</h3>
        <form onSubmit={handleCreate} className="space-y-2.5">
          <input value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
            placeholder="Name" required className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            type="email" placeholder="E-Mail" required className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            type="password" placeholder="Passwort" required minLength={6} className="w-full px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          {success && <p className="text-emerald-600 text-xs">{success}</p>}
          <button type="submit" disabled={creating}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold disabled:opacity-60">
            {creating ? "Erstelle..." : "User erstellen"}
          </button>
        </form>
      </div>

      {/* User List */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Alle Users ({users.length})</h3>
        {loading ? (
          <p className="text-slate-400 text-sm">Laden...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(u.displayName || u.email || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{u.displayName || "–"}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <select value={u.role || "user"} onChange={(e) => setRole(u.id, e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={() => handleDeleteUser(u.id)}
                  className={`text-xs px-2 py-1 rounded-lg transition-all ${confirmDelete === u.id ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                  {confirmDelete === u.id ? "Sicher?" : "×"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}