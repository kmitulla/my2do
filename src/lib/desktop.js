// Desktop-Hülle (Electron, siehe desktop/preload.js). Im Browser undefined.
export const desktop = typeof window !== "undefined" ? window.my2doDesktop : undefined;
export const isDesktop = !!desktop;

// Befehle an die App (Tastenkürzel, Tray, Erinnerungen) – Dashboard & Co.
// hören auf "my2do:command"
export const sendAppCommand = (detail) =>
  window.dispatchEvent(new CustomEvent("my2do:command", { detail }));

const KEY_NAMES = {
  Control: "Strg", Alt: "Alt", Shift: "Umschalt", Super: "Win", Space: "Leertaste",
  Up: "↑", Down: "↓", Left: "←", Right: "→", Enter: "Eingabe", Backspace: "Rücktaste",
  Delete: "Entf", Insert: "Einfg", PageUp: "Bild↑", PageDown: "Bild↓", Home: "Pos1", End: "Ende",
};

// "Control+Alt+Space" → ["Strg", "Alt", "Leertaste"]
export const acceleratorKeys = (acc) =>
  (acc || "").split("+").filter(Boolean).map((k) => KEY_NAMES[k] || k);

export const prettyAccelerator = (acc) => acceleratorKeys(acc).join(" + ");

const CODE_KEYS = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete",
  Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
  BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Backquote: "`",
  NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult",
  NumpadDivide: "numdiv", NumpadDecimal: "numdec",
};

// KeyboardEvent → Electron-Accelerator ("Control+Alt+N"). null, solange
// noch keine gültige Kombination (Modifier + Taste) gedrückt ist.
export function acceleratorFromEvent(e) {
  let key = null;
  const code = e.code || "";
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^Numpad\d$/.test(code)) key = "num" + code.slice(6);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const isFKey = /^F\d{1,2}$/.test(key);
  // Mindestens Strg/Alt/Win – nur Umschalt + Taste würde normales Tippen stören
  if (!isFKey && !mods.some((m) => m !== "Shift")) return null;
  return [...mods, key].join("+");
}
