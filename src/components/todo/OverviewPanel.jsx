import React from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIO_STYLES = {
  A: "bg-red-100 text-red-600",
  B: "bg-orange-100 text-orange-600",
  C: "bg-emerald-100 text-emerald-600",
};

function formatDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "dd.MM.yy", { locale: de });
}

export default function OverviewPanel({ todos }) {
  const active = todos.filter((t) => !t.archived);
  const total = active.length;
  const byStatus = {
    offen: active.filter((t) => t.status === "offen").length,
    "in Arbeit": active.filter((t) => t.status === "in Arbeit").length,
    wartend: active.filter((t) => t.status === "wartend").length,
    erledigt: active.filter((t) => t.status === "erledigt").length,
  };
  const byPrio = {
    A: active.filter((t) => t.prio === "A").length,
    B: active.filter((t) => t.prio === "B").length,
    C: active.filter((t) => t.prio === "C").length,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = active.filter((t) => {
    if (!t.deadline || t.status === "erledigt") return false;
    const d = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
    return d < today;
  });
  const todayItems = active.filter((t) => {
    if (!t.deadline) return false;
    const d = t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline);
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() === today.getTime();
  });
  const wiedervorlageToday = active.filter((t) => {
    if (!t.wiedervorlage) return false;
    const d = t.wiedervorlage.toDate ? t.wiedervorlage.toDate() : new Date(t.wiedervorlage);
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() === today.getTime();
  });

  const stats = [
    { label: "Gesamt", value: total, color: "bg-blue-50 text-blue-600" },
    { label: "Offen", value: byStatus.offen, color: "bg-slate-100 text-slate-600" },
    { label: "In Arbeit", value: byStatus["in Arbeit"], color: "bg-blue-100 text-blue-600" },
    { label: "Erledigt", value: byStatus.erledigt, color: "bg-emerald-100 text-emerald-600" },
    { label: "Überfällig", value: overdue.length, color: overdue.length > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400" },
    { label: "Heute fällig", value: todayItems.length, color: todayItems.length > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl p-3 text-center ${s.color}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[10px] font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Prio */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-3">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Nach Priorität</h4>
        <div className="flex gap-2">
          {["A", "B", "C"].map((p) => (
            <div key={p} className={`flex-1 text-center py-2 rounded-xl ${PRIO_STYLES[p]}`}>
              <div className="text-xl font-bold">{byPrio[p]}</div>
              <div className="text-xs font-medium">Prio {p}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-red-50/80 backdrop-blur-xl rounded-2xl border border-red-200 p-3">
          <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">⚠️ Überfällig ({overdue.length})</h4>
          <div className="space-y-1.5">
            {overdue.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <span className="text-sm text-red-700 font-medium truncate flex-1">{t.title}</span>
                <span className="text-xs text-red-400 ml-2">{formatDate(t.deadline)}</span>
              </div>
            ))}
            {overdue.length > 5 && <p className="text-xs text-red-400">+ {overdue.length - 5} weitere</p>}
          </div>
        </div>
      )}

      {/* Wiedervorlage Heute */}
      {wiedervorlageToday.length > 0 && (
        <div className="bg-purple-50/80 backdrop-blur-xl rounded-2xl border border-purple-200 p-3">
          <h4 className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-2">🔄 Wiedervorlage Heute ({wiedervorlageToday.length})</h4>
          <div className="space-y-1.5">
            {wiedervorlageToday.map((t) => (
              <p key={t.id} className="text-sm text-purple-700 font-medium truncate">{t.title}</p>
            ))}
          </div>
        </div>
      )}

      {/* Today */}
      {todayItems.length > 0 && (
        <div className="bg-amber-50/80 backdrop-blur-xl rounded-2xl border border-amber-200 p-3">
          <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">📅 Heute fällig ({todayItems.length})</h4>
          <div className="space-y-1.5">
            {todayItems.map((t) => (
              <p key={t.id} className="text-sm text-amber-700 font-medium truncate">{t.title}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}