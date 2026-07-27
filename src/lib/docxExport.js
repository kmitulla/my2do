// Word-Export (.docx) für einzelne Notiz-Seiten und 2dos.
//
// Der RichEditor speichert HTML aus einem contentEditable (b/strong, i, u, s,
// span mit Inline-Styles, font-Tags, ul/ol, Tabellen, Links). Dieses Modul
// übersetzt dieses HTML in echte Word-Elemente – kein „HTML mit .doc-Endung",
// sondern eine gültige OOXML-Datei.
//
// Wichtig: Dieses Modul wird in den Komponenten per `await import(...)` geladen,
// damit die docx-Bibliothek nur beim tatsächlichen Export nachgeladen wird und
// das Haupt-Bundle klein bleibt.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { format } from "date-fns";

// ── Farb- und Größen-Helfer ──────────────────────────────────────────────────

const NAMED_COLORS = {
  black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF",
  yellow: "FFFF00", orange: "FFA500", purple: "800080", gray: "808080", grey: "808080",
  silver: "C0C0C0", maroon: "800000", olive: "808000", lime: "00FF00", aqua: "00FFFF",
  cyan: "00FFFF", teal: "008080", navy: "000080", fuchsia: "FF00FF", magenta: "FF00FF",
  pink: "FFC0CB", brown: "A52A2A", gold: "FFD700", indigo: "4B0082", violet: "EE82EE",
};

// CSS-Farbe → 6-stelliges Hex ohne "#" (Word-Format). Gibt null zurück, wenn die
// Farbe unbekannt oder transparent ist.
function toHexColor(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v || v === "transparent" || v === "inherit" || v === "initial" || v === "currentcolor") return null;
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) return hex.split("").map((c) => c + c).join("").toUpperCase();
    if (hex.length === 6) return hex.toUpperCase();
    if (hex.length === 8) return hex.slice(0, 6).toUpperCase();
    return null;
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (rgb) {
    // rgba(...,0) = unsichtbar → keine Farbe setzen
    if (rgb[4] !== undefined && parseFloat(rgb[4]) === 0) return null;
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  return NAMED_COLORS[v] || null;
}

// CSS-Schriftgröße → Word-Größe in Halbpunkten (docx `size`).
function toHalfPoints(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^([\d.]+)\s*(px|pt|rem|em)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!num || Number.isNaN(num)) return null;
  const unit = m[2] || "px";
  const pt = unit === "pt" ? num : unit === "px" ? num * 0.75 : num * 12; // rem/em ≈ 16px Basis
  const half = Math.round(pt * 2);
  // Ausreißer (z. B. 0 oder absurd groß) ignorieren
  return half >= 8 && half <= 200 ? half : null;
}

function firstFontFamily(value) {
  if (!value) return null;
  const first = String(value).split(",")[0].trim().replace(/["']/g, "");
  return first || null;
}

// ── Style-Vererbung ──────────────────────────────────────────────────────────

const BASE_STYLE = Object.freeze({});

function mergeStyle(base, el) {
  const s = { ...base };
  const tag = el.tagName;

  if (tag === "B" || tag === "STRONG") s.bold = true;
  if (tag === "I" || tag === "EM") s.italics = true;
  if (tag === "U" || tag === "INS") s.underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") s.strike = true;
  if (tag === "CODE" || tag === "PRE" || tag === "KBD" || tag === "SAMP") s.font = "Consolas";
  if (tag === "SUP") s.superScript = true;
  if (tag === "SUB") s.subScript = true;
  if (tag === "MARK" && !s.shading) s.shading = "FEF08A";

  // execCommand erzeugt in einigen Browsern noch <font color="…">
  if (tag === "FONT") {
    const color = toHexColor(el.getAttribute("color"));
    if (color) s.color = color;
    const face = firstFontFamily(el.getAttribute("face"));
    if (face) s.font = face;
  }

  const st = el.style;
  if (st) {
    const weight = st.fontWeight;
    if (weight === "bold" || weight === "bolder" || parseInt(weight, 10) >= 600) s.bold = true;
    else if (weight === "normal" || (weight && parseInt(weight, 10) < 600)) s.bold = false;

    if (st.fontStyle === "italic" || st.fontStyle === "oblique") s.italics = true;
    else if (st.fontStyle === "normal") s.italics = false;

    const deco = `${st.textDecoration || ""} ${st.textDecorationLine || ""}`;
    if (deco.includes("underline")) s.underline = true;
    if (deco.includes("line-through")) s.strike = true;

    const color = toHexColor(st.color);
    if (color) s.color = color;

    const bg = toHexColor(st.backgroundColor);
    if (bg && bg !== "FFFFFF") s.shading = bg;

    const size = toHalfPoints(st.fontSize);
    if (size) s.size = size;

    const font = firstFontFamily(st.fontFamily);
    if (font) s.font = font;
  }

  return s;
}

function runProps(style) {
  const props = {};
  if (style.bold) props.bold = true;
  if (style.italics) props.italics = true;
  if (style.underline) props.underline = {};
  if (style.strike) props.strike = true;
  if (style.color) props.color = style.color;
  if (style.size) props.size = style.size;
  if (style.font) props.font = style.font;
  if (style.superScript) props.superScript = true;
  if (style.subScript) props.subScript = true;
  if (style.shading) props.shading = { type: ShadingType.CLEAR, color: "auto", fill: style.shading };
  return props;
}

// ── HTML → Word-Blöcke ───────────────────────────────────────────────────────

const HEADINGS = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"]);

// Sammelt Inline-Runs und schiebt sie beim „flush" als Absatz in die Blockliste.
function makeSink() {
  const blocks = [];
  let runs = [];
  return {
    blocks,
    push: (run) => runs.push(run),
    isEmpty: () => runs.length === 0,
    take: () => { const r = runs; runs = []; return r; },
    restore: (r) => { runs = r; },
    flush(options = {}) {
      if (runs.length === 0) return;
      blocks.push(new Paragraph({ children: runs, ...options }));
      runs = [];
    },
    addBlock(block) {
      this.flush();
      blocks.push(block);
    },
  };
}

// Konvertiert einen HTML-String in Word-Blöcke.
// Rückgabe: { blocks, numbering } – numbering enthält die Konfiguration der
// gefundenen nummerierten Listen und muss ins Document übernommen werden.
export function htmlToDocxBlocks(html) {
  const numbering = [];
  const sink = makeSink();
  if (!html || !String(html).trim()) return { blocks: [], numbering };

  const parsed = new DOMParser().parseFromString(`<body><div id="__root">${html}</div></body>`, "text/html");
  const root = parsed.getElementById("__root");
  if (!root) return { blocks: [], numbering };

  const ctx = { numbering, listCounter: 0 };
  walkChildren(root, BASE_STYLE, sink, ctx);
  sink.flush();
  return { blocks: sink.blocks, numbering };
}

function walkChildren(el, style, sink, ctx) {
  for (const child of Array.from(el.childNodes)) walkNode(child, style, sink, ctx);
}

function walkNode(node, style, sink, ctx) {
  // Textknoten
  if (node.nodeType === 3) {
    const text = node.nodeValue.replace(/ /g, " ").replace(/[\r\n\t]+/g, " ");
    if (!text) return;
    // Reines Whitespace am Absatzanfang überspringen (Formatierung des HTML-Quelltexts)
    if (!text.trim() && sink.isEmpty()) return;
    sink.push(new TextRun({ text, ...runProps(style) }));
    return;
  }
  if (node.nodeType !== 1) return;

  const el = node;
  const tag = el.tagName;
  if (SKIP_TAGS.has(tag)) return;

  switch (tag) {
    case "BR": {
      // Leerzeile erhalten: ohne vorhandene Runs einen leeren Absatz erzeugen
      if (sink.isEmpty()) sink.push(new TextRun(""));
      sink.flush();
      return;
    }

    case "HR": {
      sink.addBlock(dividerParagraph());
      return;
    }

    case "IMG": {
      // Bilder werden (noch) nicht eingebettet – Platzhalter statt stillem Verlust
      const alt = el.getAttribute("alt");
      sink.push(new TextRun({ text: `[Bild${alt ? `: ${alt}` : ""}]`, italics: true, color: "94A3B8" }));
      return;
    }

    case "P":
    case "DIV":
    case "SECTION":
    case "ARTICLE": {
      sink.flush();
      walkChildren(el, mergeStyle(style, el), sink, ctx);
      sink.flush({ spacing: { after: 80 } });
      return;
    }

    case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
      sink.flush();
      walkChildren(el, mergeStyle(style, el), sink, ctx);
      sink.flush({ heading: HEADINGS[tag], spacing: { before: 200, after: 100 } });
      return;
    }

    case "BLOCKQUOTE": {
      sink.flush();
      walkChildren(el, { ...mergeStyle(style, el), italics: true, color: "475569" }, sink, ctx);
      sink.flush({ indent: { left: 480 }, spacing: { after: 80 } });
      return;
    }

    case "PRE": {
      sink.flush();
      walkChildren(el, mergeStyle(style, el), sink, ctx);
      sink.flush({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" }, spacing: { after: 80 } });
      return;
    }

    case "UL":
    case "OL": {
      sink.flush();
      walkList(el, mergeStyle(style, el), sink, ctx, 0);
      return;
    }

    case "LI": {
      // Verwaistes <li> ohne Liste – als normaler Absatz behandeln
      sink.flush();
      walkChildren(el, mergeStyle(style, el), sink, ctx);
      sink.flush();
      return;
    }

    case "TABLE": {
      const table = buildTable(el, mergeStyle(style, el), ctx);
      if (table) sink.addBlock(table);
      return;
    }

    case "A": {
      const href = el.getAttribute("href");
      const linkStyle = href
        ? { ...mergeStyle(style, el), color: "2563EB", underline: true }
        : mergeStyle(style, el);
      const outer = sink.take();
      walkChildren(el, linkStyle, sink, ctx);
      const inner = sink.take();
      sink.restore(outer);
      if (inner.length === 0) return;
      if (href && /^(https?:|mailto:|tel:)/i.test(href)) {
        sink.push(new ExternalHyperlink({ children: inner, link: href }));
      } else {
        inner.forEach((r) => sink.push(r));
      }
      return;
    }

    default: {
      // SPAN, B, I, U, FONT, … – reine Inline-Formatierung
      walkChildren(el, mergeStyle(style, el), sink, ctx);
    }
  }
}

function walkList(listEl, style, sink, ctx, level) {
  const ordered = listEl.tagName === "OL";
  let reference = null;
  if (ordered) {
    reference = `my2do-ol-${ctx.listCounter++}`;
    ctx.numbering.push({
      reference,
      levels: [0, 1, 2, 3, 4].map((l) => ({
        level: l,
        format: LevelFormat.DECIMAL,
        text: `%${l + 1}.`,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
      })),
    });
  }

  const depth = Math.min(level, 4);
  for (const li of Array.from(listEl.children)) {
    if (li.tagName !== "LI") continue;
    const liStyle = mergeStyle(style, li);
    const nested = [];
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === 1 && (child.tagName === "UL" || child.tagName === "OL")) {
        nested.push(child);
        continue;
      }
      walkNode(child, liStyle, sink, ctx);
    }
    sink.flush(ordered
      ? { numbering: { reference, level: depth }, spacing: { after: 40 } }
      : { bullet: { level: depth }, spacing: { after: 40 } });
    for (const child of nested) walkList(child, liStyle, sink, ctx, level + 1);
  }
}

function buildTable(tableEl, style, ctx) {
  const rows = Array.from(tableEl.rows || []);
  if (rows.length === 0) return null;

  const docxRows = rows.map((tr) => new TableRow({
    children: Array.from(tr.cells || []).map((cell) => {
      const cellSink = makeSink();
      const cellStyle = mergeStyle(style, cell);
      walkChildren(cell, cellStyle, cellSink, ctx);
      cellSink.flush();
      const isHeader = cell.tagName === "TH";
      return new TableCell({
        children: cellSink.blocks.length ? cellSink.blocks : [new Paragraph("")],
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: isHeader ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF2FF" } : undefined,
      });
    }),
  }));

  return new Table({
    rows: docxRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// ── Bausteine für die Dokument-Kopfzeile ─────────────────────────────────────

function dividerParagraph() {
  return new Paragraph({
    spacing: { before: 60, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7D2FE" } },
    children: [new TextRun("")],
  });
}

function titleParagraph(text) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: true, size: 40, color: "312E81" })],
  });
}

function subtleParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 18, color: "64748B", italics: !!options.italics })],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: "4338CA" })],
  });
}

function metaTable(entries) {
  const rows = entries
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF2FF" },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: "3730A3" })] })],
        }),
        new TableCell({
          width: { size: 72, type: WidthType.PERCENTAGE },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 20, color: "1E293B" })] })],
        }),
      ],
    }));
  if (rows.length === 0) return null;
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: "my2do · Seite ", size: 16, color: "94A3B8" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" }),
          new TextRun({ text: " von ", size: 16, color: "94A3B8" }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "94A3B8" }),
        ],
      }),
    ],
  });
}

function buildDocument({ children, numbering }) {
  return new Document({
    creator: "my2do",
    description: "Export aus my2do",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "1E293B" } },
      },
    },
    numbering: { config: numbering },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      footers: { default: buildFooter() },
      children,
    }],
  });
}

// ── Datum / Dateiname ────────────────────────────────────────────────────────

function toDate(value) {
  if (!value) return null;
  const d = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = toDate(value);
  return d ? format(d, "dd.MM.yyyy, HH:mm") : "";
}

export function safeFileName(title, fallback = "Export") {
  const base = String(title || "").trim()
    .replace(/[\\/:*?"<>|]/g, "")   // in Windows-Dateinamen verboten
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return `${base || fallback}_${format(new Date(), "yyyy-MM-dd")}.docx`;
}

async function downloadDocx(doc, fileName) {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Öffentliche Export-Funktionen ────────────────────────────────────────────

// Einzelne Notiz-Seite als Word-Dokument
export async function exportNoteToDocx({ title, content, createdAt, updatedAt, breadcrumb }) {
  const heading = (title || "").trim() || "Notiz";
  const { blocks, numbering } = htmlToDocxBlocks(content);

  const children = [titleParagraph(heading)];
  if (breadcrumb) children.push(subtleParagraph(breadcrumb));

  const created = formatDateTime(createdAt);
  const updated = formatDateTime(updatedAt);
  const metaParts = [];
  if (created) metaParts.push(`Erstellt ${created}`);
  if (updated) metaParts.push(`Geändert ${updated}`);
  metaParts.push(`Exportiert ${format(new Date(), "dd.MM.yyyy, HH:mm")}`);
  children.push(subtleParagraph(metaParts.join("  ·  ")));
  children.push(dividerParagraph());

  if (blocks.length) children.push(...blocks);
  else children.push(subtleParagraph("Diese Seite ist noch leer.", { italics: true }));

  await downloadDocx(buildDocument({ children, numbering }), safeFileName(heading, "Notiz"));
}

// Einzelnes 2do als Word-Dokument (inkl. Kopfdaten-Tabelle)
export async function exportTodoToDocx(todo) {
  const heading = (todo.title || "").trim() || "2do";
  const { blocks, numbering } = htmlToDocxBlocks(todo.description);

  const tags = Array.isArray(todo.tags) && todo.tags.length
    ? todo.tags.join(", ")
    : (todo.category || "");

  const children = [titleParagraph(heading)];

  const created = formatDateTime(todo.createdAt);
  const updated = formatDateTime(todo.updatedAt);
  const metaParts = [];
  if (created) metaParts.push(`Erstellt ${created}`);
  if (updated) metaParts.push(`Geändert ${updated}`);
  metaParts.push(`Exportiert ${format(new Date(), "dd.MM.yyyy, HH:mm")}`);
  children.push(subtleParagraph(metaParts.join("  ·  ")));
  children.push(dividerParagraph());

  const table = metaTable([
    ["Status", todo.status],
    ["Eigener Status", todo.manualStatus],
    ["Priorität", todo.prio],
    ["Tags", tags],
    ["Deadline", formatDateTime(todo.deadline)],
    ["Wiedervorlage", formatDateTime(todo.wiedervorlage)],
    ["Archiviert", todo.archived ? "ja" : ""],
  ]);
  if (table) children.push(table);

  children.push(sectionHeading("Beschreibung"));
  if (blocks.length) children.push(...blocks);
  else children.push(subtleParagraph("Keine Beschreibung hinterlegt.", { italics: true }));

  await downloadDocx(buildDocument({ children, numbering }), safeFileName(heading, "2do"));
}
