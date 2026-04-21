import React, { useRef, useEffect, useCallback } from "react";

// Simple rich text editor using contentEditable with execCommand
const COLORS = ["#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];
const HIGHLIGHTS = ["transparent", "#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px"];

export default function RichEditor({ value, onChange, placeholder, minHeight = 160 }) {
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

  const insertTable = () => {
    const table = `<table style="border-collapse:collapse;width:100%;margin:8px 0"><tr><td style="border:1px solid #cbd5e1;padding:4px 8px">Spalte 1</td><td style="border:1px solid #cbd5e1;padding:4px 8px">Spalte 2</td><td style="border:1px solid #cbd5e1;padding:4px 8px">Spalte 3</td></tr><tr><td style="border:1px solid #cbd5e1;padding:4px 8px">&nbsp;</td><td style="border:1px solid #cbd5e1;padding:4px 8px">&nbsp;</td><td style="border:1px solid #cbd5e1;padding:4px 8px">&nbsp;</td></tr></table><br/>`;
    document.execCommand("insertHTML", false, table);
    handleInput();
  };

  const insertLink = () => {
    const url = prompt("URL eingeben:");
    if (url) exec("createLink", url);
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white/80">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/80">
        {/* Basic */}
        <ToolBtn onClick={() => exec("bold")} title="Fett"><b>B</b></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Kursiv"><i>I</i></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Unterstrichen"><u>U</u></ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Durchgestrichen"><s>S</s></ToolBtn>
        <Sep />
        {/* Lists */}
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Liste">• —</ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Numm.">1.</ToolBtn>
        <Sep />
        {/* Color */}
        <div className="flex items-center gap-0.5">
          {COLORS.map((c) => (
            <button key={c} onClick={() => exec("foreColor", c)} title={c}
              style={{ backgroundColor: c }}
              className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0 hover:scale-110 transition-transform" />
          ))}
        </div>
        <Sep />
        {/* Highlight */}
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
        {/* Font size */}
        <select onChange={(e) => {
          exec("fontSize", 3);
          // Apply via span since execCommand fontSize is limited
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
        {/* Table & Link */}
        <ToolBtn onClick={insertTable} title="Tabelle">⊞</ToolBtn>
        <ToolBtn onClick={insertLink} title="Link">🔗</ToolBtn>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
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
      `}</style>
    </div>
  );
}

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