// ════════════════════════════════════════════════════════════════════════════
//  2Do Desktop – Windows-App
//
//  Die Web-App (../src, gebaut nach app-dist/) läuft in einem normalen
//  Windows-Fenster (Windows 11: Mica-Hintergrund, native Fensterknöpfe):
//   • Minimieren und Schließen schicken 2Do in den Infobereich der Taskleiste
//     (rechts unten, einstellbar) – ein Klick aufs Symbol holt es zurück
//   • Tastenkürzel (einstellbar) zeigt/versteckt 2Do bzw. legt ein 2do an
//   • 2dos und Notizen lassen sich zusätzlich in eigenen Fenstern öffnen
// ════════════════════════════════════════════════════════════════════════════
"use strict";

const {
  app, BrowserWindow, globalShortcut, screen, Tray, Menu, ipcMain,
  nativeImage, shell, protocol, session, Notification, nativeTheme,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const APP_ID = "de.my2do.desktop";
const DIST = path.join(__dirname, "app-dist");
const ASSETS = path.join(__dirname, "assets");
const TITLEBAR_HEIGHT = 48;   // muss zur Titelleiste der App passen (.dt-titlebar)

const DEFAULTS = {
  toggleShortcut: "Control+Alt+Space",
  quickAddShortcut: "Control+Alt+N",
  minimizeToTray: true,   // Minimieren → Infobereich statt Taskleiste
  closeToTray: true,      // Schließen (X) → Infobereich statt Beenden
  autostart: false,
  reminders: true,
  trayHintShown: false,
};

let win = null;
let tray = null;
let quitting = false;
let settings = { ...DEFAULTS };
let shortcutErrors = {};
let shortcutsSuspended = false;
let lastBlur = 0;

// ── Einstellungen ───────────────────────────────────────────────────────────
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    settings = sanitize({ ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) });
  } catch {
    settings = { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Einstellungen speichern fehlgeschlagen:", err);
  }
}

// Nur bekannte Einstellungen behalten (Reste der früheren Seitenleiste fallen weg)
function sanitize(s) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) out[key] = s[key] ?? DEFAULTS[key];
  ["toggleShortcut", "quickAddShortcut"].forEach((k) => {
    if (typeof out[k] !== "string") out[k] = DEFAULTS[k];
  });
  ["minimizeToTray", "closeToTray", "autostart", "reminders", "trayHintShown"].forEach((k) => { out[k] = !!out[k]; });
  if (s.mainWindow) out.mainWindow = s.mainWindow;
  if (s.windowBounds) out.windowBounds = s.windowBounds;
  return out;
}

const publicSettings = () => ({
  ...settings,
  shortcutErrors,
  defaults: DEFAULTS,
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
});

function broadcastSettings() {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("settings:changed", publicSettings()));
  updateTrayMenu();
}

// ── Lokale Dateien über app:// ausliefern ───────────────────────────────────
// Eigenes, "sicheres" Schema statt file://: stabiler Origin für IndexedDB
// (Login + Offline-Cache von Firestore bleiben erhalten), Module laden sauber.
protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
}]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    let ok = file.startsWith(DIST);
    try { ok = ok && fs.statSync(file).isFile(); } catch { ok = false; }
    // Unbekannte Pfade → index.html (HashRouter)
    if (!ok) file = path.join(DIST, "index.html");
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" },
      });
    } catch {
      return new Response("Nicht gefunden", { status: 404 });
    }
  });
}

// ── Fenster ─────────────────────────────────────────────────────────────────
// Links (E-Mail, Web) im Standardprogramm öffnen, nie in der App
function guardNavigation(wc) {
  const openExternal = (url) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  };
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) {
      e.preventDefault();
      openExternal(url);
    }
  });
}

const send = (channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};

// Mica-Hintergrund gibt es ab Windows 11 22H2 (Build 22621)
const supportsMica = () =>
  process.platform === "win32" && Number((process.getSystemVersion() || "").split(".")[2] || 0) >= 22621;

const isOnScreen = (b) => !!b && screen.getAllDisplays().some((d) =>
  b.x >= d.workArea.x - 50 && b.y >= d.workArea.y - 50 &&
  b.x < d.workArea.x + d.workArea.width - 100 && b.y < d.workArea.y + d.workArea.height - 100);

function windowOptions({ width, height, x, y, minWidth, minHeight, kind }) {
  const mica = supportsMica();
  return {
    width, height, ...(x !== undefined ? { x, y } : {}),
    minWidth, minHeight,
    show: false,
    title: "2Do",
    icon: path.join(ASSETS, "icon.png"),
    backgroundColor: mica ? "#00000000" : "#f4f6fb",
    ...(mica ? { backgroundMaterial: "mica" } : {}),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#334155", height: TITLEBAR_HEIGHT },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // Versteckt im Infobereich: Chromium drosselt Timer und stoppt das
      // Rendern → praktisch keine CPU im Hintergrund
      backgroundThrottling: true,
      additionalArguments: [`--my2do-window=${kind}`, ...(mica ? ["--my2do-mica"] : [])],
    },
  };
}

function createMainWindow(startHidden) {
  const saved = settings.mainWindow;
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1360, wa.width - 80);
  const height = Math.min(880, wa.height - 60);
  const bounds = isOnScreen(saved)
    ? { width: saved.width, height: saved.height, x: saved.x, y: saved.y }
    : { width, height, x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2) };

  win = new BrowserWindow(windowOptions({ ...bounds, minWidth: 760, minHeight: 520, kind: "main" }));
  win.loadURL("app://my2do/index.html");
  guardNavigation(win.webContents);

  win.once("ready-to-show", () => {
    if (startHidden) return;
    if (saved?.maximized) win.maximize();
    win.show();
    win.focus();
  });

  // Minimieren → in den Infobereich (statt in die Taskleiste)
  win.on("minimize", () => {
    if (settings.minimizeToTray) hideToTray();
  });

  // Schließen (X, Alt+F4) → in den Infobereich; beendet wird über das Menü
  win.on("close", (e) => {
    saveWindowState();
    if (quitting) return;
    if (settings.closeToTray) {
      e.preventDefault();
      hideToTray();
    } else {
      quitting = true;
      app.quit();
    }
  });

  win.on("blur", () => { lastBlur = Date.now(); });
  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 600);
  };
  win.on("resize", queueSave);
  win.on("move", queueSave);
  win.on("maximize", queueSave);
  win.on("unmaximize", queueSave);
}

function saveWindowState() {
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
  const b = win.getNormalBounds();
  settings.mainWindow = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
  saveSettings();
}

function hideToTray() {
  if (!win || win.isDestroyed()) return;
  saveWindowState();
  win.hide();
  // Einmalig erklären, wo 2Do geblieben ist
  if (!settings.trayHintShown && tray) {
    settings.trayHintShown = true;
    saveSettings();
    tray.displayBalloon({
      title: "2Do läuft weiter",
      content: "2Do ist jetzt hier im Infobereich. Ein Klick aufs Symbol öffnet es wieder.",
      iconType: "custom",
      icon: nativeImage.createFromPath(path.join(ASSETS, "icon.png")),
    });
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

// Sichtbar und gerade benutzt → verstecken, sonst zeigen. Ein Klick aufs
// Tray-Symbol nimmt dem Fenster den Fokus kurz vorher weg – daher lastBlur.
function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  const active = win.isVisible() && !win.isMinimized() && (win.isFocused() || Date.now() - lastBlur < 400);
  if (active) hideToTray();
  else showWindow();
}

function quickAdd() {
  showWindow();
  send("app:command", { type: "quick-add" });
}

function openCommand(type) {
  showWindow();
  send("app:command", { type });
}

// ── Eigene Fenster für 2dos & Notizen ───────────────────────────────────────
const detached = new Map();  // Route → BrowserWindow

function openDetached({ route, kind, title }) {
  if (typeof route !== "string" || !/^\/(todo|note)\/[\w/-]+$/.test(route)) return;
  if (kind !== "todo" && kind !== "note") return;
  const existing = detached.get(route);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const saved = settings.windowBounds?.[kind];
  const w = new BrowserWindow(windowOptions({
    width: saved?.width || (kind === "note" ? 980 : 1100),
    height: saved?.height || 780,
    ...(isOnScreen(saved) ? { x: saved.x, y: saved.y } : {}),
    minWidth: 520,
    minHeight: 420,
    kind: "detached",
  }));
  if (typeof title === "string" && title) w.setTitle(title.slice(0, 200));
  guardNavigation(w.webContents);
  w.loadURL(`app://my2do/index.html#${route}`);
  w.once("ready-to-show", () => { w.show(); w.focus(); });
  w.on("close", () => {
    if (w.isMaximized() || w.isMinimized()) return;
    settings.windowBounds = { ...(settings.windowBounds || {}), [kind]: w.getBounds() };
    saveSettings();
  });
  w.on("closed", () => detached.delete(route));
  detached.set(route, w);
}

// ── Tastenkürzel ────────────────────────────────────────────────────────────
const KEY_NAMES = { Control: "Strg", Alt: "Alt", Shift: "Umschalt", Super: "Win", Space: "Leertaste", Up: "↑", Down: "↓", Left: "←", Right: "→" };
const prettyAccel = (acc) => (acc || "").split("+").map((k) => KEY_NAMES[k] || k).join("+");

function registerShortcuts() {
  globalShortcut.unregisterAll();
  shortcutErrors = {};
  if (shortcutsSuspended) return shortcutErrors;
  const actions = { toggleShortcut: toggleWindow, quickAddShortcut: quickAdd };
  for (const [key, fn] of Object.entries(actions)) {
    const acc = settings[key];
    if (!acc) continue;
    let ok = false;
    try { ok = globalShortcut.register(acc, fn); } catch { ok = false; }
    if (!ok) shortcutErrors[key] = `„${prettyAccel(acc)}" ist bereits von einem anderen Programm belegt oder ungültig.`;
  }
  return shortcutErrors;
}

// ── Autostart ───────────────────────────────────────────────────────────────
function applyAutostart() {
  if (process.platform !== "win32") return;
  // Portable-Version entpackt sich in einen Temp-Ordner – dort nicht eintragen
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: !!settings.autostart, path: exe, args: ["--hidden"] });
}

// ── Infobereich (Tray) ──────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;
  const toggle = settings.toggleShortcut ? prettyAccel(settings.toggleShortcut) : "";
  const quick = settings.quickAddShortcut ? prettyAccel(settings.quickAddShortcut) : "";
  tray.setToolTip(`2Do${toggle ? ` – ${toggle}` : ""}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `2Do öffnen${toggle ? `\t${toggle}` : ""}`, click: showWindow },
    { label: `Neues 2do${quick ? `\t${quick}` : ""}`, click: quickAdd },
    { type: "separator" },
    { label: "Beim Minimieren in den Infobereich", type: "checkbox", checked: settings.minimizeToTray, click: (i) => applyPatch({ minimizeToTray: i.checked }) },
    { label: "Beim Schließen in den Infobereich", type: "checkbox", checked: settings.closeToTray, click: (i) => applyPatch({ closeToTray: i.checked }) },
    { label: "Mit Windows starten", type: "checkbox", checked: settings.autostart, click: (i) => applyPatch({ autostart: i.checked }) },
    { label: "Erinnerungen", type: "checkbox", checked: settings.reminders, click: (i) => applyPatch({ reminders: i.checked }) },
    { type: "separator" },
    { label: "Einstellungen …", click: () => openCommand("settings") },
    { type: "separator" },
    { label: "2Do beenden", click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, "tray.png")));
  tray.on("click", toggleWindow);
  tray.on("balloon-click", () => {
    showWindow();
    if (pendingBalloonTodo) send("app:command", { type: "open-todo", id: pendingBalloonTodo });
    pendingBalloonTodo = null;
  });
  updateTrayMenu();
}

// ── Erinnerungen (Deadline / Wiedervorlage) ─────────────────────────────────
let pendingBalloonTodo = null;

function notify({ title, body, todoId }) {
  const open = () => {
    showWindow();
    if (todoId) send("app:command", { type: "open-todo", id: todoId });
  };
  // Toasts brauchen eine registrierte App-ID (Startmenü-Verknüpfung des
  // Installers). Die Portable-Version nutzt daher die Tray-Sprechblase.
  if (!process.env.PORTABLE_EXECUTABLE_FILE && Notification.isSupported()) {
    const n = new Notification({ title, body, icon: path.join(ASSETS, "icon.png"), silent: false });
    n.on("click", open);
    n.show();
  } else if (tray) {
    pendingBalloonTodo = todoId || null;
    tray.displayBalloon({ title, content: body, iconType: "custom", icon: nativeImage.createFromPath(path.join(ASSETS, "icon.png")) });
  }
}

// ── Eingabe-Dialog (window.prompt gibt es in Electron nicht) ────────────────
ipcMain.on("dialog:prompt", (event, { message, defaultValue }) => {
  const parent = BrowserWindow.fromWebContents(event.sender) || win;
  const pb = parent.getBounds();
  const w = 400;
  const h = 210;
  const pw = new BrowserWindow({
    parent, modal: true, width: w, height: h,
    x: Math.round(pb.x + (pb.width - w) / 2), y: Math.round(pb.y + pb.height / 3),
    frame: false, transparent: true, backgroundColor: "#00000000", resizable: false,
    show: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "prompt-preload.js"), contextIsolation: true, sandbox: true },
  });
  let answered = false;
  const finish = (value) => {
    if (answered) return;
    answered = true;
    ipcMain.removeListener("prompt:answer", onAnswer);
    event.returnValue = value;
    if (!pw.isDestroyed()) pw.destroy();
  };
  const onAnswer = (e, value) => { if (e.sender === pw.webContents) finish(value); };
  ipcMain.on("prompt:answer", onAnswer);
  pw.on("closed", () => finish(null));
  pw.once("ready-to-show", () => { pw.show(); pw.focus(); });
  pw.loadFile(path.join(__dirname, "prompt.html"), { query: { message: message || "", value: defaultValue || "" } });
});

// ── IPC ─────────────────────────────────────────────────────────────────────
function applyPatch(patch) {
  const prev = { ...settings };
  const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => k in DEFAULTS));
  settings = sanitize({ ...settings, ...allowed });
  const errors = {};

  if ("toggleShortcut" in allowed || "quickAddShortcut" in allowed) {
    if (settings.toggleShortcut && settings.toggleShortcut === settings.quickAddShortcut) {
      const key = "toggleShortcut" in allowed ? "toggleShortcut" : "quickAddShortcut";
      errors[key] = "Beide Tastenkürzel sind gleich – bitte ein anderes wählen.";
      settings[key] = prev[key];
    }
    registerShortcuts();
    // Nicht registrierbares neues Kürzel → altes behalten
    let reverted = false;
    for (const key of ["toggleShortcut", "quickAddShortcut"]) {
      if (key in allowed && shortcutErrors[key] && settings[key] !== prev[key]) {
        errors[key] = shortcutErrors[key];
        settings[key] = prev[key];
        reverted = true;
      }
    }
    if (reverted) registerShortcuts();
  }
  if ("autostart" in allowed) applyAutostart();

  saveSettings();
  broadcastSettings();
  return { settings: publicSettings(), errors };
}

ipcMain.handle("settings:get", () => publicSettings());
ipcMain.handle("settings:set", (_e, patch) => applyPatch(patch || {}));
ipcMain.handle("app:info", () => ({ version: app.getVersion(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE }));
ipcMain.handle("window:open", (_e, opts) => openDetached(opts || {}));

ipcMain.on("shortcuts:suspend", (_e, on) => {
  shortcutsSuspended = !!on;
  registerShortcuts();
  if (!on) broadcastSettings();
});

ipcMain.on("app:notify", (_e, n) => { if (settings.reminders && n?.title) notify(n); });
ipcMain.on("app:to-tray", () => hideToTray());
ipcMain.on("app:quit", () => { quitting = true; app.quit(); });

// ── Start ───────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  // Zweiter Start (z. B. Doppelklick auf die exe) → Fenster zeigen
  app.on("second-instance", () => showWindow());

  app.whenReady().then(() => {
    // Die Oberfläche ist hell gestaltet – auch bei dunklem Windows-Design die
    // Fenster hell darstellen (sonst wird der Mica-Hintergrund dunkel und die
    // Schrift in Seitenleiste/Titelleiste unlesbar)
    nativeTheme.themeSource = "light";
    loadSettings();
    registerAppProtocol();
    session.defaultSession.setSpellCheckerLanguages(["de-DE"]);

    // Downloads: .ics direkt im Kalender öffnen, alles andere nach "Downloads"
    session.defaultSession.on("will-download", (_e, item) => {
      const name = item.getFilename();
      if (/\.ics$/i.test(name)) {
        item.setSavePath(path.join(app.getPath("temp"), name));
      } else {
        item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), name) });
      }
      item.once("done", (_ev, result) => {
        if (result === "completed" && /\.ics$/i.test(name)) shell.openPath(item.getSavePath());
      });
    });

    const startHidden = process.argv.includes("--hidden");
    createMainWindow(startHidden);
    createTray();
    registerShortcuts();
    if (settings.autostart) applyAutostart();

    win.webContents.once("did-finish-load", () => {
      const failed = Object.values(shortcutErrors);
      if (failed.length) notify({ title: "2Do – Tastenkürzel belegt", body: `${failed[0]} Bitte in den 2Do-Einstellungen ein anderes wählen.` });
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    saveWindowState();
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // Läuft im Infobereich weiter, auch ohne sichtbares Fenster
  app.on("window-all-closed", () => {});
}
