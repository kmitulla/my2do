// Brücke zwischen Web-App und Desktop-Hülle (contextIsolation: nur diese
// Funktionen sind in der App als window.my2doDesktop sichtbar)
const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel) => (cb) => {
  const handler = (_e, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// "main" = Hauptfenster, "detached" = eigenes Fenster für ein 2do / eine Notiz
const windowKind = process.argv.includes("--my2do-window=detached") ? "detached" : "main";

contextBridge.exposeInMainWorld("my2doDesktop", {
  windowKind,
  mica: process.argv.includes("--my2do-mica"),
  openWindow: (opts) => ipcRenderer.invoke("window:open", opts),
  getInfo: () => ipcRenderer.invoke("app:info"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  onSettings: listen("settings:changed"),
  onCommand: listen("app:command"),
  suspendShortcuts: (on) => ipcRenderer.send("shortcuts:suspend", !!on),
  notify: (n) => ipcRenderer.send("app:notify", n),
  toTray: () => ipcRenderer.send("app:to-tray"),
  quit: () => ipcRenderer.send("app:quit"),
  // Ersatz für window.prompt (in Electron nicht verfügbar) – blockiert wie das Original
  prompt: (message, defaultValue) => ipcRenderer.sendSync("dialog:prompt", {
    message: message == null ? "" : String(message),
    defaultValue: defaultValue == null ? "" : String(defaultValue),
  }),
});
