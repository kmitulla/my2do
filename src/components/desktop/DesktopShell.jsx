import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktop, windowKind, sendAppCommand, acceleratorKeys, acceleratorFromEvent } from "@/lib/desktop";
import { PanelContext, usePanel } from "./panelContext";

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ children, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const PinIcon = ({ filled }) => (
  <Icon><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" fill={filled ? "currentColor" : "none"} /></Icon>
);
const SlidersIcon = () => (
  <Icon><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Icon>
);
const CollapseIcon = () => (
  <Icon><path d="M13 17l5-5-5-5" /><path d="M6 17l5-5-5-5" /></Icon>
);
const CloseIcon = () => (
  <Icon size={13}><path d="M18 6L6 18M6 6l12 12" /></Icon>
);

// Tastenkappen-Darstellung "Strg + Alt + Leertaste"
export function Keys({ accelerator, keys, small = false }) {
  const list = keys || acceleratorKeys(accelerator);
  if (!list.length) return <span className="text-slate-400 text-xs">–</span>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {list.map((k, i) => (
        <kbd key={i} className={`dp-kbd ${small ? "dp-kbd-sm" : ""}`}>{k}</kbd>
      ))}
    </span>
  );
}

// ── Schalter / Slider im Windows-11-Stil ─────────────────────────────────────
function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-center gap-3 py-2.5 cursor-pointer select-none">
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`dp-switch ${checked ? "dp-switch-on" : ""}`}>
        <span className="dp-switch-knob" />
      </button>
    </label>
  );
}

function ShortcutRecorder({ label, value, defaultValue, error, onChange }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState(null);
  const ref = useRef(null);

  // Während der Aufnahme globale Kürzel abmelden, sonst kommt die Kombination
  // nicht in der App an
  useEffect(() => {
    if (!recording) return;
    desktop.suspendShortcuts(true);
    return () => desktop.suspendShortcuts(false);
  }, [recording]);

  const onKeyDown = (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { setRecording(false); setPreview(null); return; }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) { setRecording(false); setPreview(null); onChange(""); return; }
    }
    const mods = [e.ctrlKey && "Strg", e.altKey && "Alt", e.shiftKey && "Umschalt", e.metaKey && "Win"].filter(Boolean);
    setPreview(mods);
    const acc = acceleratorFromEvent(e);
    if (acc) {
      setRecording(false);
      setPreview(null);
      onChange(acc);
      ref.current?.blur();
    }
  };

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] font-medium text-slate-700">{label}</span>
        <button ref={ref} type="button"
          onClick={() => { setRecording(true); setPreview([]); }}
          onBlur={() => { setRecording(false); setPreview(null); }}
          onKeyDown={onKeyDown}
          title="Klicken und neue Tastenkombination drücken"
          className={`dp-recorder ${recording ? "dp-recorder-active" : ""} ${error ? "dp-recorder-error" : ""}`}>
          {recording
            ? (preview?.length ? <Keys keys={[...preview, "…"]} small /> : <span className="text-[11px] font-semibold text-indigo-600">Kombination drücken …</span>)
            : <Keys accelerator={value} small />}
        </button>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {error
          ? <span className="flex-1 text-[11px] text-red-500 leading-snug">{error}</span>
          : <span className="flex-1 text-[11px] text-slate-400">{recording ? "Esc = abbrechen · Entf = deaktivieren" : "Klicken zum Ändern"}</span>}
        {value !== defaultValue && (
          <button type="button" onClick={() => onChange(defaultValue)} className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700">
            Standard
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="dp-card">
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{title}</h3>
      <div className="divide-y divide-slate-200/60">{children}</div>
    </section>
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────
function Overlay({ title, onClose, children, footer }) {
  return (
    <div className="dp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dp-sheet">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <h2 className="flex-1 text-[15px] font-bold text-slate-800 tracking-tight">{title}</h2>
          <button onClick={onClose} className="btn-icon btn-icon-sm" title="Schließen (Esc)"><CloseIcon /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">{children}</div>
        {footer}
      </div>
    </div>
  );
}

function SettingsOverlay({ settings, onClose }) {
  const [errors, setErrors] = useState({});
  const [info, setInfo] = useState(null);
  useEffect(() => { desktop.getInfo().then(setInfo).catch(() => {}); }, []);

  const patch = async (p) => {
    const res = await desktop.setSettings(p);
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(p).forEach((k) => { delete next[k]; });
      return { ...next, ...(res?.errors || {}) };
    });
  };

  const d = settings.defaults || {};
  const shortcutError = (key) => errors[key] || settings.shortcutErrors?.[key];

  return (
    <Overlay title="Desktop-Einstellungen" onClose={onClose}>
      <Section title="Tastenkürzel (überall in Windows)">
        <ShortcutRecorder label="Panel ein-/ausfahren" value={settings.toggleShortcut}
          defaultValue={d.toggleShortcut} error={shortcutError("toggleShortcut")}
          onChange={(v) => patch({ toggleShortcut: v })} />
        <ShortcutRecorder label="Neues 2do erfassen" value={settings.quickAddShortcut}
          defaultValue={d.quickAddShortcut} error={shortcutError("quickAddShortcut")}
          onChange={(v) => patch({ quickAddShortcut: v })} />
      </Section>

      <Section title="Verhalten">
        <div className="py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px] font-medium text-slate-700">Automatisch einfahren nach</span>
            <span className="text-[13px] font-semibold text-indigo-600 tabular-nums">{settings.autoHideSec} s</span>
          </div>
          <input type="range" min="1" max="10" step="1" value={settings.autoHideSec}
            onChange={(e) => patch({ autoHideSec: Number(e.target.value) })}
            className="dp-range mt-2" />
          <span className="block text-[11px] text-slate-400 mt-1">Sobald die Maus das Panel verlässt.</span>
        </div>
        <Toggle label="Angeheftet" hint="Panel bleibt offen, bis du es selbst einfährst (Strg+P)."
          checked={settings.pinned} onChange={(v) => patch({ pinned: v })} />
        <Toggle label="Am rechten Bildschirmrand ausfahren" hint="Maus kurz an den rechten Rand schieben."
          checked={settings.edgeReveal} onChange={(v) => patch({ edgeReveal: v })} />
        {settings.edgeReveal && (
          <>
            <Toggle label="Griff am Rand zeigen" hint="Dezente Leiste am Bildschirmrand – dort fährt 2Do aus."
              checked={settings.edgeHandle} onChange={(v) => patch({ edgeHandle: v })} />
            <div className="py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-[13px] font-medium text-slate-700">Position am Rand</span>
                <span className="text-[13px] font-semibold text-indigo-600 tabular-nums">
                  {settings.handlePos < 35 ? "oben" : settings.handlePos > 65 ? "unten" : "Mitte"}
                </span>
              </div>
              <input type="range" min="10" max="90" step="1" value={settings.handlePos}
                onChange={(e) => patch({ handlePos: Number(e.target.value) })} className="dp-range mt-2" />
            </div>
            <div className="py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex-1 text-[13px] font-medium text-slate-700">Länge des Griffs</span>
                <span className="text-[13px] font-semibold text-indigo-600 tabular-nums">{settings.handleSize} %</span>
              </div>
              <input type="range" min="12" max="80" step="1" value={settings.handleSize}
                onChange={(e) => patch({ handleSize: Number(e.target.value) })} className="dp-range mt-2" />
              <span className="block text-[11px] text-slate-400 mt-1">Ausgefahren wird nur, wenn die Maus ungefähr in diesem Bereich an den Rand stößt.</span>
            </div>
            <Toggle label="Auf allen Bildschirmen" hint="Sonst nur auf dem Bildschirm, auf dem 2Do zuletzt offen war."
              checked={settings.edgeAllDisplays} onChange={(v) => patch({ edgeAllDisplays: v })} />
          </>
        )}
        <Toggle label="Erinnerungen" hint="Windows-Hinweis bei fälligen Wiedervorlagen und kurz vor einer Deadline."
          checked={settings.reminders} onChange={(v) => patch({ reminders: v })} />
      </Section>

      <Section title="Darstellung & System">
        <div className="py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px] font-medium text-slate-700">Breite</span>
            <span className="text-[13px] font-semibold text-indigo-600 tabular-nums">{settings.width} px</span>
          </div>
          <input type="range" min="360" max="900" step="10" value={settings.width}
            onChange={(e) => patch({ width: Number(e.target.value) })}
            className="dp-range mt-2" />
          <span className="block text-[11px] text-slate-400 mt-1">Oder am linken Rand des Panels ziehen.</span>
        </div>
        <Toggle label="Mit Windows starten" hint="2Do startet unsichtbar im Infobereich der Taskleiste."
          checked={settings.autostart} onChange={(v) => patch({ autostart: v })} />
        <div className="py-2.5 flex items-center gap-3">
          <span className="flex-1 text-[11px] text-slate-400">
            2Do Desktop {info?.version ? `v${info.version}` : ""}{info?.portable ? " · Portable" : ""}
          </span>
          <button type="button" onClick={() => desktop.quit()}
            className="text-[12px] font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
            2Do beenden
          </button>
        </div>
      </Section>
    </Overlay>
  );
}

function HelpOverlay({ settings, onClose }) {
  const rows = (items) => items.map(([keys, label]) => (
    <div key={label} className="flex items-center gap-3 py-2">
      <span className="flex-1 text-[13px] text-slate-700">{label}</span>
      {typeof keys === "string" ? <Keys accelerator={keys} small /> : <Keys keys={keys} small />}
    </div>
  ));
  return (
    <Overlay title="Tastenkürzel" onClose={onClose}>
      <Section title="Überall in Windows">
        {rows([
          [settings.toggleShortcut, "Panel ein-/ausfahren"],
          [settings.quickAddShortcut, "Neues 2do erfassen"],
          [["Maus", "→", "Griff am Rand"], "Panel ausfahren"],
        ])}
      </Section>
      <Section title="Im Panel">
        {rows([
          [["Strg", "N"], "Neues 2do"],
          [["Strg", "F"], "Suchen"],
          [["Strg", "1 … 5"], "Bereich wechseln"],
          [["Strg", "P"], "Anheften / lösen"],
          [["Strg", ","], "Desktop-Einstellungen"],
          [["F1"], "Diese Übersicht"],
          [["Esc"], "Panel einfahren"],
        ])}
      </Section>
      <Section title="Im 2do-Editor">
        {rows([
          [["Strg", "S"], "Speichern"],
          [["Strg", "Eingabe"], "Speichern & schließen"],
          [["Esc"], "Schließen (Änderungen werden gespeichert)"],
          [["Strg", "T"], "Zeitmarke einfügen"],
        ])}
      </Section>
    </Overlay>
  );
}

function WelcomeOverlay({ settings, onClose, onSettings }) {
  const steps = [
    { icon: "⌨️", title: "Per Tastenkürzel", text: <>Mit <Keys accelerator={settings.toggleShortcut} small /> fährt 2Do auf dem Bildschirm aus, auf dem gerade deine Maus ist – nochmal drücken fährt es ein.</> },
    { icon: "🖱️", title: "Am Bildschirmrand", text: "Schieb die Maus rechts an den Rand – dort, wo die dezente Leiste leuchtet. 2Do kommt raus und bleibt, solange die Maus drauf ist. Danach rollt es sich nach 3 Sekunden wieder ein." },
    { icon: "🪟", title: "Eigene Fenster", text: "2dos und Notizen lassen sich über das Fenster-Symbol im Editor in einem eigenen, großen Fenster öffnen." },
    { icon: "📌", title: "Anheften", text: "Mit der Pinnnadel oben (oder Strg+P) bleibt das Panel offen." },
  ];
  return (
    <Overlay title="Willkommen bei 2Do für Windows" onClose={onClose}
      footer={(
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onSettings} className="flex-1 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-white">
            Einstellungen
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold btn-liquid">
            Los geht&apos;s
          </button>
        </div>
      )}>
      {steps.map((s) => (
        <div key={s.title} className="dp-card flex gap-3 items-start">
          <span className="text-2xl leading-none mt-0.5">{s.icon}</span>
          <div className="text-[13px] text-slate-600 leading-relaxed">
            <b className="block text-slate-800 mb-0.5">{s.title}</b>{s.text}
          </div>
        </div>
      ))}
    </Overlay>
  );
}

const OVERLAYS = ["settings", "help", "welcome"];

// Anheften / Einfahren – sitzt in der Kopfleiste der App
export function PanelControls() {
  const panel = usePanel();
  if (!panel) return null;
  return (
    <>
      <button className={`btn-icon ${panel.pinned ? "btn-icon-active" : ""}`} onClick={panel.togglePin}
        title={panel.pinned ? "Angeheftet – klicken zum Lösen (Strg+P)" : "Anheften: nicht automatisch einfahren (Strg+P)"}>
        <PinIcon filled={panel.pinned} />
      </button>
      <button className="btn-icon" title="Einfahren (Esc)" onClick={panel.hide}><CollapseIcon /></button>
    </>
  );
}

// ── Eigenes Fenster (2do / Notiz) ───────────────────────────────────────────
function DesktopWindowShell({ children }) {
  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.add("desktop", "desktop-window");
    if (desktop.mica) cl.add("mica");
    window.prompt = (message, defaultValue) => desktop.prompt(message, defaultValue);
  }, []);
  return children;
}

// ── Panel-Rahmen ────────────────────────────────────────────────────────────
// Schwebendes Glas-Panel am rechten Bildschirmrand. Die Ein-/Ausfahr-Animation
// läuft per CSS innerhalb des transparenten Fensters, damit nichts auf einen
// Nachbarbildschirm "überläuft".
function DesktopPanelShell({ children }) {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(null);
  const [leavingMs, setLeavingMs] = useState(0);
  const [leavingKey, setLeavingKey] = useState(0);
  const [overlay, setOverlay] = useState(null); // settings | help | welcome
  const [resizing, setResizing] = useState(false);
  const [appBars, setAppBars] = useState(0);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const togglePin = useCallback(() => {
    desktop.setSettings({ pinned: !settingsRef.current?.pinned });
  }, []);

  const panel = useMemo(() => ({
    pinned: !!settings?.pinned,
    toggleShortcut: settings?.toggleShortcut,
    togglePin,
    hide: () => desktop.hide(),
    openOverlay: (o) => setOverlay(o),
    registerAppBar: () => {
      setAppBars((n) => n + 1);
      return () => setAppBars((n) => n - 1);
    },
  }), [settings?.pinned, settings?.toggleShortcut, togglePin]);

  useEffect(() => {
    document.documentElement.classList.add("desktop", "desktop-panel");
    // Electron kennt kein window.prompt → eigenes Eingabefenster
    window.prompt = (message, defaultValue) => desktop.prompt(message, defaultValue);

    desktop.getSettings().then(setSettings);
    desktop.getPanelState().then((s) => setVisible(!!s?.visible));
    const offs = [
      desktop.onSettings(setSettings),
      desktop.onPanelState((s) => {
        setVisible(!!s?.visible);
        if (!s?.visible) setLeavingMs(0);
      }),
      desktop.onLeaving((ms) => {
        setLeavingMs(ms || 0);
        setLeavingKey((k) => k + 1);
      }),
      desktop.onCommand((cmd) => {
        if (OVERLAYS.includes(cmd?.type)) setOverlay(cmd.type);
        else sendAppCommand(cmd);
      }),
    ];
    // Aus der App heraus (z. B. Profilmenü) Overlays öffnen
    const onAppCommand = (e) => { if (OVERLAYS.includes(e.detail?.type)) setOverlay(e.detail.type); };
    window.addEventListener("my2do:command", onAppCommand);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("my2do:command", onAppCommand);
    };
  }, []);

  // Tastenkürzel im Panel. Auf window (Bubble-Phase) registriert, damit der
  // 2do-Editor Esc vorher selbst abfangen kann (preventDefault).
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const editorOpen = !!document.querySelector("[data-my2do-modal]");
      if (e.key === "Escape") {
        if (overlayRef.current) setOverlay(null);
        else desktop.hide();
        e.preventDefault();
      } else if (e.key === "F1" || (mod && e.key === "/")) {
        e.preventDefault();
        setOverlay((o) => (o === "help" ? null : "help"));
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setOverlay((o) => (o === "settings" ? null : "settings"));
      } else if (mod && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        togglePin();
      } else if (mod && !e.altKey && !editorOpen && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOverlay(null);
        sendAppCommand({ type: "quick-add" });
      } else if (mod && !e.altKey && !editorOpen && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOverlay(null);
        sendAppCommand({ type: "search" });
      } else if (mod && !e.altKey && !editorOpen && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        setOverlay(null);
        sendAppCommand({ type: "tab", index: Number(e.code.slice(5)) - 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePin]);

  // Breite per Ziehen am linken Rand (Bildschirmkoordinaten → Hauptprozess)
  const onGripDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
    desktop.hold(true);
  };
  const onGripMove = (e) => {
    if (!resizing) return;
    desktop.resize(e.screenX);
  };
  const onGripUp = (e) => {
    if (!resizing) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setResizing(false);
    desktop.hold(false);
    desktop.resizeEnd();
  };

  return (
    <PanelContext.Provider value={panel}>
      <div className={`dp-frame ${visible ? "dp-in" : "dp-out"} ${resizing ? "dp-resizing" : ""}`}>
        <div className="dp-scroll">{children}</div>

        {/* Ohne Kopfleiste (z. B. Anmeldung): kleine schwebende Steuerung */}
        {appBars === 0 && (
          <div className="dp-floating-controls glass-strong">
            <button className="btn-icon btn-icon-sm" title="Desktop-Einstellungen (Strg+,)" onClick={() => setOverlay("settings")}><SlidersIcon /></button>
            <button className="btn-icon btn-icon-sm" title="Einfahren (Esc)" onClick={() => desktop.hide()}><CollapseIcon /></button>
          </div>
        )}

        {/* Countdown bis zum automatischen Einfahren */}
        {leavingMs > 0 && (
          <span key={leavingKey} className="dp-leaving" style={{ animationDuration: `${leavingMs}ms` }} />
        )}

        {/* Breite ändern */}
        <div className="dp-grip" title="Ziehen, um die Breite zu ändern"
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp} />

        {settings && overlay === "settings" && <SettingsOverlay settings={settings} onClose={() => setOverlay(null)} />}
        {settings && overlay === "help" && <HelpOverlay settings={settings} onClose={() => setOverlay(null)} />}
        {settings && overlay === "welcome" && (
          <WelcomeOverlay settings={settings} onClose={() => setOverlay(null)} onSettings={() => setOverlay("settings")} />
        )}
      </div>
    </PanelContext.Provider>
  );
}

export default function DesktopShell({ children }) {
  return windowKind === "detached"
    ? <DesktopWindowShell>{children}</DesktopWindowShell>
    : <DesktopPanelShell>{children}</DesktopPanelShell>;
}
