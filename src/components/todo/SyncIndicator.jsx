import React, { useSyncExternalStore } from "react";
import { subscribeSyncStatus, getSyncStatus } from "@/lib/syncStatus";
import { Cloud, CloudOff, RefreshCw, CloudAlert } from "lucide-react";

// Sync-Status-Pill: online / offline / synchronisiert / synchronisieren notwendig.
// compact = nur Icon + Punkt (für enge Popup-Header)
export default function SyncIndicator({ compact = false, className = "" }) {
  const { online, pending } = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    () => ({ online: true, pending: false })
  );

  let icon, label, classes, title;
  if (online && !pending) {
    icon = <Cloud className="w-3 h-3" />;
    label = "Synchronisiert";
    classes = "bg-emerald-100/80 text-emerald-700";
    title = "Online – alle Änderungen sind synchronisiert";
  } else if (online && pending) {
    icon = <RefreshCw className="w-3 h-3 animate-spin" />;
    label = "Synchronisiert…";
    classes = "bg-blue-100/80 text-blue-700";
    title = "Online – Änderungen werden gerade synchronisiert";
  } else if (!online && pending) {
    icon = <CloudAlert className="w-3 h-3" />;
    label = "Offline – nicht synchronisiert";
    classes = "bg-amber-100/90 text-amber-800";
    title = "Offline – Änderungen sind lokal gespeichert und werden synchronisiert, sobald du wieder online bist";
  } else {
    icon = <CloudOff className="w-3 h-3" />;
    label = "Offline";
    classes = "bg-slate-200/80 text-slate-600";
    title = "Offline – alles gespeichert, keine ausstehenden Änderungen";
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap select-none ${classes} ${className}`}
    >
      {icon}
      {!compact && <span>{label}</span>}
      {!online && pending && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
    </span>
  );
}
