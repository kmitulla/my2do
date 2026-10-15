import React from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { setTodoFavorite } from "@/lib/todoService";

export function StarIcon({ filled, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

// Stern zum (Ent-)Markieren als Favorit. Wird sofort gespeichert; der Klick
// wird nicht an die Karte weitergereicht (öffnet also nicht das Todo).
export default function FavoriteButton({ todo, favorite = !!todo.favorite, onToggled, size = 15, className = "" }) {
  const { user } = useFirebaseAuth();

  const toggle = (e) => {
    e.stopPropagation();
    const next = !favorite;
    if (navigator.vibrate) navigator.vibrate(8);
    setTodoFavorite(user.uid, todo.id, next);
    onToggled?.(next);
  };

  return (
    <button type="button" onClick={toggle}
      title={favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
      aria-label={favorite ? "Aus Favoriten entfernen" : "Als Favorit markieren"}
      aria-pressed={favorite}
      className={`flex items-center justify-center flex-shrink-0 transition-all active:scale-75 ${
        favorite ? "text-amber-400" : "text-slate-300 hover:text-amber-400"
      } ${className}`}>
      <StarIcon filled={favorite} size={size} />
    </button>
  );
}
