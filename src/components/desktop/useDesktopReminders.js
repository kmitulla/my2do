import { useEffect, useRef } from "react";
import { desktop } from "@/lib/desktop";

const LS_SENT = "desktop_reminders_sent";
const DEADLINE_LEAD_MS = 15 * 60 * 1000;

const toDate = (v) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function loadSent() {
  try {
    const sent = JSON.parse(localStorage.getItem(LS_SENT)) || {};
    // Einträge älter als 3 Tage verwerfen
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    Object.keys(sent).forEach((k) => { if (sent[k] < cutoff) delete sent[k]; });
    return sent;
  } catch {
    return {};
  }
}

// Windows-Hinweise in der Desktop-App: kurz vor einer Deadline und wenn eine
// Wiedervorlage heute fällig wird. Jeder Hinweis kommt nur einmal.
export default function useDesktopReminders(todos) {
  const todosRef = useRef(todos);
  todosRef.current = todos;

  useEffect(() => {
    if (!desktop) return;
    const check = () => {
      const now = new Date();
      const sent = loadSent();
      const dueToday = [];
      for (const t of todosRef.current) {
        if (t.archived || t.status === "erledigt") continue;
        const deadline = toDate(t.deadline);
        if (deadline) {
          const diff = deadline.getTime() - now.getTime();
          const key = `dl:${t.id}:${deadline.getTime()}`;
          if (diff <= DEADLINE_LEAD_MS && diff > -60 * 1000 && !sent[key]) {
            sent[key] = Date.now();
            desktop.notify({
              title: diff > 60 * 1000 ? `Deadline in ${Math.round(diff / 60000)} Minuten` : "Deadline jetzt",
              body: t.title || "Ohne Titel",
              todoId: t.id,
            });
          }
        }
        const wv = toDate(t.wiedervorlage);
        if (wv && wv <= now && dayKey(wv) === dayKey(now)) {
          const key = `wv:${t.id}:${dayKey(now)}`;
          if (!sent[key]) {
            sent[key] = Date.now();
            dueToday.push(t);
          }
        }
      }
      if (dueToday.length === 1) {
        desktop.notify({ title: "Wiedervorlage heute", body: dueToday[0].title || "Ohne Titel", todoId: dueToday[0].id });
      } else if (dueToday.length > 1) {
        const names = dueToday.slice(0, 3).map((t) => t.title || "Ohne Titel").join(" · ");
        desktop.notify({
          title: `${dueToday.length} Wiedervorlagen heute`,
          body: dueToday.length > 3 ? `${names} …` : names,
          todoId: dueToday[0].id,
        });
      }
      try { localStorage.setItem(LS_SENT, JSON.stringify(sent)); } catch { /* voll/privat */ }
    };
    const first = setTimeout(check, 8000);
    const interval = setInterval(check, 60 * 1000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);
}
