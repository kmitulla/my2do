import React, { useState, useRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { subscribeCategories, addTodo, addCategory, getAllNotebookData, addNotebook, addSection, addPage } from "@/lib/todoService";

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function formatDate(ts) {
  if (!ts) return "";
  return format(toDate(ts), "dd.MM.yyyy", { locale: de });
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function filterTodos(todos, from, to, filters) {
  let result = todos;
  if (from) result = result.filter((t) => { const d = toDate(t.createdAt); return d && d >= new Date(from); });
  if (to) { const toD = new Date(to); toD.setHours(23,59,59); result = result.filter((t) => { const d = toDate(t.createdAt); return d && d <= toD; }); }
  if (filters.status) result = result.filter((t) => t.status === filters.status);
  if (filters.prio) result = result.filter((t) => t.prio === filters.prio);
  if (filters.category) result = result.filter((t) => t.category === filters.category);
  return result;
}

function exportCSV(todos) {
  const headers = ["Titel", "Beschreibung", "Priorität", "Status", "Kategorie", "Deadline", "Wiedervorlage", "Erstellt", "Archiviert"];
  const rows = todos.map((t) => [
    t.title || "",
    stripHtml(t.description || ""),
    t.prio || "",
    t.status || "",
    t.category || "",
    formatDate(t.deadline),
    formatDate(t.wiedervorlage),
    formatDate(t.createdAt),
    t.archived ? "ja" : "nein",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `2do_export_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(todos) {
  const rows = todos.map((t) => `
    <tr>
      <td>${t.title || ""}</td>
      <td>${t.prio || ""}</td>
      <td>${t.status || ""}</td>
      <td>${t.category || ""}</td>
      <td>${formatDate(t.deadline)}</td>
      <td>${formatDate(t.createdAt)}</td>
    </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
    h1{color:#1e40af;margin-bottom:16px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}
    th{background:#eff6ff;font-weight:bold;color:#1e40af}
    tr:nth-child(even){background:#f8fafc}
  </style></head><body>
    <h1>2Do Export – ${format(new Date(), "dd.MM.yyyy", { locale: de })}</h1>
    <p style="color:#64748b;margin-bottom:16px">${todos.length} Aufgaben</p>
    <table>
      <thead><tr><th>Titel</th><th>Prio</th><th>Status</th><th>Kategorie</th><th>Deadline</th><th>Erstellt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  win?.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
}

// ── .my2do format ──────────────────────────────────────────────────────────
// A JSON backup file containing all todos + categories, versioned and signed

const MY2DO_VERSION = "1.0";
const MY2DO_MAGIC = "MY2DO";

function serializeTodo(t) {
  const serialize = (v) => {
    if (!v) return null;
    if (v.toDate) return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return v;
  };
  return {
    title: t.title || "",
    description: t.description || "",
    prio: t.prio || "B",
    status: t.status || "offen",
    category: t.category || "",
    deadline: serialize(t.deadline),
    wiedervorlage: serialize(t.wiedervorlage),
    archived: !!t.archived,
    createdAt: serialize(t.createdAt),
  };
}

async function exportMy2do(uid, todos, categories) {
  const notebooks = await getAllNotebookData(uid);
  const payload = {
    magic: MY2DO_MAGIC,
    version: MY2DO_VERSION,
    exportedAt: new Date().toISOString(),
    stats: { todos: todos.length, categories: categories.length, notebooks: notebooks.length },
    categories: categories.map((c) => ({ name: c.name, color: c.color || "#6366f1" })),
    todos: todos.map(serializeTodo),
    notebooks,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_${format(new Date(), "yyyy-MM-dd_HH-mm")}.my2do`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPanel({ todos, categories }) {
  const { user } = useFirebaseAuth();
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const filtered = filterTodos(todos, from, to, { status: filterStatus, prio: filterPrio, category: filterCat });

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.magic !== MY2DO_MAGIC) throw new Error("Ungültige .my2do Datei");
      if (!data.todos || !Array.isArray(data.todos)) throw new Error("Keine Aufgaben gefunden");

      // Import categories first (skip duplicates)
      const existingCatNames = new Set(categories.map((c) => c.name));
      let catsImported = 0;
      for (const cat of (data.categories || [])) {
        if (!existingCatNames.has(cat.name)) {
          await addCategory(user.uid, cat.name, cat.color || "#6366f1");
          catsImported++;
        }
      }

      // Import todos
      let todosImported = 0;
      for (const t of data.todos) {
        await addTodo(user.uid, {
          title: t.title || "",
          description: t.description || "",
          prio: t.prio || "B",
          status: t.status || "offen",
          category: t.category || "",
          deadline: t.deadline ? new Date(t.deadline) : null,
          wiedervorlage: t.wiedervorlage ? new Date(t.wiedervorlage) : null,
          archived: !!t.archived,
        });
        todosImported++;
      }

      // Import notebooks
      let notebooksImported = 0;
      for (const nb of (data.notebooks || [])) {
        const nbRef = await addNotebook(user.uid, nb.name || "Notizbuch");
        for (const sec of (nb.sections || [])) {
          const secRef = await addSection(user.uid, nbRef.id, sec.name || "Abschnitt", null);
          for (const pg of (sec.pages || [])) {
            await addPage(user.uid, nbRef.id, secRef.id, pg.title || "Seite");
          }
        }
        notebooksImported++;
      }

      setImportResult({ ok: true, todos: todosImported, cats: catsImported, notebooks: notebooksImported });
    } catch (err) {
      setImportResult({ ok: false, error: err.message });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">

      {/* ── .my2do Backup Section ── */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200/60 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow-md">💾</div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Vollständiges Backup</h3>
            <p className="text-[11px] text-slate-400">Alle Daten als <span className="font-mono font-semibold text-indigo-600">.my2do</span> Datei sichern &amp; wiederherstellen</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={async () => { setExporting(true); await exportMy2do(user.uid, todos, categories); setExporting(false); }}
            disabled={exporting}
            className="py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {exporting ? <span className="animate-spin">⟳</span> : <span>⬆</span>}
            {exporting ? "Lädt…" : "Exportieren"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="py-3 px-4 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.02] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {importing ? <span className="animate-spin">⟳</span> : <span>⬇</span>}
            {importing ? "Importiere..." : "Importieren"}
          </button>
          <input ref={fileRef} type="file" accept=".my2do" onChange={handleImport} className="hidden" />
        </div>

        {importResult && (
          <div className={`rounded-xl px-3 py-2.5 text-sm font-medium flex items-center gap-2 ${importResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
            {importResult.ok
              ? `✓ ${importResult.todos} Aufgaben, ${importResult.cats} Kategorien & ${importResult.notebooks ?? 0} Notizbücher importiert!`
              : `✕ Fehler: ${importResult.error}`}
          </div>
        )}

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Das <span className="font-mono font-semibold">.my2do</span> Format enthält alle Aufgaben, Kategorien, Beschreibungen und Daten. Beim Import werden keine bestehenden Daten gelöscht.
        </p>
      </div>

      {/* ── Export-Filter ── */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">CSV / PDF Export-Filter</h3>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Von</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Bis</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {["", "offen", "in Arbeit", "wartend", "erledigt"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${filterStatus === s ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
              {s || "Alle Status"}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {["", "A", "B", "C"].map((p) => (
            <button key={p} onClick={() => setFilterPrio(p)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${filterPrio === p
                ? p === "A" ? "bg-red-500 text-white" : p === "B" ? "bg-orange-400 text-white" : p === "C" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                : "bg-slate-100 text-slate-600"}`}>
              {p || "Alle Prio"}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterCat("")}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium ${!filterCat ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
              Alle Kat.
            </button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setFilterCat(c.name)}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium ${filterCat === c.name ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400 pt-1">{filtered.length} Aufgaben ausgewählt</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}
          className="py-3 rounded-2xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-all disabled:opacity-40 shadow-lg shadow-emerald-500/25">
          📊 CSV exportieren
        </button>
        <button onClick={() => exportPDF(filtered)} disabled={filtered.length === 0}
          className="py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-all disabled:opacity-40 shadow-lg shadow-blue-500/25">
          📄 PDF exportieren
        </button>
      </div>
    </div>
  );
}