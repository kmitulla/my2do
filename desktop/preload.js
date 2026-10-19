// Brücke zwischen Web-App und Desktop-Hülle (contextIsolation: nur diese
// Funktionen sind in der App als window.my2doDesktop sichtbar)
const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel) => (cb) => {
  const handler = (_e, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// "panel" = Seitenleiste, "detached" = eigenes Fenster für ein 2do / eine Notiz
const windowKind = process.argv.includes("--my2do-window=detached") ? "detached" : "panel";

contextBridge.exposeInMainWorld("my2doDesktop", {
  windowKind,
  mica: process.argv.includes("--my2do-mica"),
  openWindow: (opts) => ipcRenderer.invoke("window:open", opts),
  getInfo: () => ipcRenderer.invoke("app:info"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getPanelState: () => ipcRenderer.invoke("panel:get-state"),
  onSettings: listen("settings:changed"),
  onPanelState: listen("panel:state"),
  onLeaving: listen("panel:leaving"),
  onCommand: listen("app:command"),
  hide: () => ipcRenderer.send("panel:hide"),
  hold: (on) => ipcRenderer.send("panel:hold", !!on),
  resize: (screenX) => ipcRenderer.send("panel:resize", screenX),
  resizeEnd: () => ipcRenderer.send("panel:resize-end"),
  suspendShortcuts: (on) => ipcRenderer.send("shortcuts:suspend", !!on),
  notify: (n) => ipcRenderer.send("app:notify", n),
  quit: () => ipcRenderer.send("app:quit"),
  // Ersatz für window.prompt (in Electron nicht verfügbar) – blockiert wie das Original
  prompt: (message, defaultValue) => ipcRenderer.sendSync("dialog:prompt", {
    message: message == null ? "" : String(message),
    defaultValue: defaultValue == null ? "" : String(defaultValue),
  }),
});

// Datei-Auswahl (z. B. E-Mail importieren): Panel nicht einfahren, solange
// der Windows-Dialog offen ist
if (windowKind === "panel") {
  window.addEventListener("click", (e) => {
    const el = e.target;
    if (el && el.tagName === "INPUT" && el.type === "file") ipcRenderer.send("panel:hold-until-focus");
  }, true);
}
