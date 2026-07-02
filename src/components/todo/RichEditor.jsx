import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

const COLORS = ["#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];
const HIGHLIGHTS = ["transparent", "#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px"];

function buildTimestamp() {
  const now = new Date();
  const d = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const t = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `---${d} // ${t}---`;
}

const RichEditor = forwardRef(function RichEditor({ value, onChange, placeholder, minHeight = 160 }, ref) {
  const editorRef = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value || "";
      isInitialized.current = true;
    }
  }, []);

  const exec = useCallback((cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    handleInput();
  }, []);

  const handleInput = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML || "");
  }, [onChange]);

  const insertTimestamp = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    // Insert styled timestamp, then a <br> and a plain span to reset formatting so the cursor is back to normal
    document.execCommand("insertHTML", false,
      `<span style="color:#6366f1;font-style:italic;font-size:12px;font-weight:normal">${buildTimestamp()}</span><br><span style="color:inherit;font-style:normal;font-size:inherit;font-weight:normal">&#8203;</span>`
    );
    handleInput();
  }, [handleInput]);

  // Expose insertTimestamp via ref so parent (TodoDetail footer button) can call it
  useImperativeHandle(ref, () => ({ insertTimestamp }), [insertTimestamp]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      insertTimestamp();
    }
  }, [insertTimestamp]);

  const insertTable = () => {
    const cols = parseInt(prompt("Anzahl Spalten:", "3") || "3", 10);
    const rows = parseInt(prompt("Anzahl Zeilen:", "3") || "3", 10);
    if (!cols || !rows) return;
    const tdStyle = `border:1px solid #cbd5e1;padding:4px 8px;min-width:60px`;
    const header = `<tr>${Array.from({length: cols}, (_, i) => `<td style="${tdStyle}">Spalte ${i+1}</td>`).join("")}</tr>`;
    const body = Array.from({length: rows - 1}, () => `<tr>${Array.from({length: cols}, () => `<td style="${tdStyle}">&nbsp;</td>`).join("")}</tr>`).join("");
    const table = `<table style="border-collapse:collapse;width:100%;margin:8px 0">${header}${body}</table><br/>`;
    document.execCommand("insertHTML", false, table);
    handleInput();
  };

  const addTableRow = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    while (node && node.nodeName !== "TR") node = node.parentNode;
    if (!node) return;
    const cols = node.querySelectorAll("td").length || 1;
    const tdStyle = `border:1px solid #cbd5e1;padding:4px 8px;min-width:60px`;
    const newRow = node.cloneNode(false);
    newRow.innerHTML = Array.from({length: cols}, () => `<td style="${tdStyle}">&nbsp;</td>`).join("");
    node.parentNode.insertBefore(newRow, node.nextSibling);
    handleInput();
  };

  const addTableCol = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    while (node && node.nodeName !== "TD") node = node.parentNode;
    if (!node) return;
    const table = node.closest("table");
    if (!table) return;
    const colIdx = Array.from(node.parentNode.children).indexOf(node);
    const tdStyle = `border:1px solid #cbd5e1;padding:4px 8px;min-width:60px`;
    table.querySelectorAll("tr").forEach((row) => {
      const newTd = document.createElement("td");
      newTd.style.cssText = tdStyle;
      newTd.innerHTML = "&nbsp;";
      const ref2 = row.children[colIdx + 1] || null;
      row.insertBefore(newTd, ref2);
    });
    handleInput();
  };

  const removeTableRow = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    while (node && node.nodeName !== "TR") node = node.parentNode;
    if (!node) return;
    node.remove();
    handleInput();
  };

  const removeTableCol = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    while (node && node.nodeName !== "TD") node = node.parentNode;
    if (!node) return;
    const table = node.closest("table");
    if (!table) return;
    const colIdx = Array.from(node.parentNode.children).indexOf(node);
    table.querySelectorAll("tr").forEach((row) => {
      if (row.children[colIdx]) row.children[colIdx].remove();
    });
    handleInput();
  };

  const insertLink = () => {
    const url = prompt("URL eingeben:");
    if (url) exec("createLink", url);
  };

  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Zwischenablage als reinen Text einfügen (Formatierung wird entfernt)
  const pastePlain = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      document.execCommand("insertHTML", false, escapeHtml(text).replace(/\r?\n/g, "<br>"));
      handleInput();
    } catch {
      alert("Kein Zugriff auf die Zwischenablage. Bitte Strg+Umschalt+V verwenden.");
    }
  };

  // Zwischenablage mit bestehender Formatierung einfügen
  const pasteFormatted = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            document.execCommand("insertHTML", false, html);
            handleInput();
            return;
          }
        }
      }
      // Fallback: nur Text verfügbar
      const text = await navigator.clipboard.readText();
      if (!text) return;
      document.execCommand("insertHTML", false, escapeHtml(text).replace(/\r?\n/g, "<br>"));
      handleInput();
    } catch {
      alert("Kein Zugriff auf die Zwischenablage. Bitte Strg+V verwenden.");
    }
  };

  return (
    <div className="glass-input rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/80">
        <ToolBtn onClick={() => exec("undo")} title="Rückgängig">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5L1 10"/>
          </svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("redo")} title="Wiederholen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.5L23 10"/>
          </svg>
        </ToolBtn>
        <Sep />
        {/* Einfügen: ohne / mit Formatierung */}
        <button onMouseDown={(e) => { e.preventDefault(); pastePlain(); }}
          title="Kopierten Text einfügen — Formatierung wird entfernt"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold text-slate-600 bg-white/70 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all h-6">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1"/>
          </svg>
          Text
        </button>
        <button onMouseDown={(e) => { e.preventDefault(); pasteFormatted(); }}
          title="Kopierten Text mit bestehender Formatierung einfügen"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold text-slate-600 bg-white/70 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all h-6">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
          <b>Format</b>
        </button>
        <Sep />
        <ToolBtn onClick={() => exec("bold")} title="Fett"><b>B</b></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Kursiv"><i>I</i></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Unterstrichen"><u>U</u></ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Durchgestrichen"><s>S</s></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Aufzählungsliste">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
        </ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Nummerierte Liste">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1.</text><text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2.</text><text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3.</text></svg>
        </ToolBtn>
        <Sep />
        <div className="flex items-center gap-0.5">
          {COLORS.map((c) => (
            <button key={c} onClick={() => exec("foreColor", c)} title={c}
              style={{ backgroundColor: c }}
              className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 hover:scale-110 transition-transform" />
          ))}
        </div>
        <Sep />
        <div className="flex items-center gap-0.5">
          {HIGHLIGHTS.map((c) => (
            <button key={c} onClick={() => exec("hiliteColor", c)} title="Markieren"
              style={{ backgroundColor: c === "transparent" ? "#f1f5f9" : c }}
              className="w-4 h-4 rounded border border-slate-300 flex-shrink-0 hover:scale-110 transition-transform text-[8px] flex items-center justify-center">
              {c === "transparent" ? "✕" : ""}
            </button>
          ))}
        </div>
        <Sep />
        <select onChange={(e) => {
          exec("fontSize", 3);
          const sel = window.getSelection();
          if (sel?.rangeCount) {
            const range = sel.getRangeAt(0);
            const span = document.createElement("span");
            span.style.fontSize = e.target.value;
            range.surroundContents(span);
            handleInput();
          }
        }} className="text-xs px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-600 h-6">
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Sep />
        <ToolBtn onClick={insertTable} title="Neue Tabelle">⊞</ToolBtn>
        <ToolBtn onClick={addTableRow} title="Zeile hinzufügen (Cursor in Zeile)">+Z</ToolBtn>
        <ToolBtn onClick={addTableCol} title="Spalte hinzufügen (Cursor in Zelle)">+S</ToolBtn>
        <ToolBtn onClick={removeTableRow} title="Zeile löschen (Cursor in Zeile)">-Z</ToolBtn>
        <ToolBtn onClick={removeTableCol} title="Spalte löschen (Cursor in Zelle)">-S</ToolBtn>
        <ToolBtn onClick={insertLink} title="Link">🔗</ToolBtn>
        <Sep />
        <ToolBtn onClick={insertTimestamp} title="Zeitmarke einfügen (Strg+T)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </ToolBtn>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="px-4 py-3 text-sm text-slate-700 focus:outline-none overflow-y-auto rich-editor"
      />

      <style>{`
        .rich-editor:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        .rich-editor table td { border: 1px solid #cbd5e1; padding: 4px 8px; }
        .rich-editor a { color: #3b82f6; text-decoration: underline; }
        .rich-editor ul { list-style-type: disc !important; padding-left: 1.5em !important; margin: 4px 0 !important; }
        .rich-editor ol { list-style-type: decimal !important; padding-left: 1.5em !important; margin: 4px 0 !important; }
        .rich-editor li { display: list-item !important; }
      `}</style>
    </div>
  );
});

export default RichEditor;

function ToolBtn({ onClick, title, children }) {
  return (
    <button onMouseDown={(e) => { e.preventDefault(); onClick(); }} title={title}
      className="px-1.5 py-0.5 rounded text-xs text-slate-600 hover:bg-slate-200 transition-all h-6 min-w-[22px] flex items-center justify-center">
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />;
}