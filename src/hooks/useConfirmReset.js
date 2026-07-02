import { useEffect, useRef } from "react";

/**
 * Setzt einen "Wirklich?"-Bestätigungszustand automatisch zurück,
 * sobald der Nutzer irgendwo anders hinklickt/tippt — oder nach einem Timeout.
 *
 * Verwendung:
 *   const btnRef = useConfirmReset(confirmDelete, () => setConfirmDelete(false));
 *   <button ref={btnRef} ...>
 *
 * Klicks INNERHALB des referenzierten Elements lösen keinen Reset aus
 * (damit der zweite Bestätigungs-Klick durchgeht).
 */
export default function useConfirmReset(active, reset, timeoutMs = 4000) {
  const ref = useRef(null);
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      resetRef.current();
    };
    // capture-Phase, damit der Reset auch greift, wenn andere Elemente stopPropagation nutzen
    document.addEventListener("pointerdown", onPointerDown, true);
    const t = timeoutMs ? setTimeout(() => resetRef.current(), timeoutMs) : null;
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (t) clearTimeout(t);
    };
  }, [active, timeoutMs]);

  return ref;
}
