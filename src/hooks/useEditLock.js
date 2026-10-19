import { useEffect, useRef, useState } from "react";
import {
  subscribeDocLive, acquireEditLock, refreshEditLock, releaseEditLock,
  lockedByOther, LOCK_HEARTBEAT_MS,
} from "@/lib/todoService";

/**
 * Bearbeitungssperre für ein Dokument (2do oder Notizseite): beim Öffnen holen,
 * per Heartbeat halten, beim Schließen freigeben. Ist das Dokument gerade in
 * einem anderen Editor offen (andere Person, anderes Fenster, anderes Gerät),
 * wird es automatisch übernommen, sobald es frei ist.
 *
 * path: Firestore-Pfad als Segmente, null = keine Sperre (z. B. ohne Dokument)
 *
 * lockState: none | pending | mine | other | offline (Sperre nicht möglich,
 * man arbeitet ohne – Firestore synchronisiert später)
 * live: aktueller Stand des Dokuments (für das Mitlaufen im Lesemodus)
 * otherLock: die fremde Sperre ({ uid, name, session }) im Zustand "other"
 * takeOver(): eigene Sperre aus einem anderen Fenster/Gerät übernehmen
 */
export default function useEditLock({ path, uid, name, initial = null }) {
  const key = path ? path.join("/") : null;
  const [live, setLive] = useState(initial);
  const [lockState, setLockState] = useState(() =>
    !key ? "none" : lockedByOther(initial) ? "other" : "pending");
  const liveRef = useRef(live);
  const stateRef = useRef(lockState);
  const nameRef = useRef(name);
  const actionsRef = useRef(null);
  liveRef.current = live;
  stateRef.current = lockState;
  nameRef.current = name;

  useEffect(() => {
    if (!key) {
      setLockState("none");
      return;
    }
    const segments = key.split("/");
    let cancelled = false;
    let holding = false;
    let busy = false;
    const set = (s) => { if (!cancelled) setLockState(s); };

    const tryAcquire = async (force = false) => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const res = await acquireEditLock(segments, uid, nameRef.current, { force });
        if (cancelled) {
          if (res.ok) releaseEditLock(segments);
          return;
        }
        holding = res.ok;
        set(res.ok ? "mine" : res.lock ? "other" : "offline");
      } catch {
        // offline / Timeout: ohne Sperre weiterarbeiten, außer der Cache
        // kennt eine aktive fremde Sperre
        set(lockedByOther(liveRef.current) ? "other" : "offline");
      } finally {
        busy = false;
      }
    };
    actionsRef.current = { takeOver: () => tryAcquire(true) };

    const unsub = subscribeDocLive(segments, (data) => {
      if (cancelled || !data) return;
      setLive(data);
      if (stateRef.current === "mine" && lockedByOther(data)) {
        // Sperre verloren (übernommen oder nach Standby abgelaufen) → nur lesen
        holding = false;
        set("other");
      } else if (stateRef.current === "other" && !lockedByOther(data)) {
        tryAcquire();
      }
    });
    tryAcquire();

    // Alle 5 s: eigene Sperre regelmäßig erneuern bzw. – falls keine gehalten
    // wird – neu versuchen (fremde Sperre abgelaufen, wieder online)
    let lastBeat = Date.now();
    const timer = setInterval(async () => {
      if (holding) {
        if (Date.now() - lastBeat < LOCK_HEARTBEAT_MS) return;
        lastBeat = Date.now();
        try {
          if (!(await refreshEditLock(segments)) && !cancelled) {
            holding = false;
            set(lockedByOther(liveRef.current) ? "other" : "offline");
          }
        } catch { /* offline – Sperre verfällt ggf., wird neu geholt */ }
      } else if (!lockedByOther(liveRef.current)) {
        lastBeat = Date.now();
        tryAcquire();
      }
    }, 5000);

    const onUnload = () => { if (holding) releaseEditLock(segments); };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      actionsRef.current = null;
      clearInterval(timer);
      window.removeEventListener("pagehide", onUnload);
      unsub();
      if (holding) releaseEditLock(segments);
    };
  }, [key, uid]);

  const otherLock = lockState === "other" ? (lockedByOther(live) || live?.editLock || null) : null;
  return { lockState, live, otherLock, takeOver: () => actionsRef.current?.takeOver() };
}
