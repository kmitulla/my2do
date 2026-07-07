// Globaler Sync-Status: kombiniert Online/Offline (window-Events) mit
// ausstehenden Firestore-Schreibvorgängen (hasPendingWrites aus den Snapshots).
// Kompatibel mit useSyncExternalStore.

const pendingSources = new Set();
const listeners = new Set();

let snapshot = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pending: false,
};

const notify = () => {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  const pending = pendingSources.size > 0;
  if (online !== snapshot.online || pending !== snapshot.pending) {
    snapshot = { online, pending };
    listeners.forEach((cb) => cb());
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}

// Wird von den onSnapshot-Callbacks in todoService.js gemeldet
export const reportPending = (sourceKey, hasPending) => {
  if (hasPending) pendingSources.add(sourceKey);
  else pendingSources.delete(sourceKey);
  notify();
};

export const subscribeSyncStatus = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const getSyncStatus = () => snapshot;
