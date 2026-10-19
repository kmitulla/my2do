import React, { useMemo } from "react";
import { StarIcon } from "./FavoriteButton";

const PRIO_DOT = { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" };

const toMs = (v) => (v ? (v.toDate ? v.toDate().getTime() : new Date(v).getTime()) : 0);

// Schnellzugriff auf als Favorit markierte (nicht archivierte) 2dos —
// unabhängig von Suche, Filtern und Sortierung. Zuletzt markierte zuerst.
export default function FavoritesBar({ todos, onOpen }) {
  const favorites = useMemo(() =>
    todos
      .filter((t) => t.favorite && !t.archived)
      .sort((a, b) => toMs(b.favoritedAt) - toMs(a.favoritedAt)),
  [todos]);

  if (favorites.length === 0) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-500 flex items-center justify-center flex-shrink-0" title="Favoriten">
        <StarIcon filled size={14} />
      </span>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar fade-x min-w-0 py-1 px-0.5">
        {favorites.map((t) => (
          <button key={t.id} onClick={() => onOpen(t)} title={t.title}
            className="flex-shrink-0 max-w-[200px] flex items-center gap-2 pl-2.5 pr-3 h-8 rounded-xl glass-chip active:scale-95 transition-all">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIO_DOT[t.prio] || PRIO_DOT.B}`} />
            <span className={`text-xs font-medium truncate ${t.status === "erledigt" ? "line-through text-slate-400" : "text-slate-700"}`}>
              {t.title || "Ohne Titel"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
