import React, { useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { acceptSharedTodo, declineSharedTodo } from "@/lib/todoService";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIO_DOT = { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" };

const fmt = (v, pattern) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : format(d, pattern, { locale: de });
};

// Gesendete 2dos, die man noch annehmen oder ablehnen kann. Nach dem Annehmen
// ist man Mitbearbeiter: Inhalt, Status, Prio, Deadline & Archiv sind
// gemeinsam — Tags, Wiedervorlage und Favoriten setzt jeder für sich.
export default function InboxPanel({ items = [] }) {
  const { user, userProfile } = useFirebaseAuth();
  const [busy, setBusy] = useState({});

  const handleAccept = (item) => {
    setBusy((b) => ({ ...b, [item.id]: "accepting" }));
    acceptSharedTodo(user.uid, userProfile?.displayName || user.email, item);
  };

  const handleDecline = (item) => {
    setBusy((b) => ({ ...b, [item.id]: "declining" }));
    declineSharedTodo(user.uid, item.id);
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📬</div>
        <p className="text-slate-400 text-sm">Keine Nachrichten</p>
        <p className="text-slate-400 text-xs mt-1">Hier landen 2dos, die dir andere senden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const others = (item.collaborators || [])
          .filter((uid) => uid !== user.uid)
          .map((uid) => item.memberNames?.[uid] || "Unbekannt");
        const deadline = fmt(item.deadline, "dd.MM.yy HH:mm");
        const sent = fmt(item.createdAt, "dd.MM.yy HH:mm");
        return (
          <div key={item.id} className="glass rounded-[24px] p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIO_DOT[item.prio] || PRIO_DOT.B}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{item.title || "Ohne Titel"}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  von <span className="font-medium text-blue-500">{item.sharedByName || "Unbekannt"}</span>
                  <span className="ml-1.5 text-purple-500">· als Mitbearbeiter</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-slate-400">
                  {item.status && <span>Status: {item.status}</span>}
                  {deadline && <span>📅 {deadline}</span>}
                  {sent && <span>gesendet {sent}</span>}
                </div>
                {others.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">Mitbearbeiter: {others.join(", ")}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDecline(item)} disabled={!!busy[item.id]}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all disabled:opacity-50">
                {busy[item.id] === "declining" ? "..." : "Ablehnen"}
              </button>
              <button onClick={() => handleAccept(item)} disabled={!!busy[item.id]}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-semibold btn-liquid disabled:opacity-50">
                {busy[item.id] === "accepting" ? "..." : "Annehmen"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
