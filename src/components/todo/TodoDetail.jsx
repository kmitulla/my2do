import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  updateTodo, deleteTodo, addCategory, shareTodo, getAllUsers,
  subscribeDocLive, todoLockPath, lockedByOther, splitSharedData,
} from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { canOpenWindows, openInWindow } from "@/lib/desktop";
import useEditLock from "@/hooks/useEditLock";
import { format } from "date-fns";
import { Minus, X, AppWindow, Users, Lock, Save, Clock, Mail, CalendarPlus, FileText, Archive, Trash2 } from "lucide-react";
import RichEditor from "./RichEditor";
import QuickDateButtons from "./QuickDateButtons";
import useConfirmReset from "@/hooks/useConfirmReset";
import SyncIndicator from "./SyncIndicator";
import TimestampInfo from "./TimestampInfo";
import FavoriteButton from "./FavoriteButton";

const STATUSES = ["offen", "in Arbeit", "wartend", "erledigt"];
const PRIOS = ["A", "B", "C"];
const PRIO_STYLES = { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" };
const PRIO_BTN = {
  A: { active: "bg-red-500 text-white shadow-md shadow-red-500/25", base: "glass-chip text-slate-500" },
  B: { active: "bg-orange-400 text-white shadow-md shadow-orange-400/25", base: "glass-chip text-slate-500" },
  C: { active: "bg-emerald-500 text-white shadow-md shadow-emerald-500/25", base: "glass-chip text-slate-500" },
};
const STATUS_BTN = {
  "offen": { active: "bg-slate-600 text-white", base: "glass-chip text-slate-500" },
  "in Arbeit": { active: "bg-blue-500 text-white", base: "glass-chip text-slate-500" },
  "wartend": { active: "bg-amber-400 text-white", base: "glass-chip text-slate-500" },
  "erledigt": { active: "bg-emerald-500 text-white", base: "glass-chip text-slate-500" },
};

const Label = ({ children, icon }) => (
  <label className="section-label mb-1.5 flex items-center gap-1.5">{icon}{children}</label>
);

/**
 * Editor für ein 2do.
 * layout "modal": Blatt im Dashboard (einspaltig) · "window": eigenes Fenster
 * (zweispaltig: links Titel + Beschreibung, rechts Eigenschaften).
 */
export default function TodoDetail({ todo, categories, onClose, onDelete, onMinimize, initialDraft, layout = "modal" }) {
  const { user, userProfile } = useFirebaseAuth();
  const isWindow = layout === "window";
  const [form, setForm] = useState(
    initialDraft
      ? { ...initialDraft }
      : { ...todo, tags: todo.tags || (todo.category ? [todo.category] : []) }
  );
  const [saving, setSaving] = useState(false);
  const [savingStay, setSavingStay] = useState(false);
  // "Zuletzt geändert" für die Header-Anzeige: startet mit dem gespeicherten
  // Stand, wird bei "Speichern & bleiben" auf die lokale Speicherzeit gesetzt
  const [lastUpdated, setLastUpdated] = useState(todo.updatedAt);
  const [savedFlash, setSavedFlash] = useState(false);
  // Favorit wird sofort gespeichert (nicht erst mit "Speichern")
  const [favorite, setFavorite] = useState(!!todo.favorite);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Klick irgendwo anders → "Wirklich?"-Zustand zurücksetzen
  const deleteBtnRef = useConfirmReset(confirmDelete, () => setConfirmDelete(false));
  const archiveBtnRef = useConfirmReset(confirmArchive, () => setConfirmArchive(false));
  const [newCat, setNewCat] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);

  // Senden / Mitbearbeiter
  const myName = userProfile?.displayName || user.displayName || user.email;
  const [sharedId, setSharedId] = useState(todo.sharedId || null);
  const [showShare, setShowShare] = useState(false);
  const [allUsers, setAllUsers] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUids, setSelectedUids] = useState([]);
  const [sharing, setSharing] = useState(false);
  // null | "done" | "queued"
  const [shareResult, setShareResult] = useState(null);

  // Bearbeitungssperre: ein 2do ist immer nur in einem Editor bearbeitbar –
  // egal ob eine andere Person (geteilt), ein zweites Fenster oder ein
  // anderes Gerät es gerade offen hat
  const lockPath = useMemo(() => todoLockPath(user.uid, { id: todo.id, sharedId }), [user.uid, todo.id, sharedId]);
  const { lockState, live, otherLock, takeOver } = useEditLock({ path: lockPath, uid: user.uid, name: myName, initial: todo });
  // Bei geteilten 2dos zusätzlich das eigene Dokument (Tags, Wiedervorlage)
  const [ownLive, setOwnLive] = useState(null);
  useEffect(() => {
    if (!sharedId) return;
    return subscribeDocLive(["users", user.uid, "todos", todo.id], setOwnLive);
  }, [sharedId, user.uid, todo.id]);

  const commonLocked = lockState === "other";
  // Eigene Sperre aus anderem Fenster/Gerät → alles nur lesen (auch Tags)
  const ownLock = commonLocked && otherLock?.uid === user.uid;
  const allLocked = commonLocked && (!sharedId || ownLock);
  const liveRef = useRef(live);
  liveRef.current = live;

  // Track if dirty (for auto-save vs X close)
  const isDirtyRef = useRef(false);
  const richEditorRef = useRef(null);

  // Block horizontal scroll on the modal completely
  useEffect(() => {
    if (isWindow) return;
    const handler = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!handler._sx) return;
      const dx = Math.abs(t.clientX - handler._sx);
      const dy = Math.abs(t.clientY - handler._sy);
      if (dx > dy && dx > 5) e.preventDefault();
    };
    const down = (e) => {
      if (e.touches.length === 1) {
        handler._sx = e.touches[0].clientX;
        handler._sy = e.touches[0].clientY;
      }
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", handler, { passive: false });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchmove", handler);
    };
  }, [isWindow]);

  // Solange woanders bearbeitet wird: Inhalt live mitlaufen lassen, damit man
  // nach der Freigabe auf dem neuesten Stand weiterarbeitet
  useEffect(() => {
    if (lockState !== "other" || !live) return;
    const { common, personal } = splitSharedData(live);
    const personalLive = sharedId ? (ownLive ? splitSharedData(ownLive).personal : {}) : personal;
    setForm((f) => ({ ...f, ...common, ...(allLocked ? personalLive : {}) }));
  }, [live, ownLive, lockState, allLocked, sharedId]);

  useEffect(() => {
    if (initialDraft) {
      setForm({ ...initialDraft });
      isDirtyRef.current = true;
    } else {
      setForm({ ...todo, tags: todo.tags || (todo.category ? [todo.category] : []) });
      isDirtyRef.current = false;
    }
    setLastUpdated(todo.updatedAt);
    setFavorite(!!todo.favorite);
  }, [todo]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    isDirtyRef.current = true;
  };

  const buildSaveData = () => {
    const data = { ...form };
    // Favorit wird separat (sofort) gespeichert — ein älterer Formular- oder
    // Entwurfsstand darf ihn beim Speichern nicht überschreiben
    delete data.favorite;
    delete data.favoritedAt;
    delete data.editLock;
    ["deadline", "wiedervorlage"].forEach((k) => {
      if (data[k] && typeof data[k] === "string") data[k] = new Date(data[k]);
      if (data[k] === "") data[k] = null;
    });
    return data;
  };

  // Gesperrt → nur die persönlichen Felder (Tags, Wiedervorlage) speichern
  const persist = () => {
    if (allLocked) return false;
    const ok = updateTodo(user.uid, todo.id, buildSaveData(), { personalOnly: commonLocked });
    if (!ok) {
      const lock = lockedByOther(liveRef.current);
      alert(lock?.uid === user.uid
        ? "Dieses 2do ist gerade in einem anderen Fenster geöffnet – die Änderungen konnten nicht gespeichert werden."
        : `${lock?.name || "Jemand"} bearbeitet dieses 2do gerade – deine Änderungen an Titel, Status & Co. konnten nicht gespeichert werden.`);
    }
    return ok;
  };

  // Speichern & schließen
  const save = async () => {
    if (allLocked) { onClose(); return; }
    setSaving(true);
    const ok = persist();
    setSaving(false);
    if (ok) onClose();
  };

  // Speichern ohne zu schließen
  const saveOnly = async () => {
    if (savingStay || saving || allLocked) return;
    setSavingStay(true);
    persist();
    isDirtyRef.current = false;
    setLastUpdated(new Date());
    setSavingStay(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  };

  // Minimieren: ungespeicherte Änderungen als Entwurf an Parent geben
  const handleMinimize = () => {
    onMinimize?.({ ...form });
  };

  // In eigenem Fenster weiterarbeiten: aktuellen Stand speichern, Editor hier
  // schließen (gibt die Sperre frei) – das Fenster übernimmt
  const canPopOut = !isWindow && canOpenWindows();
  const popOut = () => {
    if (isDirtyRef.current && !allLocked) persist();
    isDirtyRef.current = false;
    openInWindow(`/todo/${todo.id}`, "todo", form.title);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteTodo(user.uid, todo.id);
    onDelete?.();
    onClose();
  };

  const handleArchive = async () => {
    if (commonLocked) return;
    if (!confirmArchive) { setConfirmArchive(true); return; }
    if (!updateTodo(user.uid, todo.id, { archived: true, status: "erledigt" })) return;
    onClose();
  };

  const insertTimestampInDescription = () => {
    richEditorRef.current?.insertTimestamp();
  };

  const addNewCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await addCategory(user.uid, name, "#6366f1");
    // neuen Tag direkt setzen
    if (!(form.tags || []).includes(name)) set("tags", [...(form.tags || []), name]);
    setNewCat("");
    setShowNewCat(false);
  };

  const openCalendar = () => {
    const title = form.title || "Aufgabe";
    const deadlineDate = form.deadline
      ? (form.deadline.toDate ? form.deadline.toDate() : new Date(form.deadline))
      : new Date();
    const endDate = new Date(deadlineDate.getTime() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const fmtIcs = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const cleanDesc = (form.description || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n/g, "\\n");
    const manualStatusLine = form.manualStatus ? `\\nEigener Status: ${form.manualStatus}` : "";
    const notes = `Priorität: ${form.prio || "B"}\\nStatus: ${form.status || "offen"}${manualStatusLine}\\nKategorie: ${form.category || "–"}\\nDeadline: ${form.deadline ? format(deadlineDate, "dd.MM.yyyy HH:mm") : "–"}\\n\\n${cleanDesc}`;
    // Build .ics content – opens in Outlook on PC, default calendar on iPhone
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:${title}`,
      `DTSTART:${fmtIcs(deadlineDate)}`,
      `DTEND:${fmtIcs(endDate)}`,
      `DESCRIPTION:${notes}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openEmailClient = () => {
    const subject = encodeURIComponent(form.title || "");
    const cleanDesc = (form.description || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const deadlineDate = form.deadline ? (form.deadline.toDate ? form.deadline.toDate() : new Date(form.deadline)) : null;
    const wiedervorlageDate = form.wiedervorlage ? (form.wiedervorlage.toDate ? form.wiedervorlage.toDate() : new Date(form.wiedervorlage)) : null;
    const info = [
      "",
      "---",
      `Priorität: ${form.prio || "–"}`,
      `Status: ${form.status || "–"}`,
      ...(form.manualStatus ? [`Eigener Status: ${form.manualStatus}`] : []),
      `Kategorie: ${form.category || "–"}`,
      `Deadline: ${deadlineDate ? format(deadlineDate, "dd.MM.yyyy HH:mm") : "–"}`,
      `Wiedervorlage: ${wiedervorlageDate ? format(wiedervorlageDate, "dd.MM.yyyy HH:mm") : "–"}`,
    ].join("\n");
    const body = encodeURIComponent(cleanDesc + info);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  // Aktuelles 2do als Word-Datei (.docx) herunterladen.
  // docx-Bibliothek wird erst beim Klick nachgeladen (kleines Haupt-Bundle).
  const exportWord = async () => {
    if (exportingWord) return;
    setExportingWord(true);
    try {
      const { exportTodoToDocx } = await import("@/lib/docxExport");
      await exportTodoToDocx({
        ...form, // aktueller Stand inkl. noch nicht gespeicherter Änderungen
        createdAt: todo.createdAt,
        updatedAt: lastUpdated,
      });
    } catch (err) {
      console.error("Word-Export fehlgeschlagen:", err);
      alert("Word-Export fehlgeschlagen: " + (err?.message || err));
    } finally {
      setExportingWord(false);
    }
  };

  const openShare = async () => {
    setShowShare(true);
    setShareResult(null);
    if (allUsers) return;
    try {
      const users = await getAllUsers();
      setAllUsers(users
        .filter((u) => u.id !== user.uid)
        .sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "", "de")));
    } catch (err) {
      console.error("User laden fehlgeschlagen:", err);
      setAllUsers([]);
    }
  };

  const closeShare = () => {
    setShowShare(false);
    setSelectedUids([]);
    setUserSearch("");
  };

  const toggleUser = (uid) => {
    setSelectedUids((prev) => prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]);
  };

  const members = (sharedId && live?.collaborators) || [];
  const shareCandidates = (allUsers || []).filter((u) => {
    if (members.includes(u.id)) return false;
    const q = userSearch.trim().toLowerCase();
    return !q || (u.displayName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  // Senden = aktuellen Stand speichern + Empfänger als Mitbearbeiter eintragen
  const handleShare = async () => {
    if (selectedUids.length === 0 || sharing) return;
    setSharing(true);
    try {
      const data = { ...buildSaveData(), id: todo.id };
      if (todo.createdAt) data.createdAt = todo.createdAt;
      if (isDirtyRef.current && !allLocked) {
        updateTodo(user.uid, todo.id, data, { personalOnly: commonLocked });
        isDirtyRef.current = false;
      }
      const recipients = selectedUids.map((uid) => {
        const u = allUsers.find((x) => x.id === uid);
        return { uid, name: u?.displayName || u?.email || "Unbekannt" };
      });
      const result = await shareTodo(user.uid, myName, data, recipients);
      if (!sharedId) setSharedId(todo.id);
      setShareResult(result);
      setSelectedUids([]);
      setUserSearch("");
      setTimeout(() => { setShowShare(false); setShareResult(null); }, 1800);
    } catch (err) {
      console.error("Senden fehlgeschlagen:", err);
      alert("Fehler beim Senden: " + (err?.message || err));
    } finally {
      setSharing(false);
    }
  };

  // Tastenkürzel im Editor: Strg+S speichern, Strg+Enter speichern & schließen,
  // Esc schließen (ungespeicherte Änderungen werden vorher gespeichert)
  const keyActionsRef = useRef({});
  keyActionsRef.current = { saveOnly, save, showShare, closeShare };
  useEffect(() => {
    const onKey = (e) => {
      const a = keyActionsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        a.saveOnly();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        a.save();
      } else if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        if (a.showShare) a.closeShare();
        else if (isDirtyRef.current) a.save();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Bausteine ──────────────────────────────────────────────────────────────
  const lockBadge = sharedId && (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      lockState === "mine" ? "bg-emerald-100 text-emerald-700"
        : lockState === "other" ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-500"
    }`}>
      {lockState === "mine" ? "Du bearbeitest" : lockState === "other" ? "Gesperrt" : lockState === "offline" ? "Offline" : "…"}
    </span>
  );

  const membersBlock = sharedId && (
    <div className={isWindow ? "glass rounded-[18px] p-3.5" : "rounded-2xl bg-sky-50/70 border border-sky-100 px-3 py-2.5"}>
      <div className="flex items-center gap-2">
        <span className="text-sky-500 flex-shrink-0"><Users size={14} /></span>
        <span className="section-label flex-1">Mitbearbeiter</span>
        {lockBadge}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {members.map((uid) => {
          const name = uid === user.uid ? "Du" : (live?.memberNames?.[uid] || "Unbekannt");
          const editing = otherLock?.uid === uid || (uid === user.uid && lockState === "mine");
          return (
            <span key={uid} title={live?.sharedBy === uid ? "Hat das 2do gesendet" : ""}
              className={`inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full text-[11px] font-medium border ${
                editing ? "bg-white border-emerald-300 text-emerald-700" : "bg-white/80 border-slate-200 text-slate-600"
              }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                uid === user.uid ? "bg-gradient-to-br from-blue-400 to-indigo-500" : "bg-gradient-to-br from-sky-400 to-cyan-500"
              }`}>{name[0]?.toUpperCase()}</span>
              {name}
              {live?.sharedBy === uid && <span className="text-amber-500" aria-hidden>★</span>}
              {editing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </span>
          );
        })}
        <button onClick={openShare}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100">
          + Hinzufügen
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-snug">
        Gemeinsam: Titel, Beschreibung, Status, Priorität, Deadline &amp; Archiv · Nur für dich: Tags, Wiedervorlage &amp; Favorit
      </p>
    </div>
  );

  const lockBanner = commonLocked && (
    <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50/90 border border-amber-200 px-3 py-2.5">
      <span className="text-amber-600 mt-0.5 flex-shrink-0"><Lock size={15} /></span>
      {ownLock ? (
        <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex-1 min-w-[180px] text-xs text-amber-800 leading-snug">
            Dieses 2do ist gerade <b>in einem anderen Fenster oder auf einem anderen Gerät</b> geöffnet und wird hier nur angezeigt.
          </p>
          <button onClick={takeOver}
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold shadow-sm hover:bg-amber-600">
            Hier bearbeiten
          </button>
        </div>
      ) : (
        <div className="text-xs text-amber-800 leading-snug">
          <b>{otherLock?.name || "Jemand"}</b> bearbeitet dieses 2do gerade.
          Titel, Beschreibung, Status &amp; Co. sind solange gesperrt und laufen live mit –
          Tags und Wiedervorlage kannst du trotzdem ändern. Sobald frei, kannst du automatisch weiterarbeiten.
        </div>
      )}
    </div>
  );

  const sharePanel = showShare && (
    <div className="rounded-2xl bg-white/90 border border-indigo-200 shadow-sm p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-indigo-500"><Users size={15} /></span>
        <span className="text-sm font-semibold text-slate-700 flex-1">
          {sharedId ? "Mitbearbeiter hinzufügen" : "An andere senden"}
        </span>
        <button onClick={closeShare} title="Schließen (Esc)" className="btn-icon btn-icon-sm"><X size={14} /></button>
      </div>
      {shareResult ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-700 font-medium">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {shareResult === "done"
            ? "Gesendet! Erscheint bei den Empfängern in der Inbox."
            : "Gespeichert – wird gesendet, sobald du wieder online bist."}
        </div>
      ) : (
        <>
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus
            placeholder="Name oder E-Mail suchen…"
            className="w-full px-3 py-2 rounded-xl glass-input text-sm" />
          <div className="max-h-48 overflow-y-auto -mx-1 px-1 space-y-0.5">
            {allUsers === null && <p className="text-xs text-slate-400 py-2 text-center">Lade Personen…</p>}
            {allUsers !== null && shareCandidates.length === 0 && (
              <p className="text-xs text-slate-400 py-2 text-center">Keine weiteren Personen gefunden.</p>
            )}
            {shareCandidates.map((u) => {
              const sel = selectedUids.includes(u.id);
              const name = u.displayName || u.email || "Unbekannt";
              return (
                <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left transition-all ${
                    sel ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-slate-50"
                  }`}>
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {name[0].toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-slate-700 truncate">{name}</span>
                    {u.email && u.email !== name && <span className="block text-[10px] text-slate-400 truncate">{u.email}</span>}
                  </span>
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    sel ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-300"
                  }`}>
                    {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">
            Empfänger werden <b>Mitbearbeiter</b>: Titel, Beschreibung, Status, Priorität, Deadline &amp; Archiv sind gemeinsam.
            Tags, Wiedervorlage &amp; Favoriten setzt jeder für sich.
          </p>
          <button onClick={handleShare} disabled={selectedUids.length === 0 || sharing}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold btn-liquid disabled:opacity-50">
            {sharing ? "Sende…" : selectedUids.length ? `Senden an ${selectedUids.length} ${selectedUids.length === 1 ? "Person" : "Personen"}` : "Personen auswählen"}
          </button>
        </>
      )}
    </div>
  );

  const card = (content) => (isWindow ? <div className="glass rounded-[18px] p-3.5">{content}</div> : content);

  const statusBlock = card(
    <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
      <Label>Status</Label>
      <div className="flex gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => set("status", s)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${form.status === s ? STATUS_BTN[s].active : STATUS_BTN[s].base}`}>
            {s}
          </button>
        ))}
      </div>
      {/* Eigener / individueller Status — freier Text, optional */}
      <div className="relative mt-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-violet-500" />
        <input
          value={form.manualStatus || ""}
          onChange={(e) => set("manualStatus", e.target.value)}
          placeholder="Eigener Status … (optional)"
          maxLength={80}
          className="w-full pl-7 pr-3 py-2 rounded-xl bg-violet-50/70 border border-violet-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
        />
      </div>
    </fieldset>
  );

  const wiedervorlageBlock = card(
    <fieldset disabled={allLocked} className="min-w-0 disabled:opacity-60">
      <Label icon={<Clock size={12} />}>Wiedervorlage</Label>
      <QuickDateButtons value={form.wiedervorlage} onChange={(v) => set("wiedervorlage", v)} />
    </fieldset>
  );

  const titleBlock = isWindow ? (
    <fieldset disabled={commonLocked} className="min-w-0">
      <input value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Titel"
        className="w-full px-1 py-1 bg-transparent border-0 border-b-2 border-transparent focus:border-indigo-300 focus:outline-none text-2xl font-semibold text-slate-800 placeholder-slate-300 tracking-tight disabled:opacity-70" />
    </fieldset>
  ) : (
    <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-70">
      <Label>Titel *</Label>
      <input value={form.title || ""} onChange={(e) => set("title", e.target.value)}
        className="w-full px-4 py-2.5 rounded-2xl glass-input text-slate-800 text-[15px]" />
    </fieldset>
  );

  const descriptionBlock = (
    <div className={commonLocked ? "opacity-80" : ""}>
      {!isWindow && <Label>Beschreibung</Label>}
      <RichEditor
        ref={richEditorRef}
        value={form.description || ""}
        onChange={(v) => set("description", v)}
        placeholder="Beschreibung eingeben…"
        minHeight={isWindow ? 460 : 200}
        readOnly={commonLocked}
      />
    </div>
  );

  const prioBlock = card(
    <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
      <Label>Priorität</Label>
      <div className="flex gap-2">
        {PRIOS.map((p) => (
          <button key={p} type="button" onClick={() => set("prio", p)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${form.prio === p ? PRIO_BTN[p].active : PRIO_BTN[p].base}`}>
            {p}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const tagsBlock = card(
    <fieldset disabled={allLocked} className="min-w-0 disabled:opacity-60">
      <Label>Tags</Label>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const active = (form.tags || []).includes(c.name);
          return (
            <button key={c.id} type="button"
              onClick={() => {
                const current = form.tags || [];
                set("tags", active ? current.filter((t) => t !== c.name) : [...current, c.name]);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                active ? "bg-indigo-500 text-white border-indigo-500 shadow-sm" : "bg-white/80 text-slate-600 border-slate-200 hover:border-indigo-300"
              }`}>
              {active && <span className="mr-1">✓</span>}{c.name}
            </button>
          );
        })}
        <button onClick={() => setShowNewCat(!showNewCat)} type="button"
          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-all">
          + Neuer Tag
        </button>
      </div>
      {showNewCat && (
        <div className="flex gap-2 mt-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Tag-Name" autoFocus
            className="flex-1 min-w-0 px-3 py-2 rounded-xl glass-input text-sm"
            onKeyDown={(e) => e.key === "Enter" && addNewCategory()} />
          <button onClick={addNewCategory} className="px-3 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold">OK</button>
        </div>
      )}
    </fieldset>
  );

  const deadlineBlock = card(
    <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
      <Label icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}>
        Deadline
      </Label>
      <QuickDateButtons value={form.deadline} onChange={(v) => set("deadline", v)} withTime />
    </fieldset>
  );

  const exportBlock = card(
    <div className={isWindow ? "" : "border-t border-slate-200/60 pt-4"}>
      <Label icon={<Mail size={12} />}>Weitergeben</Label>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={openEmailClient} title="E-Mail mit Titel als Betreff"
          className="py-2.5 rounded-xl glass-chip text-slate-700 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:text-indigo-600">
          <Mail size={15} /> E-Mail
        </button>
        <button onClick={openCalendar} title="Kalendertermin (.ics) – öffnet Outlook / iPhone-Kalender"
          className="py-2.5 rounded-xl glass-chip text-slate-700 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:text-emerald-600">
          <CalendarPlus size={15} /> Kalender
        </button>
        <button onClick={exportWord} disabled={exportingWord} title="Als Word-Datei (.docx) exportieren"
          className="py-2.5 rounded-xl glass-chip text-slate-700 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:text-blue-600 disabled:opacity-60">
          {exportingWord
            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
            : <FileText size={15} />}
          {exportingWord ? "…" : "Word"}
        </button>
      </div>
    </div>
  );

  const headerActions = (
    <>
      <button onClick={showShare ? closeShare : openShare}
        title={sharedId ? "Weitere Mitbearbeiter hinzufügen" : "An andere senden (als Mitbearbeiter)"}
        className={`btn-icon ${showShare ? "btn-icon-active" : sharedId ? "text-sky-600" : ""}`}>
        <Users size={17} />
      </button>
      <FavoriteButton todo={todo} favorite={favorite} onToggled={setFavorite}
        size={16} className="btn-icon" />
    </>
  );

  const footer = (
    <div className={`flex-shrink-0 flex gap-2 ${isWindow ? "max-w-6xl w-full mx-auto px-5 py-3" : "border-t border-white/60 p-3.5 rounded-b-[28px]"}`}>
      <button onClick={insertTimestampInDescription} title="Zeitmarke einfügen (Strg+T)" disabled={commonLocked}
        className="w-10 h-10 rounded-2xl glass-chip text-indigo-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
        <Clock size={16} />
      </button>
      <button ref={archiveBtnRef} onClick={handleArchive} disabled={commonLocked}
        title={commonLocked ? "Gesperrt, solange woanders bearbeitet wird" : sharedId ? "Archiviert das 2do für alle Mitbearbeiter" : "Archivieren"}
        className={`flex-1 max-w-[160px] py-2.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${confirmArchive ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "bg-amber-50/80 border border-amber-200 text-amber-600"}`}>
        {!confirmArchive && <Archive size={15} className="hidden sm:inline" />}
        {confirmArchive ? "Wirklich?" : "Archivieren"}
      </button>
      <button ref={deleteBtnRef} onClick={handleDelete}
        title={sharedId ? "Nur für dich entfernen – die anderen Mitbearbeiter behalten das 2do" : "Löschen"}
        className={`flex-1 max-w-[160px] py-2.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${confirmDelete ? "bg-red-500 text-white shadow-lg shadow-red-500/30" : "bg-red-50/80 border border-red-200 text-red-600"}`}>
        {!confirmDelete && <Trash2 size={15} className="hidden sm:inline" />}
        {confirmDelete ? "Wirklich?" : sharedId ? "Entfernen" : "Löschen"}
      </button>
      {isWindow && <span className="flex-1" />}
      <button onClick={saveOnly} disabled={saving || savingStay || allLocked} title="Speichern (offen lassen) · Strg+S"
        className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-50 ${
          savedFlash ? "bg-emerald-500 text-white shadow-md" : "bg-blue-50 border border-blue-200 text-blue-500 hover:bg-blue-100"
        }`}>
        {savingStay ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
        ) : savedFlash ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <Save size={16} />
        )}
      </button>
      <button onClick={save} disabled={saving || savingStay} title="Speichern & schließen · Strg+Enter"
        className={`${isWindow ? "px-6" : "flex-1"} py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold btn-liquid disabled:opacity-60`}>
        {saving ? "..." : allLocked ? "Schließen" : isWindow ? "Speichern & schließen" : "Speichern"}
      </button>
    </div>
  );

  // ── Eigenes Fenster: zweispaltig ───────────────────────────────────────────
  if (isWindow) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 pt-3 pb-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PRIO_STYLES[form.prio] || "bg-orange-400"}`} />
              <div className="flex-1 min-w-0">{titleBlock}</div>
              <SyncIndicator />
              {headerActions}
            </div>
            <TimestampInfo createdAt={todo.createdAt} updatedAt={live?.updatedAt || lastUpdated} className="px-6 -mt-1" />
            {lockBanner}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
              <div className="space-y-3 min-w-0">
                {descriptionBlock}
              </div>
              <div className="space-y-3 min-w-0">
                {sharePanel}
                {membersBlock}
                {statusBlock}
                {prioBlock}
                {deadlineBlock}
                {wiedervorlageBlock}
                {tagsBlock}
                {exportBlock}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 border-t border-slate-200/70 bg-white/55 backdrop-blur-xl">{footer}</div>
      </div>
    );
  }

  // ── Blatt im Dashboard: einspaltig ─────────────────────────────────────────
  return (
    <div className="w-full sm:max-w-lg lg:max-w-2xl xl:max-w-3xl glass-strong rounded-t-[28px] sm:rounded-[28px] max-h-[95vh] flex flex-col mx-auto"
        style={{ touchAction: "pan-y", overflowX: "hidden", maxWidth: "100vw" }}>

        {/* Kopf */}
        <div className="flex-shrink-0 border-b border-white/60 pl-5 pr-2.5 py-2.5 flex items-center gap-2 rounded-t-[28px]">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PRIO_STYLES[form.prio] || "bg-orange-400"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-800 truncate">2do bearbeiten</h2>
              <SyncIndicator compact />
            </div>
            <TimestampInfo createdAt={todo.createdAt} updatedAt={live?.updatedAt || lastUpdated} className="mt-0.5" />
          </div>
          {headerActions}
          {canPopOut && (
            <button onClick={popOut} title="In eigenem Fenster öffnen" className="btn-icon">
              <AppWindow size={17} />
            </button>
          )}
          {onMinimize && (
            <button onClick={handleMinimize} title="Minimieren (Änderungen bleiben erhalten)" className="btn-icon">
              <Minus size={17} />
            </button>
          )}
          <button onClick={onClose} title="Schließen ohne zu speichern" className="btn-icon">
            <X size={17} />
          </button>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5 space-y-4" style={{ overflowX: "hidden", maxWidth: "100%" }}>
          {membersBlock}
          {lockBanner}
          {sharePanel}
          {statusBlock}
          {wiedervorlageBlock}
          {titleBlock}
          {descriptionBlock}
          {prioBlock}
          {tagsBlock}
          {deadlineBlock}
          {exportBlock}
        </div>

        {footer}
    </div>
  );
}
