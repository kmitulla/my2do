import React, { useEffect, useRef, useState } from "react";
import {
  SquareCheckBig, NotebookPen, LayoutDashboard, Inbox, Undo2, Redo2, Sparkles,
  Settings, ShieldCheck, LogOut, SlidersHorizontal, Keyboard,
} from "lucide-react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import SyncIndicator from "./SyncIndicator";
import { PanelControls } from "@/components/desktop/DesktopShell";
import { usePanel, useRegisterAppBar } from "@/components/desktop/panelContext";

// Hauptbereiche – oben als Segment (breite Bildschirme), unten als Dock
// (Handy & Desktop-Panel). Einstellungen/Admin liegen im Profilmenü.
export const NAV = [
  { key: "todos", label: "Aufgaben", Icon: SquareCheckBig },
  { key: "notes", label: "Notizen", Icon: NotebookPen },
  { key: "overview", label: "Übersicht", Icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", Icon: Inbox },
];

function Brand() {
  return (
    <div className="flex items-center gap-2 pl-1.5 pr-1 min-w-0">
      <div className="w-8 h-8 rounded-[11px] bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/30 flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <span className="text-[17px] font-bold text-slate-800 tracking-tight">2Do</span>
      <SyncIndicator compact className="ml-0.5" />
    </div>
  );
}

function ProfileMenu({ onOpenTab, activeTab }) {
  const { user, userProfile, isAdmin, logout } = useFirebaseAuth();
  const panel = usePanel();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) { setConfirmLogout(false); return; }
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = userProfile?.displayName || user?.displayName || user?.email || "?";
  const go = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen((v) => !v)} title="Profil & Einstellungen" aria-expanded={open}
        className={`w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[13px] font-bold transition-all active:scale-95 ${
          open || activeTab === "settings" || activeTab === "admin" ? "ring-2 ring-indigo-400/70 ring-offset-2 ring-offset-white/60" : ""
        }`}>
        {name[0].toUpperCase()}
      </button>
      {open && (
        <div className="menu glass-strong right-0 top-full mt-2">
          <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 truncate">{name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="menu-sep" />
          <button className="menu-item" onClick={go(() => onOpenTab("settings"))}>
            <Settings size={16} className="text-slate-400" /> Einstellungen
          </button>
          {isAdmin && (
            <button className="menu-item" onClick={go(() => onOpenTab("admin"))}>
              <ShieldCheck size={16} className="text-slate-400" /> Benutzerverwaltung
            </button>
          )}
          {panel && (
            <>
              <button className="menu-item" onClick={go(() => panel.openOverlay("settings"))}>
                <SlidersHorizontal size={16} className="text-slate-400" /> Desktop-Einstellungen
                <span className="ml-auto text-[11px] text-slate-400">Strg+,</span>
              </button>
              <button className="menu-item" onClick={go(() => panel.openOverlay("help"))}>
                <Keyboard size={16} className="text-slate-400" /> Tastenkürzel
                <span className="ml-auto text-[11px] text-slate-400">F1</span>
              </button>
            </>
          )}
          <div className="menu-sep" />
          <button className="menu-item menu-item-danger"
            onClick={() => (confirmLogout ? (setOpen(false), logout()) : setConfirmLogout(true))}>
            <LogOut size={16} /> {confirmLogout ? "Wirklich abmelden?" : "Abmelden"}
          </button>
        </div>
      )}
    </div>
  );
}

// Kopfleiste: links Marke + Sync, Mitte (breit) Bereiche, rechts Aktionen
export function AppBar({ activeTab, onTab, inboxCount, aiEnabled, onAI }) {
  useRegisterAppBar();
  const panel = usePanel();
  return (
    <header className={`sticky top-0 z-40 ${panel ? "px-2 pt-2" : "px-3 pt-3"}`}>
      <div className="max-w-5xl mx-auto glass-strong rounded-[20px] h-14 pl-2 pr-2 flex items-center gap-1">
        <Brand />
        <div className="flex-1 min-w-0 flex justify-center">
          <nav className="seg hidden lg:inline-flex" aria-label="Bereiche">
            {NAV.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => onTab(key)}
                className={`seg-item ${activeTab === key ? "seg-item-active" : ""}`}>
                <Icon size={15} strokeWidth={2.2} />
                {label}
                {key === "inbox" && inboxCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center">{inboxCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        {/* Rückgängig/Wiederholen für Textfelder – nur mit Platz; im Panel und
            auf dem Handy gibt es Strg+Z bzw. die System-Geste */}
        {!panel && (
          <div className="hidden sm:flex items-center">
            <button onClick={() => document.execCommand?.("undo")} title="Rückgängig" className="btn-icon"><Undo2 size={17} /></button>
            <button onClick={() => document.execCommand?.("redo")} title="Wiederholen" className="btn-icon"><Redo2 size={17} /></button>
          </div>
        )}
        {aiEnabled && (
          <button onClick={onAI} title="2do mit KI erstellen"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30 active:scale-95 transition-all flex-shrink-0">
            <Sparkles size={16} />
          </button>
        )}
        <PanelControls />
        <ProfileMenu onOpenTab={onTab} activeTab={activeTab} />
      </div>
    </header>
  );
}

// Dock unten (Handy & Desktop-Panel)
export function NavDock({ activeTab, onTab, inboxCount }) {
  return (
    <nav className="dock glass-strong lg:hidden" aria-label="Bereiche">
      {NAV.map(({ key, label, Icon }) => (
        <button key={key} onClick={() => onTab(key)}
          className={`dock-item ${activeTab === key ? "dock-item-active" : ""}`}>
          <Icon size={19} strokeWidth={activeTab === key ? 2.4 : 2} />
          {label}
          {key === "inbox" && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
        </button>
      ))}
    </nav>
  );
}
