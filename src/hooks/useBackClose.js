import { useEffect, useRef } from "react";

/**
 * Zurück-Taste (Android) bzw. Zurück-Wischgeste schließt ein offenes Blatt
 * (2do, Notizseite am Handy), statt die App zu verlassen.
 *
 * Solange `active` ist, liegt ein zusätzlicher Verlaufseintrag auf dem Stapel.
 * Zurück entfernt ihn und ruft onBack() auf. Gibt onBack() false zurück
 * (z. B. Rückfrage zu ungespeicherten Änderungen), bleibt das Blatt offen und
 * der Eintrag wird erneut angelegt. Wird das Blatt anders geschlossen
 * (X, Speichern), räumt der Hook den Eintrag selbst wieder ab.
 */
export default function useBackClose(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const mark = `my2do-sheet-${Math.random().toString(36).slice(2)}`;
    // Router-Zustand (Hash-Router: key/idx) beibehalten
    const push = () => window.history.pushState({ ...(window.history.state || {}), my2doSheet: mark }, "");
    push();
    let pushed = true;

    const onPop = () => {
      if (!pushed || window.history.state?.my2doSheet === mark) return;
      pushed = false;
      if (onBackRef.current?.() === false) {
        push();
        pushed = true;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // anders geschlossen → eigenen Eintrag wieder entfernen
      if (pushed && window.history.state?.my2doSheet === mark) window.history.back();
    };
  }, [active]);
}
