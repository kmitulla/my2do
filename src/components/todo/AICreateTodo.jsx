import React, { useState } from "react";
import { addTodo } from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";

export default function AICreateTodo({ categories, onCreated, onClose }) {
  const { user, userProfile } = useFirebaseAuth();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apiKey = userProfile?.openaiKey;

  const handleGenerate = async () => {
    if (!input.trim() || !apiKey) return;
    setLoading(true);
    setError("");
    try {
      const today = new Date().toISOString().split("T")[0];
      const systemPrompt = `Du bist ein Aufgaben-Assistent. Heute ist ${today}.
Extrahiere aus dem folgenden Text ALLE Informationen und erstelle eine strukturierte Aufgabe auf Deutsch.
WICHTIG: Gehe kein Detail verloren! Schreibe alles Relevante in die Beschreibung, auch wenn es viel ist.
Antworte ausschliesslich mit einem validen JSON-Objekt mit diesen Feldern:
- title: string (praegnanter Titel, max 80 Zeichen)
- description: string (AUSFUEHRLICHE HTML-Beschreibung mit allen Details, Kontext, Personen, Hintergruenden etc. Nutze <br> fuer Zeilenumbrueche und <b> fuer wichtige Begriffe. Lass NICHTS weg.)
- prio: string (genau "A" fuer dringend/wichtig, "B" fuer normal, "C" fuer niedrig)
- deadline: string im Format YYYY-MM-DDTHH:mm (berechne relativ zu heute ${today}) oder null
- wiedervorlage: string im Format YYYY-MM-DDTHH:mm oder null
- status: string (immer "offen")
- category: string (leer wenn nicht erwaehnt)
Kein Markdown, kein erklaerende Text, nur das JSON-Objekt.`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) throw new Error("API-Fehler: " + res.status);
      const data = await res.json();
      const text = data.choices[0].message.content;
      const json = JSON.parse(text);

      await addTodo(user.uid, {
        title: json.title || "Neue Aufgabe",
        description: json.description || "",
        prio: json.prio || "B",
        status: "offen",
        category: json.category || "",
        deadline: json.deadline ? new Date(json.deadline) : null,
        wiedervorlage: json.wiedervorlage ? new Date(json.wiedervorlage) : null,
        emailTitle: "",
        emailBody: "",
        archived: false,
      });
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError("Fehler: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="w-full sm:max-w-lg bg-white/90 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-white/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-lg">✦</div>
          <h2 className="text-base font-bold text-slate-800">KI-Notiz erstellen</h2>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Beschreibe deine Aufgabe frei – die KI erstellt daraus eine strukturierte Notiz.</p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder="z.B. 'Morgen Präsentation vorbereiten für das Meeting am Freitag, sehr wichtig, Chef muss das bis Do. haben...'"
          className="w-full px-4 py-3 rounded-2xl bg-white/80 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 resize-none"
        />
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        {!apiKey && <p className="text-xs text-amber-500 mt-2">⚠️ Bitte erst OpenAI API-Key in den Einstellungen hinterlegen.</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-sm font-medium">Abbrechen</button>
          <button onClick={handleGenerate} disabled={loading || !input.trim() || !apiKey}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-lg disabled:opacity-40">
            {loading ? "Erstelle..." : "✦ KI erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}