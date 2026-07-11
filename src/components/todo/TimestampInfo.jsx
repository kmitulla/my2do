import { format } from "date-fns";

const toDate = (v) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// Dezente "Erstellt … · Geändert …"-Zeile für die Editoren (2dos & Notizen)
export default function TimestampInfo({ createdAt, updatedAt, className = "" }) {
  const created = toDate(createdAt);
  const updated = toDate(updatedAt);
  if (!created && !updated) return null;
  const fmt = (d) => format(d, "dd.MM.yyyy, HH:mm");
  return (
    <p className={`text-[10px] text-slate-400 truncate ${className}`}>
      {created && <span>Erstellt {fmt(created)}</span>}
      {created && updated && <span className="mx-1.5">·</span>}
      {updated && <span>Geändert {fmt(updated)}</span>}
    </p>
  );
}
