import React from "react";
import { lockedByOther } from "@/lib/todoService";
import { toast } from "@/components/ui/use-toast";

export function UsersIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

export function LockIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

export const memberNameList = (todo, ownUid) =>
  (todo.collaborators || []).map((uid) =>
    uid === ownUid ? "Du" : (todo.memberNames?.[uid] || "Unbekannt"));

// Hinweis, wenn eine Schnellaktion (Swipe, Abhaken) an der Sperre scheitert
export const notifyLocked = (todo) => {
  const lock = lockedByOther(todo);
  toast({
    title: "Gerade gesperrt",
    description: `${lock?.name || "Jemand"} bearbeitet „${todo.title || "dieses 2do"}" gerade. Versuch es gleich nochmal.`,
  });
};

// Kleines Abzeichen auf den Karten: geteilt (Anzahl Mitbearbeiter) bzw.
// Schloss, solange jemand anderes das 2do bearbeitet
export default function SharedBadge({ todo, className = "" }) {
  if (!todo.sharedId) return null;
  const lock = lockedByOther(todo);
  const count = (todo.collaborators || []).length;
  const title = lock
    ? `${lock.name || "Jemand"} bearbeitet gerade`
    : `Geteilt mit ${(todo.collaborators || []).length} Personen: ${Object.values(todo.memberNames || {}).join(", ")}`;
  return (
    <span title={title}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold flex-shrink-0 ${
        lock ? "bg-amber-100 text-amber-700" : "bg-sky-100/80 text-sky-600"
      } ${className}`}>
      {lock ? <LockIcon size={10} /> : <UsersIcon size={10} />}
      {lock ? <span className="max-w-[70px] truncate">{lock.name}</span> : count}
    </span>
  );
}
