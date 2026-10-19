import React, { useState, useEffect, useRef } from "react";
import {
  updateTodo, deleteTodo, addCategory, shareTodo, getAllUsers,
  subscribeSharedTodo, acquireEditLock, refreshEditLock, releaseEditLock,
  lockedByOther, splitSharedData, LOCK_HEARTBEAT_MS,
} from "@/lib/todoService";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { format } from "date-fns";
import RichEditor from "./RichEditor";
import QuickDateButtons from "./QuickDateButtons";
import useConfirmReset from "@/hooks/useConfirmReset";
import SyncIndicator from "./SyncIndicator";
import TimestampInfo from "./TimestampInfo";
import FavoriteButton from "./FavoriteButton";
import { UsersIcon, LockIcon } from "./SharedBadge";

const STATUSES = ["offen", "in Arbeit", "wartend", "erledigt"];
const PRIOS = ["A", "B", "C"];
const PRIO_STYLES = { A: "bg-red-500", B: "bg-orange-400", C: "bg-emerald-500" };
const PRIO_BTN = {
  A: { active: "bg-red-500 text-white shadow-md", base: "glass-chip text-slate-500" },
  B: { active: "bg-orange-400 text-white shadow-md", base: "glass-chip text-slate-500" },
  C: { active: "bg-emerald-500 text-white shadow-md", base: "glass-chip text-slate-500" },
};
const STATUS_BTN = {
  "offen": { active: "bg-slate-600 text-white", base: "glass-chip text-slate-500" },
  "in Arbeit": { active: "bg-blue-500 text-white", base: "glass-chip text-slate-500" },
  "wartend": { active: "bg-amber-400 text-white", base: "glass-chip text-slate-500" },
  "erledigt": { active: "bg-emerald-500 text-white", base: "glass-chip text-slate-500" },
};

function toInputDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export default function TodoDetail({ todo, categories, onClose, onDelete, onMinimize, initialDraft }) {
  const { user, userProfile } = useFirebaseAuth();
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

  // Geteilte 2dos: Live-Stand + Bearbeitungssperre.
  // lockState: none (privat) | pending | mine | other (jemand anderes
  // bearbeitet → gemeinsame Felder gesperrt) | offline (keine Sperre möglich)
  const [live, setLive] = useState(todo.sharedId ? todo : null);
  const [lockState, setLockState] = useState(() =>
    !todo.sharedId ? "none" : lockedByOther(todo) ? "other" : "pending");
  const liveRef = useRef(live);
  const lockStateRef = useRef(lockState);
  const acquireRef = useRef(null);
  liveRef.current = live;
  lockStateRef.current = lockState;
  const commonLocked = lockState === "other";
  const otherLock = commonLocked ? lockedByOther(live) || live?.editLock : null;

  // Track if dirty (for auto-save vs X close)
  const isDirtyRef = useRef(false);
  const closedWithX = useRef(false);
  const richEditorRef = useRef(null);

  // Block horizontal scroll on the modal completely
  useEffect(() => {
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
  }, []);

  // Sperre holen, per Heartbeat halten, beim Schließen/Minimieren freigeben.
  // Ist das 2do gerade gesperrt, wird automatisch übernommen, sobald es frei ist.
  useEffect(() => {
    if (!sharedId) return;
    let cancelled = false;
    let holding = false;
    let busy = false;

    const tryAcquire = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const res = await acquireEditLock(sharedId, user.uid, myName);
        if (cancelled) {
          if (res.ok) releaseEditLock(sharedId);
          return;
        }
        holding = res.ok;
        setLockState(res.ok ? "mine" : res.lock ? "other" : "offline");
      } catch {
        // offline / Timeout: ohne Sperre weiterarbeiten, außer der Cache
        // kennt eine aktive fremde Sperre
        if (!cancelled) setLockState(lockedByOther(liveRef.current) ? "other" : "offline");
      } finally {
        busy = false;
      }
    };
    acquireRef.current = tryAcquire;

    const unsub = subscribeSharedTodo(sharedId, (data) => {
      if (cancelled || !data) return;
      setLive(data);
      // Sperre verloren (z. B. nach Standby) → ab jetzt nur lesen
      if (lockStateRef.current === "mine" && lockedByOther(data)) {
        holding = false;
        setLockState("other");
      } else if (lockStateRef.current === "other" && !lockedByOther(data)) {
        tryAcquire();
      }
    });
    tryAcquire();

    // Alle 5 s prüfen: eigene Sperre regelmäßig erneuern bzw. – falls keine
    // gehalten wird – neu versuchen (fremde Sperre abgelaufen, wieder online)
    let lastBeat = Date.now();
    const heartbeat = setInterval(async () => {
      if (holding) {
        if (Date.now() - lastBeat < LOCK_HEARTBEAT_MS) return;
        lastBeat = Date.now();
        try {
          if (!(await refreshEditLock(sharedId)) && !cancelled) {
            holding = false;
            setLockState(lockedByOther(liveRef.current) ? "other" : "offline");
          }
        } catch { /* offline – Sperre verfällt ggf., wird neu geholt */ }
      } else if (!lockedByOther(liveRef.current)) {
        lastBeat = Date.now();
        tryAcquire();
      }
    }, 5000);

    const onUnload = () => { if (holding) releaseEditLock(sharedId); };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      acquireRef.current = null;
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onUnload);
      unsub();
      if (holding) releaseEditLock(sharedId);
    };
  }, [sharedId, user.uid]);

  // Während jemand anderes bearbeitet: gemeinsame Felder live mitlaufen lassen,
  // damit man nach der Freigabe auf dem neuesten Stand weiterarbeitet
  useEffect(() => {
    if (lockState !== "other" || !live) return;
    const { common } = splitSharedData(live);
    setForm((f) => ({ ...f, ...common }));
  }, [live, lockState]);

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
    ["deadline", "wiedervorlage"].forEach((k) => {
      if (data[k] && typeof data[k] === "string") data[k] = new Date(data[k]);
      if (data[k] === "") data[k] = null;
    });
    return data;
  };

  // Gesperrt → nur die persönlichen Felder (Tags, Wiedervorlage) speichern
  const persist = () => {
    const ok = updateTodo(user.uid, todo.id, buildSaveData(), { personalOnly: commonLocked });
    if (!ok) alert(`${lockedByOther(liveRef.current)?.name || "Jemand"} bearbeitet dieses 2do gerade – deine Änderungen an Titel, Status & Co. konnten nicht gespeichert werden.`);
    return ok;
  };

  // Speichern & schließen (bisheriges Verhalten)
  const save = async () => {
    setSaving(true);
    const ok = persist();
    setSaving(false);
    if (ok) onClose();
  };

  // Speichern ohne zu schließen
  const saveOnly = async () => {
    if (savingStay || saving) return;
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

  // Auto-save on backdrop click (not X)
  const handleBackdropClick = async (e) => {
    if (e.target !== e.currentTarget) return;
    if (isDirtyRef.current && !closedWithX.current) {
      await updateTodo(user.uid, todo.id, buildSaveData());
    }
    onClose();
  };

  const handleXClose = () => {
    closedWithX.current = true;
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
    if (!newCat.trim()) return;
    await addCategory(user.uid, newCat.trim(), "#6366f1");
    set("category", newCat.trim());
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

  const members = live?.collaborators || [];
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
      if (isDirtyRef.current) {
        updateTodo(user.uid, todo.id, data, { personalOnly: commonLocked });
        isDirtyRef.current = false;
      }
      const recipients = selectedUids.map((uid) => {
        const u = allUsers.find((x) => x.id === uid);
        return { uid, name: u?.displayName || u?.email || "Unbekannt" };
      });
      const result = await shareTodo(user.uid, myName, data, recipients);
      if (!sharedId) {
        setLive({ ...data, collaborators: [user.uid, ...selectedUids], sharedBy: user.uid,
          memberNames: { [user.uid]: myName, ...Object.fromEntries(recipients.map((r) => [r.uid, r.name])) } });
        setLockState("pending");
        setSharedId(todo.id);
      }
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

  return (
    <div className="w-full sm:max-w-lg lg:max-w-2xl xl:max-w-3xl glass-strong rounded-t-[28px] sm:rounded-[28px] max-h-[95vh] flex flex-col mx-auto"
        style={{ touchAction: "pan-y", overflowX: "hidden", maxWidth: "100vw" }}>

        {/* Header */}
        <div className="flex-shrink-0 border-b border-white/50 px-5 py-3 flex items-center gap-3 rounded-t-[28px]">
          <div className={`w-3 h-3 rounded-full ${PRIO_STYLES[form.prio] || "bg-orange-400"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-base font-semibold text-slate-800 truncate">Notiz bearbeiten</h2>
              <SyncIndicator />
            </div>
            <TimestampInfo createdAt={todo.createdAt} updatedAt={live?.updatedAt || lastUpdated} className="mt-0.5" />
          </div>
          <button onClick={showShare ? closeShare : openShare}
            title={sharedId ? "Weitere Mitbearbeiter hinzufügen" : "An andere senden (als Mitbearbeiter)"}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              showShare ? "bg-indigo-500 text-white shadow-md" : sharedId ? "glass-chip text-sky-600" : "glass-chip text-slate-500"
            }`}>
            <UsersIcon size={14} />
          </button>
          <FavoriteButton todo={todo} favorite={favorite} onToggled={setFavorite}
            size={14} className="w-8 h-8 rounded-full glass-chip" />
          {onMinimize && (
            <button onClick={handleMinimize} title="Minimieren (Änderungen bleiben erhalten)"
              className="w-8 h-8 rounded-full glass-chip flex items-center justify-center text-slate-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="19"/></svg>
            </button>
          )}
          <button onClick={handleXClose} title="Schließen ohne zu speichern" className="w-8 h-8 rounded-full glass-chip flex items-center justify-center text-slate-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5 space-y-4" style={{ overflowX: "hidden", maxWidth: "100%" }}>

          {/* Mitbearbeiter + Sperrstatus (nur geteilte 2dos) */}
          {sharedId && (
            <div className="rounded-2xl bg-sky-50/70 border border-sky-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sky-500 flex-shrink-0"><UsersIcon size={13} /></span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mitbearbeiter</span>
                <span className="flex-1" />
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  lockState === "mine" ? "bg-emerald-100 text-emerald-700"
                    : lockState === "other" ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {lockState === "mine" ? "Du bearbeitest" : lockState === "other" ? "Gesperrt" : lockState === "offline" ? "Offline" : "…"}
                </span>
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
          )}

          {/* Gesperrt-Hinweis */}
          {commonLocked && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50/90 border border-amber-200 px-3 py-2.5">
              <span className="text-amber-600 mt-0.5 flex-shrink-0"><LockIcon size={14} /></span>
              <div className="text-xs text-amber-800 leading-snug">
                <b>{otherLock?.name || "Jemand"}</b> bearbeitet dieses 2do gerade.
                Titel, Beschreibung, Status &amp; Co. sind solange gesperrt und laufen live mit –
                Tags und Wiedervorlage kannst du trotzdem ändern. Sobald frei, kannst du automatisch weiterarbeiten.
              </div>
            </div>
          )}

          {/* Senden an andere User */}
          {showShare && (
            <div className="rounded-2xl bg-white/85 border border-indigo-200 shadow-sm p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-indigo-500"><UsersIcon size={14} /></span>
                <span className="text-sm font-semibold text-slate-700 flex-1">
                  {sharedId ? "Mitbearbeiter hinzufügen" : "An andere senden"}
                </span>
                <button onClick={closeShare} title="Schließen (Esc)"
                  className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
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
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
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
          )}

          {/* Status - compact chips row at top */}
          <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
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

          {/* Wiedervorlage — quick buttons + date picker */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5L1 10"/></svg>
              Wiedervorlage
            </label>
            <QuickDateButtons
              value={form.wiedervorlage}
              onChange={(v) => set("wiedervorlage", v)}
            />
          </div>

          {/* Title */}
          <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-70">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Titel *</label>
            <input value={form.title || ""} onChange={(e) => set("title", e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl glass-input text-slate-800 text-[15px]" />
          </fieldset>

          {/* Description - rich editor */}
          <div className={commonLocked ? "opacity-80" : ""}>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Beschreibung</label>
            <RichEditor
              ref={richEditorRef}
              value={form.description || ""}
              onChange={(v) => set("description", v)}
              placeholder="Beschreibung eingeben..."
              minHeight={200}
              readOnly={commonLocked}
            />
          </div>

          {/* Prio */}
          <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Priorität</label>
            <div className="flex gap-2">
              {PRIOS.map((p) => (
                <button key={p} type="button" onClick={() => set("prio", p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${form.prio === p ? PRIO_BTN[p].active : PRIO_BTN[p].base}`}>
                  {p}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {categories.map((c) => {
                const active = (form.tags || []).includes(c.name);
                return (
                  <button key={c.id} type="button"
                    onClick={() => {
                      const current = form.tags || [];
                      set("tags", active ? current.filter((t) => t !== c.name) : [...current, c.name]);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                      active ? "bg-indigo-500 text-white border-indigo-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
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
              <div className="flex gap-2">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Tag-Name"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  onKeyDown={(e) => e.key === "Enter" && addNewCategory()} />
                <button onClick={addNewCategory} className="px-3 py-2 rounded-xl bg-blue-500 text-white text-sm">OK</button>
              </div>
            )}
            {(form.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(form.tags || []).map((t) => (
                  <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 text-[11px] font-medium">
                    #{t}
                    <button type="button" onClick={() => set("tags", (form.tags || []).filter((x) => x !== t))} className="text-indigo-400 hover:text-indigo-600 leading-none">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Deadline — quick buttons + date picker */}
          <fieldset disabled={commonLocked} className="min-w-0 disabled:opacity-60">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Deadline
            </label>
            <QuickDateButtons
              value={form.deadline}
              onChange={(v) => set("deadline", v)}
              withTime
            />
          </fieldset>

          {/* Email + Calendar - compact side by side */}
          <div className="border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              E-Mail, Kalender &amp; Word
            </label>
            <div className="flex gap-2 flex-wrap">
              <button onClick={openEmailClient}
                className="flex-1 min-w-[104px] py-2.5 rounded-2xl bg-gradient-to-r from-slate-600 to-slate-700 text-white text-sm font-medium hover:from-slate-700 hover:to-slate-800 transition-all flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                E-Mail
              </button>
              <button onClick={openCalendar}
                className="flex-1 min-w-[104px] py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Kalender
              </button>
              <button onClick={exportWord} disabled={exportingWord} title="Als Word-Datei (.docx) exportieren"
                className="flex-1 min-w-[104px] py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                {exportingWord ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <path d="M8 13l1.4 4.5L11 13l1.6 4.5L14 13" strokeWidth="1.6"/>
                  </svg>
                )}
                {exportingWord ? "Erstellt…" : "Word"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 text-center">E-Mail: Titel als Betreff · Kalender: .ics öffnet Outlook / iPhone-Kalender · Word: .docx mit Titel &amp; Details</p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/50 p-4 flex gap-2 rounded-b-[28px]">
          {/* Zeitmarke */}
          <button onClick={insertTimestampInDescription} title="Zeitmarke einfügen"
            className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-500 flex items-center justify-center flex-shrink-0 hover:bg-indigo-100 transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button ref={archiveBtnRef} onClick={handleArchive} disabled={commonLocked}
            title={commonLocked ? "Gesperrt, solange jemand anderes bearbeitet" : sharedId ? "Archiviert das 2do für alle Mitbearbeiter" : "Archivieren"}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all disabled:opacity-50 ${confirmArchive ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "bg-amber-50/70 border border-amber-200 text-amber-600"}`}>
            {confirmArchive ? "Wirklich?" : "Archivieren"}
          </button>
          <button ref={deleteBtnRef} onClick={handleDelete}
            title={sharedId ? "Nur für dich entfernen – die anderen Mitbearbeiter behalten das 2do" : "Löschen"}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all ${confirmDelete ? "bg-red-500 text-white shadow-lg shadow-red-500/30" : "bg-red-50/70 border border-red-200 text-red-600"}`}>
            {confirmDelete ? "Wirklich?" : sharedId ? "Entfernen" : "Löschen"}
          </button>
          <button onClick={saveOnly} disabled={saving || savingStay} title="Speichern (offen lassen) · Strg+S"
            className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-60 ${
              savedFlash
                ? "bg-emerald-500 text-white shadow-md"
                : "bg-blue-50 border border-blue-200 text-blue-500 hover:bg-blue-100"
            }`}>
            {savingStay ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
            ) : savedFlash ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            )}
          </button>
          <button onClick={save} disabled={saving || savingStay} title="Speichern & schließen · Strg+Enter"
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-semibold btn-liquid disabled:opacity-60">
            {saving ? "..." : "Speichern"}
          </button>
        </div>
    </div>
  );
}

// Auto-growing textarea
function AutoGrowTextarea({ value, onChange, placeholder, minRows = 4 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      rows={minRows}
      className="w-full px-4 py-2.5 rounded-2xl bg-white/80 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none overflow-hidden" />
  );
}