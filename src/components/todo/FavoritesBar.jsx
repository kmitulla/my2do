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
    <div className="glass rounded-[24px] px-3 pt-2.5 pb-3">
      <div className="flex items-center gap-1.5 mb-2 px-0.5 text-amber-400">
        <StarIcon filled size={12} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Favoriten</span>
        <span className="text-[10px] text-slate-400">{favorites.length}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
        {favorites.map((t) => (
          <button key={t.id} onClick={() => onOpen(t)} title={t.title}
            className="flex-shrink-0 max-w-[200px] flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-2xl glass-chip active:scale-95 transition-all">
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
