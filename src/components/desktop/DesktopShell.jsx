import { useEffect } from "react";
import { desktop, windowKind, sendAppCommand } from "@/lib/desktop";

// Hülle für die Windows-App: Klassen für das Desktop-Layout (Mica unter
// Windows 11), prompt()-Ersatz und Befehle aus dem Hauptprozess (Tray,
// globale Tastenkürzel, Erinnerungen) an die App weiterreichen.
export default function DesktopShell({ children }) {
  useEffect(() => {
    const cl = document.documentElement.classList;
    cl.add("desktop", windowKind === "detached" ? "desktop-window" : "desktop-main");
    if (desktop.mica) cl.add("mica");
    // Electron kennt kein window.prompt → eigenes Eingabefenster
    window.prompt = (message, defaultValue) => desktop.prompt(message, defaultValue);
    return desktop.onCommand((cmd) => sendAppCommand(cmd));
  }, []);
  return children;
}
