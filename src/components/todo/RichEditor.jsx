import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from "react";
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListChecks,
  IndentDecrease, IndentIncrease, Link2, Unlink, Table2, Minus, RemoveFormatting, ClipboardType,
  Clock, Baseline, Highlighter, ChevronDown, Plus, Trash2, Rows3, Columns3, MoreHorizontal,
} from "lucide-react";

const COLORS = ["#1e293b", "#ef4444", "#f97316", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#64748b"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];
const BLOCKS = [
  ["p", "Text"],
  ["h1", "Überschrift 1"],
  ["h2", "Überschrift 2"],
  ["h3", "Überschrift 3"],
  ["blockquote", "Zitat"],
];
const SIZES = [["13px", "Klein"], ["", "Normal"], ["18px", "Groß"], ["24px", "Sehr groß"]];
const TD_STYLE = "border:1px solid #cbd5e1;padding:4px 8px;min-width:60px";
const BLOCK_TAGS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "TD", "TH", "PRE"]);

function buildTimestamp() {
  const now = new Date();
  const d = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const t = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `---${d} // ${t}---`;
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Formatierbarer Texteditor (Notizen, 2do-Beschreibung). Speichert HTML.
 * Markdown-Kurzbefehle am Zeilenanfang: "- " Liste · "1. " nummeriert ·
 * "[] " Checkliste · "# " / "## " / "### " Überschrift · "> " Zitat.
 * Tastatur: Strg+B/I/U, Strg+K Link, Strg+T Zeitmarke, Strg+Umschalt+7/8/9
 * Listen, Tab/Umschalt+Tab ein-/ausrücken. Strg+Klick öffnet Links.
 */
/*
 * variant: "box" (Eingabefeld, z. B. 2do-Beschreibung) | "page" (Notizseite:
 * Werkzeugleiste über die volle Breite, Inhalt als zentrierte Seite)
 * header: wird bei "page" zwischen Werkzeugleiste und Text angezeigt (Titel)
 */
const RichEditor = forwardRef(function RichEditor({ value, onChange, placeholder, minHeight = 160, readOnly = false, variant = "box", header = null }, ref) {
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const savedRange = useRef(null);
  const [menu, setMenu] = useState(null); // block | color | highlight | link | table
  const [linkUrl, setLinkUrl] = useState("");
  const [tableHover, setTableHover] = useState([0, 0]);
  const [state, setState] = useState({});

  // Inhalt von außen übernehmen (anderes 2do / andere Seite, Live-Stand im
  // Lesemodus) – nie, während man selbst darin tippt
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const v = value || "";
    if (el.innerHTML !== v && (readOnly || document.activeElement !== el)) el.innerHTML = v;
  }, [value, readOnly]);

  // Eingabe erzeugt einheitlich <p>-Absätze (statt <div> nach Überschriften)
  useEffect(() => {
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* alt */ }
  }, []);

  const emit = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML || "");
  }, [onChange]);

  // Auswahl merken (Toolbar-Menüs mit Eingabefeldern nehmen den Fokus)
  const inEditor = (node) => !!node && !!editorRef.current?.contains(node);
  const updateState = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !inEditor(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    let node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const block = (() => { try { return String(document.queryCommandValue("formatBlock") || "").toLowerCase(); } catch { return ""; } })();
    setState({
      bold: q("bold"), italic: q("italic"), underline: q("underline"), strike: q("strikeThrough"),
      ul: q("insertUnorderedList") && !node?.closest?.("ul.checklist"),
      ol: q("insertOrderedList"),
      check: !!node?.closest?.("ul.checklist"),
      table: !!node?.closest?.("td,th"),
      link: !!node?.closest?.("a"),
      block,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", updateState);
    return () => document.removeEventListener("selectionchange", updateState);
  }, [updateState]);

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const r = savedRange.current;
    if (r && inEditor(r.startContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const exec = (cmd, val = null) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    emit();
    updateState();
  };

  const insertTimestamp = useCallback(() => {
    restoreSelection();
    // Zeitmarke, danach Zeilenumbruch und normale Formatierung
    document.execCommand("insertHTML", false,
      `<span style="color:#6366f1;font-style:italic;font-size:12px;font-weight:normal">${buildTimestamp()}</span><br><span style="color:inherit;font-style:normal;font-size:inherit;font-weight:normal">&#8203;</span>`);
    emit();
  }, [emit]);

  useImperativeHandle(ref, () => ({ insertTimestamp, focus: () => editorRef.current?.focus() }), [insertTimestamp]);

  // ── Listen ────────────────────────────────────────────────────────────────
  const currentNode = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const n = sel.anchorNode;
    return n?.nodeType === 1 ? n : n?.parentElement;
  };

  // Chrome legt Listen gern in den bisherigen <p>/<h1> – ungültiges HTML, das
  // beim Neuladen leere Absätze erzeugt. Liste herausheben, Cursor behalten.
  const liftList = () => {
    const list = currentNode()?.closest?.("ul,ol");
    const parent = list?.parentElement;
    if (!list || !parent || parent === editorRef.current || !inEditor(parent)) return;
    if (!/^(P|H1|H2|H3|BLOCKQUOTE|DIV)$/.test(parent.tagName)) return;
    if ([...parent.childNodes].some((n) => n !== list && (n.nodeType === 1 ? n.tagName !== "BR" : n.textContent.trim()))) return;
    const sel = window.getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    const pos = r ? [r.startContainer, r.startOffset] : null;
    parent.replaceWith(list);
    if (pos) {
      const nr = document.createRange();
      nr.setStart(pos[0], pos[1]);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  };
  // Leere Absätze ohne Inhalt (nicht einmal <br>) sind unsichtbar – weg damit
  const dropEmptyBlocks = () => {
    const keep = currentNode();
    editorRef.current?.querySelectorAll(":scope > p:empty, :scope > div:empty").forEach((n) => {
      if (n !== keep) n.remove();
    });
  };

  const caretPos = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return [r.startContainer, r.startOffset];
  };
  const setCaret = (pos) => {
    if (!pos || !pos[0].isConnected) return;
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(pos[0], Math.min(pos[1], pos[0].nodeType === 3 ? pos[0].length : pos[0].childNodes.length));
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // Absatz → Liste (ul | ol | check). Chrome hängt eine neue Liste an eine
  // direkt benachbarte gleiche Liste an – bei Checkliste neben Aufzählung
  // werden die Einträge wieder nach ihrer Herkunft getrennt.
  const applyList = (kind) => {
    const tag = kind === "ol" ? "OL" : "UL";
    const wantCheck = kind === "check";
    const start = caretPos();
    const block = start ? blockOf(start[0]) : null;
    const neighbours = block && block !== editorRef.current
      ? [block.previousElementSibling, block.nextElementSibling]
        .filter((l) => l && l.tagName === tag)
        .map((l) => ({ check: l.classList.contains("checklist"), items: new Set(l.children) }))
      : [];
    document.execCommand(kind === "ol" ? "insertOrderedList" : "insertUnorderedList");
    const li = currentNode()?.closest?.("li");
    const list = li?.parentElement;
    if (!li || !list || !inEditor(list)) return;
    if (tag === "UL") {
      const groups = [];
      for (const item of [...list.children]) {
        const origin = neighbours.find((n) => n.items.has(item));
        const check = origin ? origin.check : wantCheck;
        const last = groups[groups.length - 1];
        if (last && last.check === check) last.items.push(item);
        else groups.push({ check, items: [item] });
      }
      if (groups.length > 1) {
        const pos = caretPos();
        let anchor = list;
        groups.forEach((g, i) => {
          const target = i === 0 ? list : document.createElement("ul");
          target.classList.toggle("checklist", g.check);
          if (i > 0) { anchor.after(target); anchor = target; }
          g.items.forEach((it) => target.appendChild(it));
        });
        setCaret(pos);
      } else {
        list.classList.toggle("checklist", wantCheck);
      }
    }
    liftList();
  };

  const toggleChecklist = () => {
    restoreSelection();
    const list = currentNode()?.closest?.("ul");
    if (list && inEditor(list)) {
      if (list.classList.contains("checklist")) document.execCommand("insertUnorderedList");
      else list.classList.add("checklist");
    } else if (currentNode()?.closest?.("ol")) {
      document.execCommand("insertUnorderedList");
      currentNode()?.closest?.("ul")?.classList.add("checklist");
    } else {
      applyList("check");
    }
    liftList();
    emit();
    updateState();
  };

  const toggleList = (cmd) => {
    restoreSelection();
    const inList = currentNode()?.closest?.("ul,ol");
    const checklist = inList?.matches?.("ul.checklist");
    // Checkliste → normale Liste: nur die Klasse entfernen
    if (cmd === "insertUnorderedList" && checklist && inEditor(inList)) {
      inList.classList.remove("checklist");
    } else if (inList && inEditor(inList)) {
      document.execCommand(cmd);
      liftList();
    } else {
      applyList(cmd === "insertOrderedList" ? "ol" : "ul");
    }
    emit();
    updateState();
  };

  // ── Schrift ───────────────────────────────────────────────────────────────
  const setSize = (size) => {
    restoreSelection();
    document.execCommand("fontSize", false, "7");
    editorRef.current.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement("span");
      if (size) span.style.fontSize = size;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
    emit();
    setMenu(null);
  };

  // ── Links ─────────────────────────────────────────────────────────────────
  const openLinkMenu = () => {
    const a = currentNode()?.closest?.("a");
    setLinkUrl(a && inEditor(a) ? a.getAttribute("href") || "" : "https://");
    setMenu("link");
  };

  const applyLink = () => {
    let url = linkUrl.trim();
    setMenu(null);
    if (!url || url === "https://") return;
    if (!/^(https?:|mailto:)/i.test(url)) url = url.includes("@") ? `mailto:${url}` : `https://${url}`;
    restoreSelection();
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`);
    } else {
      document.execCommand("createLink", false, url);
    }
    emit();
  };

  // ── Tabellen ──────────────────────────────────────────────────────────────
  // Formatierung entfernen – Überschrift/Zitat wird wieder normaler Text
  const clearFormat = () => {
    setMenu(null);
    restoreSelection();
    document.execCommand("removeFormat");
    if (["h1", "h2", "h3", "blockquote"].includes(state.block)) document.execCommand("formatBlock", false, "<p>");
    emit();
    updateState();
  };

  // Blöcke (Tabelle, Trennlinie) nie in einen Listenpunkt, sondern unter die Liste
  const escapeList = () => {
    const li = currentNode()?.closest?.("li");
    if (!li || !inEditor(li)) return;
    let list = li.closest("ul,ol");
    while (list?.parentElement?.closest?.("li") && inEditor(list.parentElement)) list = list.parentElement.closest("ul,ol");
    if (!list) return;
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    list.after(p);
    setCaret([p, 0]);
  };
  const insertBlock = (html) => {
    setMenu(null);
    restoreSelection();
    escapeList();
    document.execCommand("insertHTML", false, html);
    emit();
    updateState();
  };
  const insertTable = (rows, cols) => {
    const row = () => `<tr>${Array.from({ length: cols }, () => `<td style="${TD_STYLE}"><br></td>`).join("")}</tr>`;
    insertBlock(`<table style="border-collapse:collapse;width:100%;margin:8px 0">${Array.from({ length: rows }, row).join("")}</table><p><br></p>`);
  };

  const cell = () => currentNode()?.closest?.("td,th");
  const addRow = () => {
    restoreSelection();
    const tr = cell()?.parentElement;
    if (!tr) return;
    const n = tr.children.length || 1;
    const newRow = document.createElement("tr");
    newRow.innerHTML = Array.from({ length: n }, () => `<td style="${TD_STYLE}"><br></td>`).join("");
    tr.after(newRow);
    emit();
  };
  const addCol = () => {
    restoreSelection();
    const td = cell();
    const table = td?.closest("table");
    if (!table) return;
    const idx = Array.from(td.parentElement.children).indexOf(td);
    table.querySelectorAll("tr").forEach((r) => {
      const c = document.createElement("td");
      c.style.cssText = TD_STYLE;
      c.innerHTML = "&nbsp;";
      r.insertBefore(c, r.children[idx + 1] || null);
    });
    emit();
  };
  const removeRow = () => {
    restoreSelection();
    const tr = cell()?.parentElement;
    if (!tr) return;
    const table = tr.closest("table");
    tr.remove();
    if (table && !table.querySelector("tr")) table.remove();
    emit();
  };
  const removeCol = () => {
    restoreSelection();
    const td = cell();
    const table = td?.closest("table");
    if (!table) return;
    const idx = Array.from(td.parentElement.children).indexOf(td);
    table.querySelectorAll("tr").forEach((r) => r.children[idx]?.remove());
    if (!table.querySelector("td,th")) table.remove();
    emit();
  };
  const removeTable = () => {
    restoreSelection();
    cell()?.closest("table")?.remove();
    emit();
    updateState();
  };

  // ── Einfügen als reiner Text ──────────────────────────────────────────────
  const pastePlain = async () => {
    restoreSelection();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      document.execCommand("insertHTML", false, escapeHtml(text).replace(/\r?\n/g, "<br>"));
      emit();
    } catch {
      alert("Kein Zugriff auf die Zwischenablage. Bitte Strg+Umschalt+V verwenden.");
    }
  };

  // ── Markdown-Kurzbefehle & Tastatur ───────────────────────────────────────
  const blockOf = (node) => {
    let n = node;
    while (n && n !== editorRef.current) {
      if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName)) return n;
      n = n.parentNode;
    }
    return editorRef.current;
  };

  const tryMarkdown = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const block = blockOf(range.startContainer);
    if (!block || block.closest?.("td,th")) return false;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const prefix = before.toString();
    const actions = {
      "-": () => applyList("ul"),
      "*": () => applyList("ul"),
      "1.": () => applyList("ol"),
      "[]": () => applyList("check"),
      "[ ]": () => applyList("check"),
      "#": () => document.execCommand("formatBlock", false, "<h1>"),
      "##": () => document.execCommand("formatBlock", false, "<h2>"),
      "###": () => document.execCommand("formatBlock", false, "<h3>"),
      ">": () => document.execCommand("formatBlock", false, "<blockquote>"),
    };
    const action = actions[prefix];
    if (!action || block.tagName === "LI") return false;
    before.deleteContents();
    // Leerer Absatz braucht ein <br>, sonst springt der Cursor in den Absatz
    // darüber und das Format landet dort
    if (block !== editorRef.current && !block.textContent && !block.querySelector("br,img,table")) {
      block.appendChild(document.createElement("br"));
    }
    const caret = document.createRange();
    caret.setStart(block, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    action();
    liftList();
    dropEmptyBlocks();
    emit();
    updateState();
    return true;
  };

  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "t") { e.preventDefault(); insertTimestamp(); }
    else if (mod && k === "k") { e.preventDefault(); updateState(); openLinkMenu(); }
    else if (mod && e.shiftKey && e.code === "Digit7") { e.preventDefault(); toggleList("insertOrderedList"); }
    else if (mod && e.shiftKey && e.code === "Digit8") { e.preventDefault(); toggleList("insertUnorderedList"); }
    else if (mod && e.shiftKey && e.code === "Digit9") { e.preventDefault(); toggleChecklist(); }
    else if (e.key === "Tab" && currentNode()?.closest?.("li")) {
      e.preventDefault();
      document.execCommand(e.shiftKey ? "outdent" : "indent");
      emit();
    } else if (e.key === " " && !mod && tryMarkdown()) {
      e.preventDefault();
    }
  };

  // Checkliste abhaken (Klick auf das Kästchen) · Strg+Klick öffnet Links
  const handleMouseDown = (e) => {
    const li = e.target.closest?.("ul.checklist > li");
    if (li && e.target === li && e.clientX - li.getBoundingClientRect().left < 26) {
      e.preventDefault();
      if (readOnly) return;
      if (li.dataset.checked === "true") delete li.dataset.checked;
      else li.dataset.checked = "true";
      emit();
    }
  };
  const handleClick = (e) => {
    const a = e.target.closest?.("a[href]");
    if (a && (e.ctrlKey || e.metaKey || readOnly)) {
      e.preventDefault();
      window.open(a.getAttribute("href"), "_blank");
    }
  };

  // Menüs schließen bei Klick daneben / Esc
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => { if (!toolbarRef.current?.contains(e.target)) setMenu(null); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenu(null); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  // Klick auf die freie Fläche unter dem Text → Cursor ans Ende
  const focusFromBlank = (e) => {
    if (readOnly || e.target !== e.currentTarget) return;
    const el = editorRef.current;
    if (!el || e.clientY < el.getBoundingClientRect().bottom) return;
    e.preventDefault();
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const content = (
    <div
      ref={editorRef}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onInput={emit}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onKeyUp={updateState}
      data-placeholder={placeholder}
      spellCheck
      style={{ minHeight }}
      className={`${variant === "page" ? "" : "px-4 py-3 text-[14px]"} leading-relaxed text-slate-700 focus:outline-none rich-editor`}
    />
  );

  const blockLabel = (BLOCKS.find(([t]) => t === state.block) || BLOCKS[0])[1];
  const toggleMenu = (m) => setMenu((cur) => (cur === m ? null : m));

  return (
    <div className={variant === "page" ? "re-root re-page" : "glass-input rounded-2xl re-root"}>
      {!readOnly && (
        <div ref={toolbarRef} className="re-toolbar" onMouseDown={(e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); }}>
          <div className="re-group">
            <TBtn onClick={() => exec("undo")} title="Rückgängig (Strg+Z)"><Undo2 size={15} /></TBtn>
            <TBtn onClick={() => exec("redo")} title="Wiederholen (Strg+Y)"><Redo2 size={15} /></TBtn>
          </div>
          <div className="re-group relative">
            <button type="button" className="re-btn re-btn-text" title="Absatzformat & Schriftgröße" onClick={() => toggleMenu("block")}>
              {blockLabel} <ChevronDown size={13} />
            </button>
            {menu === "block" && (
              <div className="re-menu">
                {BLOCKS.map(([tag, label]) => (
                  <button key={tag} type="button" className={`re-menu-item re-block-${tag}`}
                    onClick={() => { setMenu(null); exec("formatBlock", `<${tag}>`); }}>{label}</button>
                ))}
                <div className="menu-sep" />
                <p className="section-label px-2.5 pt-1 pb-1">Schriftgröße</p>
                <div className="flex gap-1 px-2 pb-1.5">
                  {SIZES.map(([size, label]) => (
                    <button key={label} type="button" onClick={() => setSize(size)}
                      className="px-2 py-1 rounded-lg text-[12px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="re-group">
            <TBtn active={state.bold} onClick={() => exec("bold")} title="Fett (Strg+B)"><Bold size={15} /></TBtn>
            <TBtn active={state.italic} onClick={() => exec("italic")} title="Kursiv (Strg+I)"><Italic size={15} /></TBtn>
            <TBtn active={state.underline} onClick={() => exec("underline")} title="Unterstrichen (Strg+U)"><Underline size={15} /></TBtn>
            <TBtn active={state.strike} onClick={() => exec("strikeThrough")} title="Durchgestrichen"><Strikethrough size={15} /></TBtn>
            <span className="relative">
              <TBtn onClick={() => toggleMenu("color")} title="Schriftfarbe" active={menu === "color"}><Baseline size={15} /></TBtn>
              {menu === "color" && (
                <div className="re-menu re-swatches">
                  {COLORS.map((c) => (
                    <button key={c} type="button" title={c} onClick={() => { setMenu(null); exec("foreColor", c); }}
                      className="re-swatch" style={{ background: c }} />
                  ))}
                </div>
              )}
            </span>
            <span className="relative">
              <TBtn onClick={() => toggleMenu("highlight")} title="Markieren" active={menu === "highlight"}><Highlighter size={15} /></TBtn>
              {menu === "highlight" && (
                <div className="re-menu re-swatches">
                  {HIGHLIGHTS.map((c) => (
                    <button key={c} type="button" title="Markieren" onClick={() => { setMenu(null); exec("hiliteColor", c); }}
                      className="re-swatch !rounded-md" style={{ background: c }} />
                  ))}
                  <button type="button" title="Markierung entfernen" onClick={() => { setMenu(null); exec("hiliteColor", "transparent"); }}
                    className="re-swatch !rounded-md bg-white text-[10px] text-slate-500">✕</button>
                </div>
              )}
            </span>
          </div>
          <div className="re-group">
            <TBtn active={state.ul} onClick={() => toggleList("insertUnorderedList")} title="Aufzählung (Strg+Umschalt+8 oder „- “)"><List size={15} /></TBtn>
            <TBtn active={state.ol} onClick={() => toggleList("insertOrderedList")} title="Nummerierung (Strg+Umschalt+7 oder „1. “)"><ListOrdered size={15} /></TBtn>
            <TBtn active={state.check} onClick={toggleChecklist} title="Checkliste (Strg+Umschalt+9 oder „[] “)"><ListChecks size={15} /></TBtn>
          </div>
          <div className="re-group">
            <span className="relative">
              <TBtn active={state.link || menu === "link"} onClick={() => (menu === "link" ? setMenu(null) : openLinkMenu())} title="Link (Strg+K)"><Link2 size={15} /></TBtn>
              {menu === "link" && (
                <div className="re-menu !min-w-[280px] p-2">
                  <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
                    placeholder="https://… oder E-Mail"
                    className="w-full px-2.5 py-1.5 rounded-lg glass-input text-[13px]" />
                  <div className="flex gap-1.5 mt-2">
                    <button type="button" onClick={applyLink}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-500 text-white text-[12px] font-semibold">Übernehmen</button>
                    {state.link && (
                      <button type="button" onClick={() => { setMenu(null); exec("unlink"); }} title="Link entfernen"
                        className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-50 flex items-center gap-1">
                        <Unlink size={13} /> Entfernen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </span>
            <span className="relative">
              <TBtn active={menu === "table"} onClick={() => { setTableHover([0, 0]); toggleMenu("table"); }} title="Tabelle einfügen"><Table2 size={15} /></TBtn>
              {menu === "table" && (
                <div className="re-menu p-2">
                  <div className="grid grid-cols-6 gap-1" onMouseLeave={() => setTableHover([0, 0])}>
                    {Array.from({ length: 36 }, (_, i) => {
                      const r = Math.floor(i / 6) + 1;
                      const c = (i % 6) + 1;
                      const on = r <= tableHover[0] && c <= tableHover[1];
                      return (
                        <button key={i} type="button" onMouseEnter={() => setTableHover([r, c])} onClick={() => insertTable(r, c)}
                          className={`w-5 h-5 rounded-[4px] border ${on ? "bg-indigo-400 border-indigo-500" : "bg-white border-slate-200"}`} />
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center mt-1.5">
                    {tableHover[0] ? `${tableHover[0]} × ${tableHover[1]}` : "Größe wählen"}
                  </p>
                </div>
              )}
            </span>
          </div>
          <div className="re-group">
            <span className="relative">
              <TBtn active={menu === "more"} onClick={() => toggleMenu("more")} title="Mehr: Trennlinie, Zeitmarke, …"><MoreHorizontal size={16} /></TBtn>
              {menu === "more" && (
                <div className="re-menu re-menu-end">
                  <button type="button" className="re-menu-item re-menu-row" onClick={() => insertBlock("<hr><p><br></p>")}>
                    <Minus size={15} /> Trennlinie
                  </button>
                  <button type="button" className="re-menu-item re-menu-row" onClick={() => { setMenu(null); insertTimestamp(); }}>
                    <Clock size={15} /> Zeitmarke <kbd>Strg+T</kbd>
                  </button>
                  <button type="button" className="re-menu-item re-menu-row" onClick={() => { setMenu(null); pastePlain(); }}>
                    <ClipboardType size={15} /> Als reinen Text einfügen
                  </button>
                  <div className="menu-sep" />
                  <button type="button" className="re-menu-item re-menu-row" onClick={clearFormat}>
                    <RemoveFormatting size={15} /> Formatierung entfernen
                  </button>
                </div>
              )}
            </span>
          </div>
          {/* Einrücken, solange der Cursor in einer Liste steht */}
          {(state.ul || state.ol || state.check) && (
            <div className="re-group re-group-context">
              <TBtn onClick={() => exec("outdent")} title="Ausrücken (Umschalt+Tab)"><IndentDecrease size={15} /></TBtn>
              <TBtn onClick={() => exec("indent")} title="Einrücken (Tab)"><IndentIncrease size={15} /></TBtn>
            </div>
          )}
          {/* Tabellen-Werkzeuge, solange der Cursor in einer Tabelle steht */}
          {state.table && (
            <div className="re-group re-group-context">
              <TBtn onClick={addRow} title="Zeile darunter einfügen"><Rows3 size={15} /><Plus size={10} className="-ml-1" /></TBtn>
              <TBtn onClick={addCol} title="Spalte rechts einfügen"><Columns3 size={15} /><Plus size={10} className="-ml-1" /></TBtn>
              <TBtn onClick={removeRow} title="Zeile löschen"><Rows3 size={15} /><Minus size={10} className="-ml-1" /></TBtn>
              <TBtn onClick={removeCol} title="Spalte löschen"><Columns3 size={15} /><Minus size={10} className="-ml-1" /></TBtn>
              <TBtn onClick={removeTable} title="Tabelle löschen"><Trash2 size={15} /></TBtn>
            </div>
          )}
        </div>
      )}

      {variant === "page" ? (
        <div className="re-page-body" onMouseDown={focusFromBlank}>
          {header}
          {content}
        </div>
      ) : content}
    </div>
  );
});

export default RichEditor;

function TBtn({ onClick, title, active = false, children }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
      className={`re-btn ${active ? "re-btn-active" : ""}`}>
      {children}
    </button>
  );
}
