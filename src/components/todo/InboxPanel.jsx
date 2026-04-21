import React, { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeInbox, acceptSharedTodo, dismissInboxItem, getSharedTodo } from "@/lib/todoService";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function InboxPanel() {
  const { user } = useFirebaseAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState({});

  useEffect(() => {
    const unsub = subscribeInbox(user.uid, setItems);
    return unsub;
  }, [user.uid]);

  const handleAccept = async (item) => {
    setLoading((l) => ({ ...l, [item.id]: "accepting" }));
    const shared = await getSharedTodo(item.sharedTodoId);
    if (shared) await acceptSharedTodo(user.uid, item, shared);
    setLoading((l) => ({ ...l, [item.id]: null }));
  };

  const handleDismiss = async (item) => {
    setLoading((l) => ({ ...l, [item.id]: "dismissing" }));
    await dismissInboxItem(user.uid, item.id);
    setLoading((l) => ({ ...l, [item.id]: null }));
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📬</div>
        <p className="text-slate-400 text-sm">Keine Nachrichten</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{item.todoTitle}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                von <span className="font-medium text-blue-500">{item.fromName || item.fromUid}</span>
                {item.isCollaborative && <span className="ml-1.5 text-purple-500">· Zusammenarbeit</span>}
              </p>
              {item.createdAt && (
                <p className="text-[10px] text-slate-300 mt-0.5">
                  {format(item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt), "dd.MM.yy HH:mm", { locale: de })}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleDismiss(item)} disabled={!!loading[item.id]}
              className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all disabled:opacity-50">
              {loading[item.id] === "dismissing" ? "..." : "Ablehnen"}
            </button>
            <button onClick={() => handleAccept(item)} disabled={!!loading[item.id]}
              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50">
              {loading[item.id] === "accepting" ? "..." : "Übernehmen"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}