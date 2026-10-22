// ════════════════════════════════════════════════════════════════════════════
//  2Do Desktop – Seitenleiste für Windows 11
//
//  Die Web-App (../src, gebaut nach app-dist/) läuft in einem rahmenlosen,
//  transparenten Fenster am rechten Bildschirmrand:
//   • Tastenkürzel (einstellbar) fährt das Panel auf dem Bildschirm aus, auf
//     dem gerade der Mauszeiger ist – nochmal drücken fährt es wieder ein
//   • Maus an den rechten Rand (im Bereich des dezenten Griffs) → Panel
//     fährt aus
//   • Panel bleibt, solange die Maus drin/drauf ist; danach fährt es nach
//     einstellbarer Zeit (Standard 3 s) wieder ein – außer es ist angeheftet
//   • 2dos und Notizen lassen sich zusätzlich in eigenen Fenstern öffnen
// ════════════════════════════════════════════════════════════════════════════
"use strict";

const {
  app, BaseWindow, BrowserWindow, globalShortcut, screen, Tray, Menu, ipcMain,
  nativeImage, shell, protocol, session, Notification,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const APP_ID = "de.my2do.desktop";
const DIST = path.join(__dirname, "app-dist");
const ASSETS = path.join(__dirname, "assets");

const ANIM_MS = 300;        // Dauer der Ein-/Ausfahr-Animation (muss zur CSS passen)
const POLL_MS = 80;         // Mausposition abfragen (GetCursorPos, sehr billig)
const EDGE_PX = 2;          // Breite der Auslöse-Zone am rechten Rand
const MIN_WIDTH = 360;
const MAX_WIDTH = 900;
// Transparenter Rand um das schwebende Panel (Schatten links, Abstand rechts) –
// muss zu .dp-frame in src/index.css passen
const FRAME_LEFT = 18;
const FRAME_RIGHT = 10;
const FRAME_GAP = FRAME_LEFT + FRAME_RIGHT;
// Griff am Rand: schmale Leiste, Auslöse-Zone ragt etwas darüber hinaus
const HANDLE_W = 4;
const HANDLE_W_HOT = 6;
const HANDLE_TOLERANCE = 48;   // "grob im Bereich": so viel ober-/unterhalb zählt mit
const HANDLE_NEAR_PX = 90;     // ab dieser Nähe zum Rand leuchtet der Griff auf

const DEFAULTS = {
  toggleShortcut: "Control+Alt+Space",
  quickAddShortcut: "Control+Alt+N",
  autoHideSec: 3,
  edgeReveal: true,
  edgeAllDisplays: false,
  edgeDelayMs: 250,
  edgeHandle: true,     // dezenten Griff am Rand zeigen
  handlePos: 50,        // Mitte des Griffs in % der Bildschirmhöhe
  handleSize: 34,       // Länge des Griffs in % der Bildschirmhöhe
  width: 460,
  pinned: false,
  autostart: false,
  reminders: true,
  firstRunDone: false,
};

let win = null;
let tray = null;
let quitting = false;
let settings = { ...DEFAULTS };
let shortcutErrors = {};
let shortcutsSuspended = false;

// Panel-Zustand: hidden | showing | shown | hiding
let state = "hidden";
let stateTimer = null;
let activeDisplayId = null;
let openedBy = null;        // "shortcut" | "edge" | "tray"
let entered = false;        // Maus war seit dem Ausfahren schon im Panel
let edgeSince = 0;
let leaveTimer = null;
let holdCount = 0;          // > 0: nicht automatisch einfahren (Dialoge, Resize …)
let holdUntilFocus = false; // Datei-Dialog offen
// Selbst eingefahren (Knopf, Esc, Tastenkürzel, eigenes Fenster): nicht sofort
// wieder ausfahren, nur weil die Maus noch im Panel bzw. am Rand steht
let hideReason = null;      // "auto" | "manual"
let edgeArmed = true;       // Rand-Auslöser erst wieder scharf, wenn die Maus den Rand verlassen hat

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

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function sanitize(s) {
  return {
    ...s,
    autoHideSec: clamp(Number(s.autoHideSec) || DEFAULTS.autoHideSec, 1, 30),
    edgeDelayMs: clamp(Number(s.edgeDelayMs) || 0, 0, 2000),
    handlePos: clamp(Number(s.handlePos) || DEFAULTS.handlePos, 10, 90),
    handleSize: clamp(Number(s.handleSize) || DEFAULTS.handleSize, 12, 80),
    width: clamp(Math.round(Number(s.width) || DEFAULTS.width), MIN_WIDTH, MAX_WIDTH),
    toggleShortcut: typeof s.toggleShortcut === "string" ? s.toggleShortcut : DEFAULTS.toggleShortcut,
    quickAddShortcut: typeof s.quickAddShortcut === "string" ? s.quickAddShortcut : DEFAULTS.quickAddShortcut,
  };
}

const publicSettings = () => ({
  ...settings,
  shortcutErrors,
  defaults: DEFAULTS,
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
});

function broadcastSettings() {
  send("settings:changed", publicSettings());
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

const cursorDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

function activeDisplay() {
  return screen.getAllDisplays().find((d) => d.id === activeDisplayId) || screen.getPrimaryDisplay();
}

function boundsFor(display) {
  const wa = display.workArea;
  const width = clamp(settings.width, MIN_WIDTH, Math.min(MAX_WIDTH, wa.width - 80)) + FRAME_GAP;
  return { x: wa.x + wa.width - width, y: wa.y, width, height: wa.height };
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  activeDisplayId = display.id;
  win = new BrowserWindow({
    ...boundsFor(display),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "2Do",
    icon: path.join(ASSETS, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Eingefahren = verstecktes Fenster: Chromium drosselt dann Timer und
      // stoppt Animationen/Rendering → praktisch keine CPU im Hintergrund
      backgroundThrottling: true,
      spellcheck: true,
    },
  });
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.loadURL("app://my2do/index.html");
  guardNavigation(win.webContents);

  // Schließen (Alt+F4) fährt nur ein – beendet wird über das Tray-Menü
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      hidePanel();
    }
  });

  win.on("focus", () => {
    if (holdUntilFocus) holdUntilFocus = false;
  });
}

// ── Ein-/Ausfahren ──────────────────────────────────────────────────────────
function inHoverZone(p) {
  const b = win.getBounds();
  const d = activeDisplay();
  const right = Math.max(b.x + b.width, d.bounds.x + d.bounds.width);
  return p.x >= b.x - 1 && p.x <= right && p.y >= b.y - 1 && p.y <= b.y + b.height + 1;
}

function clearLeaveTimer() {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    send("panel:leaving", 0);
  }
}

function armLeaveTimer() {
  if (leaveTimer) return;
  const ms = settings.autoHideSec * 1000;
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    hidePanel("auto");
  }, ms);
  send("panel:leaving", ms);
}

function showPanel(display, by, { focus = false } = {}) {
  clearLeaveTimer();
  const moved = display.id !== activeDisplayId;
  activeDisplayId = display.id;
  openedBy = by;
  if (state === "shown" || state === "showing") {
    if (moved) win.setBounds(boundsFor(display));
    entered = inHoverZone(screen.getCursorScreenPoint());
    if (focus) win.focus();
    return;
  }
  win.setBounds(boundsFor(display));
  entered = false;
  state = "showing";
  syncHandles();
  if (focus) {
    win.show();
    win.focus();
  } else {
    win.showInactive();
  }
  send("panel:state", { visible: true, by });
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => { if (state === "showing") state = "shown"; }, ANIM_MS);
}

function hidePanel(reason = "manual") {
  if (state === "hidden" || state === "hiding") return;
  clearLeaveTimer();
  hideReason = reason;
  if (reason === "manual") edgeArmed = false;
  state = "hiding";
  send("panel:state", { visible: false });
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    if (state !== "hiding") return;
    state = "hidden";
    win.hide();
    syncHandles();
  }, ANIM_MS + 40);
}

const isOpen = () => state === "shown" || state === "showing";

function togglePanel() {
  const d = cursorDisplay();
  if (isOpen() && d.id === activeDisplayId) hidePanel();
  else showPanel(d, "shortcut", { focus: true });
}

function quickAdd() {
  showPanel(cursorDisplay(), "shortcut", { focus: true });
  send("app:command", { type: "quick-add" });
}

function openCommand(type) {
  showPanel(cursorDisplay(), "tray", { focus: true });
  send("app:command", { type });
}

// Mausposition auswerten: Rand-Auslöser (eingefahren) bzw. Auto-Einfahren
function poll() {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();

  if (state === "hidden") {
    if (!settings.edgeReveal) return;
    const d = screen.getDisplayNearestPoint(p);
    const allowed = settings.edgeAllDisplays || d.id === activeDisplayId;
    const range = handleRange(d);
    const inRange = p.y >= range.top - HANDLE_TOLERANCE && p.y <= range.bottom + HANDLE_TOLERANCE;
    const right = d.bounds.x + d.bounds.width;
    setHandlesHot(allowed && inRange && p.x >= right - HANDLE_NEAR_PX ? d.id : null);
    const onEdge = p.x >= right - EDGE_PX && inRange;
    if (!edgeArmed) {
      if (p.x < right - EDGE_PX) edgeArmed = true;
      return;
    }
    if (onEdge && allowed) {
      if (!edgeSince) edgeSince = Date.now();
      if (Date.now() - edgeSince >= settings.edgeDelayMs) {
        edgeSince = 0;
        showPanel(d, "edge");
      }
    } else {
      edgeSince = 0;
    }
    return;
  }

  const inside = inHoverZone(p);
  if (state === "hiding") {
    // Maus kommt während des automatischen Einfahrens zurück → wieder raus
    if (inside && hideReason === "auto") showPanel(activeDisplay(), "edge");
    return;
  }
  if (inside) {
    entered = true;
    clearLeaveTimer();
  } else if (!settings.pinned && holdCount === 0 && !holdUntilFocus && (entered || openedBy === "edge")) {
    armLeaveTimer();
  }
}

// ── Griff am Bildschirmrand ─────────────────────────────────────────────────
// Ein natives Fenster ohne Webinhalt (BaseWindow): kein eigener Renderer-
// Prozess, praktisch kein RAM. Klick-durchlässig, damit z. B. Scrollbalken
// darunter bedienbar bleiben.
const handles = new Map();  // displayId → BaseWindow
let hotDisplayId = null;

function handleRange(display) {
  const wa = display.workArea;
  const len = Math.round(clamp(wa.height * settings.handleSize / 100, 120, wa.height - 40));
  const center = wa.y + wa.height * settings.handlePos / 100;
  const top = Math.round(clamp(center - len / 2, wa.y + 12, wa.y + wa.height - len - 12));
  return { top, bottom: top + len };
}

function handleBounds(display, hot) {
  const { top, bottom } = handleRange(display);
  const w = hot ? HANDLE_W_HOT : HANDLE_W;
  return { x: display.bounds.x + display.bounds.width - w, y: top, width: w, height: bottom - top };
}

function styleHandle(h, hot) {
  h.setBackgroundColor(hot ? "#6366f1" : "#818cf8");
  h.setOpacity(hot ? 0.95 : 0.5);
}

function createHandle(display) {
  const h = new BaseWindow({
    ...handleBounds(display, false),
    show: false, frame: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, hasShadow: false, thickFrame: false, title: "2Do",
    backgroundColor: "#818cf8",
  });
  h.setIgnoreMouseEvents(true);
  h.setAlwaysOnTop(true, "pop-up-menu");
  styleHandle(h, false);
  return h;
}

// Griffe nur zeigen, solange das Panel eingefahren ist
function syncHandles() {
  if (state !== "hidden") hotDisplayId = null;
  const wanted = new Map();
  if (state === "hidden" && settings.edgeReveal && settings.edgeHandle) {
    const displays = settings.edgeAllDisplays ? screen.getAllDisplays() : [activeDisplay()];
    displays.forEach((d) => wanted.set(d.id, d));
  }
  for (const [id, h] of handles) {
    if (!wanted.has(id)) {
      if (!h.isDestroyed()) h.destroy();
      handles.delete(id);
    }
  }
  for (const [id, d] of wanted) {
    let h = handles.get(id);
    if (!h || h.isDestroyed()) {
      h = createHandle(d);
      handles.set(id, h);
    }
    styleHandle(h, id === hotDisplayId);
    h.setBounds(handleBounds(d, id === hotDisplayId));
    if (!h.isVisible()) h.showInactive();
  }
}

function setHandlesHot(displayId) {
  if (displayId === hotDisplayId) return;
  hotDisplayId = displayId;
  for (const [id, h] of handles) {
    if (h.isDestroyed()) continue;
    const d = screen.getAllDisplays().find((x) => x.id === id);
    if (!d) continue;
    styleHandle(h, id === displayId);
    h.setBounds(handleBounds(d, id === displayId));
  }
}

// ── Eigene Fenster für 2dos & Notizen ───────────────────────────────────────
const detached = new Map();  // Route → BrowserWindow

// Mica-Hintergrund gibt es ab Windows 11 22H2 (Build 22621)
const supportsMica = () =>
  process.platform === "win32" && Number((process.getSystemVersion() || "").split(".")[2] || 0) >= 22621;

function openDetached({ route, kind, title }) {
  if (typeof route !== "string" || !/^\/(todo|note)\/[\w/-]+$/.test(route)) return;
  const existing = detached.get(route);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const mica = supportsMica();
  const saved = settings.windowBounds?.[kind];
  const onScreen = saved && screen.getAllDisplays().some((d) =>
    saved.x >= d.workArea.x - 50 && saved.y >= d.workArea.y - 50 &&
    saved.x < d.workArea.x + d.workArea.width - 100 && saved.y < d.workArea.y + d.workArea.height - 100);
  const w = new BrowserWindow({
    width: saved?.width || (kind === "note" ? 980 : 1100),
    height: saved?.height || 780,
    ...(onScreen ? { x: saved.x, y: saved.y } : {}),
    minWidth: 520,
    minHeight: 420,
    show: false,
    title: title || "2Do",
    icon: path.join(ASSETS, "icon.png"),
    backgroundColor: mica ? "#00000000" : "#eef2ff",
    ...(mica ? { backgroundMaterial: "mica" } : {}),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#334155", height: 44 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: ["--my2do-window=detached", ...(mica ? ["--my2do-mica"] : [])],
    },
  });
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
  // Man arbeitet jetzt im Fenster weiter → Panel einfahren
  if (!settings.pinned) hidePanel();
}

// ── Tastenkürzel ────────────────────────────────────────────────────────────
const KEY_NAMES = { Control: "Strg", Alt: "Alt", Shift: "Umschalt", Super: "Win", Space: "Leertaste", Up: "↑", Down: "↓", Left: "←", Right: "→" };
const prettyAccel = (acc) => (acc || "").split("+").map((k) => KEY_NAMES[k] || k).join("+");

function registerShortcuts() {
  globalShortcut.unregisterAll();
  shortcutErrors = {};
  if (shortcutsSuspended) return shortcutErrors;
  const actions = { toggleShortcut: togglePanel, quickAddShortcut: quickAdd };
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

// ── Tray ────────────────────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;
  const toggle = settings.toggleShortcut ? prettyAccel(settings.toggleShortcut) : "";
  const quick = settings.quickAddShortcut ? prettyAccel(settings.quickAddShortcut) : "";
  tray.setToolTip(`2Do${toggle ? ` – ${toggle}` : ""}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `2Do öffnen${toggle ? `\t${toggle}` : ""}`, click: () => showPanel(cursorDisplay(), "tray", { focus: true }) },
    { label: `Neues 2do${quick ? `\t${quick}` : ""}`, click: quickAdd },
    { type: "separator" },
    { label: "Angeheftet (nicht automatisch einfahren)", type: "checkbox", checked: settings.pinned, click: (i) => applyPatch({ pinned: i.checked }) },
    { label: "Am rechten Bildschirmrand ausfahren", type: "checkbox", checked: settings.edgeReveal, click: (i) => applyPatch({ edgeReveal: i.checked }) },
    { label: "Griff am Rand zeigen", type: "checkbox", checked: settings.edgeHandle, enabled: settings.edgeReveal, click: (i) => applyPatch({ edgeHandle: i.checked }) },
    { label: "Mit Windows starten", type: "checkbox", checked: settings.autostart, click: (i) => applyPatch({ autostart: i.checked }) },
    { type: "separator" },
    { label: "Einstellungen …", click: () => openCommand("settings") },
    { label: "Tastenkürzel …", click: () => openCommand("help") },
    { type: "separator" },
    { label: "2Do beenden", click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, "tray.png")));
  tray.on("click", () => {
    if (isOpen()) hidePanel();
    else showPanel(cursorDisplay(), "tray", { focus: true });
  });
  tray.on("balloon-click", () => {
    if (pendingBalloonTodo) openTodo(pendingBalloonTodo);
  });
  updateTrayMenu();
}

// ── Erinnerungen (Deadline / Wiedervorlage) ─────────────────────────────────
let pendingBalloonTodo = null;

function openTodo(todoId) {
  showPanel(cursorDisplay(), "tray", { focus: true });
  if (todoId) send("app:command", { type: "open-todo", id: todoId });
}

function notify({ title, body, todoId }) {
  // Toasts brauchen eine registrierte App-ID (Startmenü-Verknüpfung des
  // Installers). Die Portable-Version nutzt daher die Tray-Sprechblase.
  if (!process.env.PORTABLE_EXECUTABLE_FILE && Notification.isSupported()) {
    const n = new Notification({ title, body, icon: path.join(ASSETS, "icon.png"), silent: false });
    n.on("click", () => openTodo(todoId));
    n.show();
  } else if (tray) {
    pendingBalloonTodo = todoId || null;
    tray.displayBalloon({ title, content: body, iconType: "custom", icon: nativeImage.createFromPath(path.join(ASSETS, "icon.png")) });
  }
}

// ── Eingabe-Dialog (window.prompt gibt es in Electron nicht) ────────────────
ipcMain.on("dialog:prompt", (event, { message, defaultValue }) => {
  holdCount++;
  const pb = win.getBounds();
  const w = 400;
  const h = 210;
  const pw = new BrowserWindow({
    parent: win, modal: true, width: w, height: h,
    x: Math.round(pb.x + (pb.width - w) / 2), y: Math.round(pb.y + pb.height / 3),
    frame: false, transparent: true, backgroundColor: "#00000000", resizable: false,
    show: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "prompt-preload.js"), contextIsolation: true, sandbox: true },
  });
  pw.setAlwaysOnTop(true, "pop-up-menu");
  let answered = false;
  const finish = (value) => {
    if (answered) return;
    answered = true;
    holdCount = Math.max(0, holdCount - 1);
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
  settings = sanitize({ ...settings, ...patch });
  const errors = {};

  if ("toggleShortcut" in patch || "quickAddShortcut" in patch) {
    if (settings.toggleShortcut && settings.toggleShortcut === settings.quickAddShortcut) {
      const key = "toggleShortcut" in patch ? "toggleShortcut" : "quickAddShortcut";
      errors[key] = "Beide Tastenkürzel sind gleich – bitte ein anderes wählen.";
      settings[key] = prev[key];
    }
    registerShortcuts();
    // Nicht registrierbares neues Kürzel → altes behalten
    let reverted = false;
    for (const key of ["toggleShortcut", "quickAddShortcut"]) {
      if (key in patch && shortcutErrors[key] && settings[key] !== prev[key]) {
        errors[key] = shortcutErrors[key];
        settings[key] = prev[key];
        reverted = true;
      }
    }
    if (reverted) registerShortcuts();
  }
  if ("autostart" in patch) applyAutostart();
  if ("pinned" in patch && settings.pinned) clearLeaveTimer();
  if ("width" in patch && isOpen()) win.setBounds(boundsFor(activeDisplay()));
  if (["edgeReveal", "edgeHandle", "edgeAllDisplays", "handlePos", "handleSize"].some((k) => k in patch)) syncHandles();

  saveSettings();
  broadcastSettings();
  return { settings: publicSettings(), errors };
}

ipcMain.handle("settings:get", () => publicSettings());
ipcMain.handle("settings:set", (_e, patch) => applyPatch(patch || {}));
ipcMain.handle("panel:get-state", () => ({ visible: isOpen() }));
ipcMain.handle("app:info", () => ({ version: app.getVersion(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE }));
ipcMain.handle("window:open", (_e, opts) => openDetached(opts || {}));

ipcMain.on("panel:hide", () => hidePanel());
ipcMain.on("panel:hold", (_e, on) => { holdCount = Math.max(0, holdCount + (on ? 1 : -1)); if (on) clearLeaveTimer(); });
ipcMain.on("panel:hold-until-focus", () => {
  holdUntilFocus = true;
  clearLeaveTimer();
  // Sicherheitsnetz, falls das Fenster den Fokus nie verliert
  setTimeout(() => { holdUntilFocus = false; }, 120000);
});

ipcMain.on("panel:resize", (_e, screenX) => {
  if (!isOpen()) return;
  const wa = activeDisplay().workArea;
  // screenX = neue linke Kante des sichtbaren Panels
  const width = clamp(Math.round(wa.x + wa.width - FRAME_RIGHT - screenX), MIN_WIDTH, Math.min(MAX_WIDTH, wa.width - 80));
  settings.width = width;
  win.setBounds(boundsFor(activeDisplay()));
});
ipcMain.on("panel:resize-end", () => {
  saveSettings();
  broadcastSettings();
});

ipcMain.on("shortcuts:suspend", (_e, on) => {
  shortcutsSuspended = !!on;
  registerShortcuts();
  if (!on) broadcastSettings();
});

ipcMain.on("app:notify", (_e, n) => { if (settings.reminders && n?.title) notify(n); });
ipcMain.on("app:quit", () => { quitting = true; app.quit(); });

// ── Start ───────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  // Zweiter Start (z. B. Doppelklick auf die exe) → Panel zeigen
  app.on("second-instance", () => {
    if (win) showPanel(cursorDisplay(), "shortcut", { focus: true });
  });

  app.whenReady().then(() => {
    loadSettings();
    registerAppProtocol();
    session.defaultSession.setSpellCheckerLanguages(["de-DE"]);

    // Downloads: .ics direkt im Kalender öffnen, alles andere nach "Downloads"
    session.defaultSession.on("will-download", (_e, item) => {
      const name = item.getFilename();
      holdCount++;
      if (/\.ics$/i.test(name)) {
        item.setSavePath(path.join(app.getPath("temp"), name));
      } else {
        item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), name) });
      }
      item.once("done", (_ev, result) => {
        holdCount = Math.max(0, holdCount - 1);
        if (result === "completed" && /\.ics$/i.test(name)) shell.openPath(item.getSavePath());
      });
    });

    createWindow();
    createTray();
    registerShortcuts();
    if (settings.autostart) applyAutostart();
    setInterval(poll, POLL_MS);

    const refit = () => {
      if (!screen.getAllDisplays().some((d) => d.id === activeDisplayId)) activeDisplayId = screen.getPrimaryDisplay().id;
      if (isOpen()) win.setBounds(boundsFor(activeDisplay()));
      syncHandles();
    };
    screen.on("display-removed", refit);
    screen.on("display-added", refit);
    screen.on("display-metrics-changed", refit);

    const startHidden = process.argv.includes("--hidden");
    syncHandles();
    win.webContents.once("did-finish-load", () => {
      if (!startHidden) showPanel(cursorDisplay(), "shortcut", { focus: true });
      if (!settings.firstRunDone) {
        send("app:command", { type: "welcome" });
        settings.firstRunDone = true;
        saveSettings();
      }
      const failed = Object.values(shortcutErrors);
      if (failed.length) notify({ title: "2Do – Tastenkürzel belegt", body: `${failed[0]} Bitte in den 2Do-Einstellungen ein anderes wählen.` });
    });
  });

  app.on("before-quit", () => { quitting = true; });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // Läuft im Tray weiter, auch ohne sichtbares Fenster
  app.on("window-all-closed", () => {});
}
