import React, { useEffect, useRef, useState } from "react";
import { desktop, acceleratorKeys, acceleratorFromEvent } from "@/lib/desktop";

// Desktop-Einstellungen als normale Seite (Tastenkürzel, Infobereich,
// Autostart, Erinnerungen) plus Übersicht aller Tastenkürzel.

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
export function Toggle({ checked, onChange, label, hint }) {
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

export function ShortcutRecorder({ label, value, defaultValue, error, onChange }) {
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
    <section className="dt-card">
      <h3 className="section-label mb-0.5">{title}</h3>
      <div className="divide-y divide-slate-200/60">{children}</div>
    </section>
  );
}

function ShortcutRows({ rows }) {
  return rows.map(([keys, label]) => (
    <div key={label} className="flex items-center gap-3 py-2">
      <span className="flex-1 text-[13px] text-slate-700">{label}</span>
      {typeof keys === "string" ? <Keys accelerator={keys} small /> : <Keys keys={keys} small />}
    </div>
  ));
}

export default function DesktopSettings() {
  const [settings, setSettings] = useState(null);
  const [errors, setErrors] = useState({});
  const [info, setInfo] = useState(null);

  useEffect(() => {
    desktop.getSettings().then(setSettings);
    desktop.getInfo().then(setInfo).catch(() => {});
    return desktop.onSettings(setSettings);
  }, []);

  if (!settings) return null;

  const patch = async (p) => {
    const res = await desktop.setSettings(p);
    if (res?.settings) setSettings(res.settings);
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(p).forEach((k) => { delete next[k]; });
      return { ...next, ...(res?.errors || {}) };
    });
  };

  const d = settings.defaults || {};
  const shortcutError = (key) => errors[key] || settings.shortcutErrors?.[key];

  return (
    <div className="grid gap-4 xl:grid-cols-2 items-start">
      <div className="space-y-4">
        <Section title="Tastenkürzel (überall in Windows)">
          <ShortcutRecorder label="2Do zeigen / verstecken" value={settings.toggleShortcut}
            defaultValue={d.toggleShortcut} error={shortcutError("toggleShortcut")}
            onChange={(v) => patch({ toggleShortcut: v })} />
          <ShortcutRecorder label="Neues 2do erfassen" value={settings.quickAddShortcut}
            defaultValue={d.quickAddShortcut} error={shortcutError("quickAddShortcut")}
            onChange={(v) => patch({ quickAddShortcut: v })} />
        </Section>

        <Section title="Fenster & Infobereich">
          <Toggle label="Beim Minimieren in den Infobereich"
            hint="2Do verschwindet aus der Taskleiste und wartet rechts unten im Infobereich. Ein Klick aufs Symbol holt es zurück."
            checked={settings.minimizeToTray} onChange={(v) => patch({ minimizeToTray: v })} />
          <Toggle label="Beim Schließen in den Infobereich"
            hint="Das X beendet 2Do nicht, sondern legt es in den Infobereich. Beenden über das Symbol (Rechtsklick)."
            checked={settings.closeToTray} onChange={(v) => patch({ closeToTray: v })} />
          <Toggle label="Mit Windows starten" hint="2Do startet unsichtbar im Infobereich."
            checked={settings.autostart} onChange={(v) => patch({ autostart: v })} />
          <Toggle label="Erinnerungen" hint="Windows-Hinweis bei fälligen Wiedervorlagen und 15 Minuten vor einer Deadline."
            checked={settings.reminders} onChange={(v) => patch({ reminders: v })} />
          <div className="py-2.5 flex items-center gap-2">
            <span className="flex-1 text-[11px] text-slate-400">
              2Do Desktop {info?.version ? `v${info.version}` : ""}{info?.portable ? " · Portable" : ""}
            </span>
            <button type="button" onClick={() => desktop.toTray()}
              className="text-[12px] font-semibold text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-100">
              In den Infobereich
            </button>
            <button type="button" onClick={() => desktop.quit()}
              className="text-[12px] font-semibold text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50">
              2Do beenden
            </button>
          </div>
        </Section>
      </div>

      <Section title="Tastenkürzel in 2Do">
        <ShortcutRows rows={[
          [settings.toggleShortcut, "2Do zeigen / verstecken (überall)"],
          [settings.quickAddShortcut, "Neues 2do (überall)"],
          [["Strg", "N"], "Neues 2do"],
          [["Strg", "F"], "Suchen"],
          [["Strg", "1 … 5"], "Bereich wechseln"],
          [["↑", "↓"], "In der Liste bewegen"],
          [["Eingabe"], "2do bearbeiten"],
          [["Leertaste"], "Erledigt / offen"],
          [["Entf"], "Löschen"],
          [["Strg", "Umschalt", "Eingabe"], "In eigenem Fenster öffnen"],
          [["Esc"], "Bearbeiten beenden"],
          [["Strg", "S"], "Sofort speichern"],
          [["Strg", "T"], "Zeitmarke einfügen"],
          [["Strg", "W"], "Eigenes Fenster schließen"],
        ]} />
      </Section>
    </div>
  );
}
