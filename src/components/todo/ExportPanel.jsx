import React, { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

export default function ExportPanel({ todos, categories }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [filterCat, setFilterCat] = useState("");

  const filtered = filterTodos(todos, from, to, { status: filterStatus, prio: filterPrio, category: filterCat });

  return (
    <div className="space-y-4">
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Export-Filter</h3>

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