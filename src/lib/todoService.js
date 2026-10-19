import { db } from "./firebase";
import { reportPending } from "./syncStatus";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  orderBy,
  getDocs,
  writeBatch,
  runTransaction,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

// Snapshot-Optionen für Offline-Betrieb:
// - includeMetadataChanges: Snapshot feuert auch, wenn nur der Pending-Status
//   wechselt (nötig für den Sync-Indikator)
// - serverTimestamps "estimate": lokale Pending-Writes liefern geschätzte
//   Timestamps statt null (sonst bricht offline die Sortierung/Datumsanzeige)
const snapOpts = { includeMetadataChanges: true };
const docData = (d) => d.data({ serverTimestamps: "estimate" });

// Unsubscribe-Wrapper: beim Abmelden den Pending-Status der Quelle löschen,
// damit kein veralteter "nicht synchronisiert"-Zustand hängen bleibt
const withPendingCleanup = (key, unsub) => () => {
  reportPending(key, false);
  unsub();
};

// TODOS
export const todosCol = (uid) => collection(db, "users", uid, "todos");
export const categoriesCol = (uid) => collection(db, "users", uid, "categories");
export const settingsDoc = (uid) => doc(db, "users", uid, "settings", "prefs");

// Write-Promises resolven erst nach Server-Ack – offline würde die UI daran
// ewig hängen (Speichern-Spinner, Modal schließt nicht). Lokal committen
// Writes sofort in die Offline-Queue, daher nicht blockieren: Fehler nur loggen.
const fireWrite = (promise, label) => {
  promise.catch((err) => console.error(`${label} fehlgeschlagen:`, err));
};

export const addTodo = (uid, data) => {
  const ref = doc(todosCol(uid));
  fireWrite(setDoc(ref, { ...data, userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), archived: false }), "addTodo");
  return ref;
};

// Schreibt ein 2do. Bei geteilten 2dos werden die Felder aufgeteilt:
// gemeinsame Felder → sharedTodos/{id}, persönliche → eigenes Verweis-Dokument.
// Liefert false, wenn gemeinsame Felder nicht geschrieben werden durften, weil
// gerade jemand anderes das 2do bearbeitet (Bearbeitungssperre).
export const updateTodo = (uid, id, data, { personalOnly = false } = {}) => {
  const shared = sharedCache.get(id);
  if (!shared) {
    // undefined lehnt Firestore synchron ab (z. B. createdAt eines gerade
    // erst angelegten 2dos, das noch nicht vom Server zurückkam)
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    fireWrite(updateDoc(doc(db, "users", uid, "todos", id), { ...clean, updatedAt: serverTimestamp() }), "updateTodo");
    return true;
  }
  const { personal, common } = splitSharedData(data);
  if (Object.keys(personal).length) {
    fireWrite(updateDoc(doc(db, "users", uid, "todos", id), personal), "updateTodo (persönlich)");
  }
  if (personalOnly || !Object.keys(common).length) return true;
  if (lockedByOther(shared)) return false;
  fireWrite(updateDoc(doc(db, "sharedTodos", id), {
    ...common, updatedAt: serverTimestamp(), updatedBy: uid,
  }), "updateTodo (geteilt)");
  return true;
};

// Löschen: geteilte 2dos werden nur für einen selbst entfernt (verlassen),
// die anderen Mitbearbeiter behalten sie.
export const deleteTodo = (uid, id) => {
  if (sharedCache.has(id)) return leaveSharedTodo(uid, id);
  fireWrite(deleteDoc(doc(db, "users", uid, "todos", id)), "deleteTodo");
};

// Favorit an/aus. Bewusst ohne updatedAt: Markieren ist keine inhaltliche
// Änderung. favoritedAt bestimmt die Reihenfolge in der Favoriten-Leiste.
// Favoriten sind immer persönlich (eigenes Dokument, auch bei geteilten 2dos).
export const setTodoFavorite = (uid, id, favorite) =>
  fireWrite(updateDoc(doc(db, "users", uid, "todos", id), {
    favorite,
    favoritedAt: favorite ? serverTimestamp() : null,
  }), "setTodoFavorite");

// Gelöschtes Todo unter gleicher ID wiederherstellen (Undo nach Swipe-Löschen).
// Geteilte 2dos: wieder beitreten und das persönliche Verweis-Dokument anlegen.
export const restoreTodo = (uid, id, data) => {
  if (data.sharedId) {
    const batch = writeBatch(db);
    batch.update(doc(db, "sharedTodos", id), { collaborators: arrayUnion(uid) });
    batch.set(doc(db, "users", uid, "todos", id), linkDocData(uid, id, data));
    fireWrite(batch.commit(), "restoreTodo (geteilt)");
    return;
  }
  fireWrite(setDoc(doc(db, "users", uid, "todos", id), { ...data, updatedAt: serverTimestamp() }), "restoreTodo");
};

export const addCategory = (uid, name, color) => {
  const ref = doc(categoriesCol(uid));
  fireWrite(setDoc(ref, { name, color, userId: uid, createdAt: serverTimestamp() }), "addCategory");
  return ref;
};

export const deleteCategory = (uid, id) =>
  fireWrite(deleteDoc(doc(db, "users", uid, "categories", id)), "deleteCategory");

export const saveSettings = (uid, data) =>
  fireWrite(setDoc(settingsDoc(uid), data, { merge: true }), "saveSettings");

// Eigene 2dos + geteilte 2dos, zusammengeführt zu einer Liste.
// onPending bekommt die geteilten 2dos, die einem gesendet, aber noch nicht
// angenommen wurden (Inbox).
export const subscribeTodos = (uid, callback, onPending) => {
  let own = null;
  let shared = new Map();
  let sharedLoaded = false;

  const emit = () => {
    if (own === null) return;
    const linked = new Set();
    const list = own.map((t) => {
      if (!t.sharedId) return t;
      linked.add(t.sharedId);
      const s = shared.get(t.sharedId);
      return s ? mergeSharedTodo(t, s) : t;
    });
    callback(list);
    if (sharedLoaded) onPending?.([...shared.values()].filter((s) => !linked.has(s.id)));
  };

  const unsubOwn = onSnapshot(query(todosCol(uid), orderBy("createdAt", "desc")), snapOpts, (snap) => {
    reportPending("todos", snap.metadata.hasPendingWrites);
    own = snap.docs.map((d) => ({ id: d.id, ...docData(d) }));
    emit();
  });

  const unsubShared = onSnapshot(
    query(sharedTodosCol(), where("collaborators", "array-contains", uid)),
    snapOpts,
    (snap) => {
      reportPending("sharedTodos", snap.metadata.hasPendingWrites);
      shared = new Map();
      snap.docs.forEach((d) => {
        const data = docData(d);
        // v1 = altes Kopie-Modell ohne Mitbearbeitung → ignorieren
        if ((data.v || 0) >= SHARED_VERSION) shared.set(d.id, { id: d.id, ...data });
      });
      sharedCache.clear();
      shared.forEach((v, k) => sharedCache.set(k, v));
      sharedLoaded = true;
      emit();
    },
    (err) => {
      console.error("Geteilte 2dos laden fehlgeschlagen:", err);
      sharedLoaded = true;
      emit();
    },
  );

  return () => {
    reportPending("todos", false);
    reportPending("sharedTodos", false);
    sharedCache.clear();
    unsubOwn();
    unsubShared();
  };
};

export const subscribeCategories = (uid, callback) => {
  const q = query(categoriesCol(uid), orderBy("name"));
  const unsub = onSnapshot(q, snapOpts, (snap) => {
    reportPending("categories", snap.metadata.hasPendingWrites);
    const cats = snap.docs.map((d) => ({ id: d.id, ...docData(d) }));
    callback(cats);
  });
  return withPendingCleanup("categories", unsub);
};

// --- GETEILTE 2DOS (Mitbearbeitung) ---
// Modell:
//   sharedTodos/{id}        gemeinsamer Inhalt (Titel, Beschreibung, Prio,
//                           Status, Deadline, Archiviert …) + Mitglieder
//   users/{uid}/todos/{id}  pro Mitglied ein Verweis (sharedId = id) mit den
//                           persönlichen Feldern: Tags, Wiedervorlage, Favorit
// Überall dieselbe ID → Schreibzugriffe lassen sich ohne Nachschlagen routen.
// Mitglieder stehen in collaborators (aktiv) und targetUids (je eingeladen);
// das passt zu den bestehenden Firestore-Rules, kein Rules-Update nötig.
export const sharedTodosCol = () => collection(db, "sharedTodos");
const SHARED_VERSION = 2;

// Pro User eigene Felder — alles andere ist gemeinsam
export const PERSONAL_FIELDS = ["tags", "category", "wiedervorlage", "favorite", "favoritedAt"];
// Verwaltungsfelder, die nie als gemeinsamer Inhalt geschrieben werden
const META_FIELDS = new Set([
  "id", "userId", "createdAt", "updatedAt", "updatedBy", "sharedId", "shared",
  "sharedBy", "sharedByName", "collaborators", "targetUids", "memberNames",
  "isCollaborative", "editLock", "v", "originalId", "sharedFromId",
]);

// Aktuell sichtbare geteilte 2dos (id → Daten), gepflegt von subscribeTodos
const sharedCache = new Map();
export const isSharedTodo = (id) => sharedCache.has(id);

// Aufteilen in persönliche und gemeinsame Felder (Verwaltungsfelder fallen weg)
export const splitSharedData = (data) => {
  const personal = {};
  const common = {};
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined) return;
    if (PERSONAL_FIELDS.includes(k)) personal[k] = v;
    else if (!META_FIELDS.has(k)) common[k] = v;
  });
  return { personal, common };
};

const mergeSharedTodo = (own, shared) => {
  const merged = { ...shared };
  PERSONAL_FIELDS.forEach((k) => {
    if (own[k] !== undefined) merged[k] = own[k];
    else delete merged[k];
  });
  return {
    ...merged,
    id: own.id,
    sharedId: shared.id,
    userId: own.userId,
    // Sortierung "Erstellt" pro User: Zeitpunkt, ab dem man das 2do hat
    createdAt: own.createdAt ?? shared.createdAt,
    updatedAt: shared.updatedAt ?? own.updatedAt,
  };
};

// Persönliches Verweis-Dokument (Titel nur als Fallback-Anzeige)
const linkDocData = (uid, id, data = {}) => ({
  sharedId: id,
  userId: uid,
  title: data.title || "",
  tags: data.tags || [],
  wiedervorlage: data.wiedervorlage || null,
  favorite: !!data.favorite,
  favoritedAt: data.favorite ? (data.favoritedAt || serverTimestamp()) : null,
  createdAt: data.createdAt || serverTimestamp(),
  updatedAt: serverTimestamp(),
});

// Auf Server-Bestätigung warten, offline aber nicht ewig hängen:
// "done" = bestätigt, "queued" = lokal gespeichert, wird später synchronisiert
const commitOrQueue = (promise, ms = 8000) =>
  Promise.race([
    promise.then(() => "done"),
    new Promise((resolve) => setTimeout(() => resolve("queued"), ms)),
  ]);

// 2do an andere User senden: Empfänger werden Mitbearbeiter.
// recipients: [{ uid, name }]. todo: aktueller Stand inkl. id.
export const shareTodo = async (uid, userName, todo, recipients) => {
  const id = todo.id;
  const sharedRef = doc(db, "sharedTodos", id);
  const uids = recipients.map((r) => r.uid);
  const names = {};
  recipients.forEach((r) => { names[r.uid] = r.name; });

  if (sharedCache.has(id)) {
    const nameUpdates = {};
    recipients.forEach((r) => { nameUpdates[`memberNames.${r.uid}`] = r.name; });
    return commitOrQueue(updateDoc(sharedRef, {
      collaborators: arrayUnion(...uids),
      targetUids: arrayUnion(...uids),
      ...nameUpdates,
    }));
  }

  const { common } = splitSharedData(todo);
  const batch = writeBatch(db);
  batch.set(sharedRef, {
    ...common,
    v: SHARED_VERSION,
    isCollaborative: true,
    sharedBy: uid,
    sharedByName: userName,
    collaborators: [uid, ...uids],
    targetUids: [uid, ...uids],
    memberNames: { [uid]: userName, ...names },
    editLock: null,
    createdAt: todo.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  // Eigenes 2do wird zum Verweis; Tags/Wiedervorlage/Favorit bleiben dort
  batch.update(doc(db, "users", uid, "todos", id), { sharedId: id });
  return commitOrQueue(batch.commit());
};

// Gesendetes 2do annehmen → erscheint in der eigenen Liste (ohne Tags,
// ohne Wiedervorlage — die setzt jeder für sich)
export const acceptSharedTodo = (uid, userName, shared) => {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "todos", shared.id), linkDocData(uid, shared.id, { title: shared.title }));
  batch.update(doc(db, "sharedTodos", shared.id), { [`memberNames.${uid}`]: userName });
  fireWrite(batch.commit(), "acceptSharedTodo");
};

export const declineSharedTodo = (uid, sharedId) =>
  fireWrite(updateDoc(doc(db, "sharedTodos", sharedId), { collaborators: arrayRemove(uid) }), "declineSharedTodo");

// Geteiltes 2do verlassen: nur für einen selbst entfernen
export const leaveSharedTodo = (uid, id) => {
  const batch = writeBatch(db);
  batch.update(doc(db, "sharedTodos", id), { collaborators: arrayRemove(uid) });
  batch.delete(doc(db, "users", uid, "todos", id));
  fireWrite(batch.commit(), "leaveSharedTodo");
};

export const subscribeSharedTodo = (id, callback) =>
  onSnapshot(doc(db, "sharedTodos", id), snapOpts, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...docData(snap) } : null);
  }, (err) => {
    console.error("Geteiltes 2do laden fehlgeschlagen:", err);
    callback(null);
  });

// --- BEARBEITUNGSSPERRE (geteilte 2dos) ---
// Es kann immer nur eine Person (bzw. ein Fenster) ein geteiltes 2do
// bearbeiten. Die Sperre wird per Heartbeat erneuert und verfällt automatisch,
// falls ein Gerät abstürzt oder offline geht.
export const LOCK_TTL_MS = 90 * 1000;
export const LOCK_HEARTBEAT_MS = 25 * 1000;
// Eindeutig pro Tab/Fenster, damit auch zwei Geräte desselben Users sich sperren
export const SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

const lockTime = (lock) => {
  const at = lock?.at;
  if (!at) return 0;
  return at.toMillis ? at.toMillis() : new Date(at).getTime();
};

export const activeLock = (shared) => {
  const lock = shared?.editLock;
  if (!lock?.session) return null;
  return Date.now() - lockTime(lock) < LOCK_TTL_MS ? lock : null;
};

export const lockedByOther = (shared) => {
  const lock = activeLock(shared);
  return lock && lock.session !== SESSION_ID ? lock : null;
};

// Transaktionen brauchen den Server — offline nicht ewig warten
const withTimeout = (promise, ms = 6000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);

// { ok: true } | { ok: false, lock } | wirft offline/bei Fehlern
export const acquireEditLock = (id, uid, name) =>
  withTimeout(runTransaction(db, async (tx) => {
    const ref = doc(db, "sharedTodos", id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false, lock: null };
    const other = lockedByOther(snap.data());
    if (other) return { ok: false, lock: other };
    tx.update(ref, { editLock: { uid, name, session: SESSION_ID, at: serverTimestamp() } });
    return { ok: true };
  }));

// Heartbeat: true = Sperre gehalten, false = verloren
export const refreshEditLock = (id) =>
  withTimeout(runTransaction(db, async (tx) => {
    const ref = doc(db, "sharedTodos", id);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().editLock?.session !== SESSION_ID) return false;
    tx.update(ref, { "editLock.at": serverTimestamp() });
    return true;
  }));

export const releaseEditLock = (id) =>
  withTimeout(runTransaction(db, async (tx) => {
    const ref = doc(db, "sharedTodos", id);
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().editLock?.session === SESSION_ID) {
      tx.update(ref, { editLock: null });
    }
  })).catch(() => {});

export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, "userProfiles"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const upsertUserProfile = (uid, data) =>
  setDoc(doc(db, "userProfiles", uid), data, { merge: true });

// --- NOTEBOOKS (Notes) ---
export const notebooksCol = (uid) => collection(db, "users", uid, "notebooks");
export const sectionsCol = (uid, bookId) => collection(db, "users", uid, "notebooks", bookId, "sections");
export const pagesCol = (uid, bookId, sectionId) => collection(db, "users", uid, "notebooks", bookId, "sections", sectionId, "pages");

export const addNotebook = (uid, name) => {
  const ref = doc(notebooksCol(uid));
  fireWrite(setDoc(ref, { name, userId: uid, createdAt: serverTimestamp() }), "addNotebook");
  return ref;
};

export const updateNotebook = (uid, id, data) =>
  fireWrite(updateDoc(doc(db, "users", uid, "notebooks", id), data), "updateNotebook");

export const deleteNotebook = (uid, id) =>
  fireWrite(deleteDoc(doc(db, "users", uid, "notebooks", id)), "deleteNotebook");

export const subscribeNotebooks = (uid, callback) => {
  const q = query(notebooksCol(uid), orderBy("createdAt", "asc"));
  const unsub = onSnapshot(q, snapOpts, (snap) => {
    reportPending("notebooks", snap.metadata.hasPendingWrites);
    callback(snap.docs.map((d) => ({ id: d.id, ...docData(d) })));
  });
  return withPendingCleanup("notebooks", unsub);
};

export const addSection = (uid, bookId, name, parentSectionId = null) => {
  const ref = doc(sectionsCol(uid, bookId));
  fireWrite(setDoc(ref, { name, parentSectionId, userId: uid, createdAt: serverTimestamp() }), "addSection");
  return ref;
};

export const updateSection = (uid, bookId, sectionId, data) =>
  fireWrite(updateDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId), data), "updateSection");

export const deleteSection = (uid, bookId, sectionId) =>
  fireWrite(deleteDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId)), "deleteSection");

export const subscribeSections = (uid, bookId, callback) => {
  const q = query(sectionsCol(uid, bookId), orderBy("createdAt", "asc"));
  const key = `sections:${bookId}`;
  const unsub = onSnapshot(q, snapOpts, (snap) => {
    reportPending(key, snap.metadata.hasPendingWrites);
    callback(snap.docs.map((d) => ({ id: d.id, ...docData(d) })));
  });
  return withPendingCleanup(key, unsub);
};

export const addPage = (uid, bookId, sectionId, title) => {
  const ref = doc(pagesCol(uid, bookId, sectionId));
  fireWrite(setDoc(ref, { title, content: "", userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), "addPage");
  return ref;
};

export const updatePage = (uid, bookId, sectionId, pageId, data) =>
  fireWrite(updateDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId, "pages", pageId), { ...data, updatedAt: serverTimestamp() }), "updatePage");

export const deletePage = (uid, bookId, sectionId, pageId) =>
  fireWrite(deleteDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId, "pages", pageId)), "deletePage");

export const subscribePages = (uid, bookId, sectionId, callback) => {
  const q = query(pagesCol(uid, bookId, sectionId), orderBy("createdAt", "asc"));
  const key = `pages:${bookId}:${sectionId}`;
  const unsub = onSnapshot(q, snapOpts, (snap) => {
    reportPending(key, snap.metadata.hasPendingWrites);
    callback(snap.docs.map((d) => ({ id: d.id, ...docData(d) })));
  });
  return withPendingCleanup(key, unsub);
};

export const getAllNotebookData = async (uid) => {
  const booksSnap = await getDocs(notebooksCol(uid));
  const books = [];
  for (const bDoc of booksSnap.docs) {
    const book = { id: bDoc.id, ...bDoc.data(), sections: [] };
    const sectSnap = await getDocs(sectionsCol(uid, bDoc.id));
    for (const sDoc of sectSnap.docs) {
      const section = { id: sDoc.id, ...sDoc.data(), pages: [] };
      const pagesSnap = await getDocs(pagesCol(uid, bDoc.id, sDoc.id));
      section.pages = pagesSnap.docs.map((p) => ({ id: p.id, ...p.data() }));
      book.sections.push(section);
    }
    books.push(book);
  }
  return books;
};

// --- NOTES TREE STATE (expanded nodes, synced per user) ---
export const notesTreeStateDoc = (uid) => doc(db, "users", uid, "settings", "notesTreeState");

export const saveNotesTreeState = (uid, openIds) =>
  setDoc(notesTreeStateDoc(uid), { openIds }, { merge: false });

export const getNotesTreeState = async (uid) => {
  const snap = await getDoc(notesTreeStateDoc(uid));
  return snap.exists() ? (snap.data().openIds || []) : [];
};

// copy a page to another section
export const copyPage = async (uid, fromBookId, fromSectionId, pageId, toBookId, toSectionId) => {
  const srcDoc = await getDoc(doc(db, "users", uid, "notebooks", fromBookId, "sections", fromSectionId, "pages", pageId));
  if (!srcDoc.exists()) return;
  const data = srcDoc.data();
  await addDoc(pagesCol(uid, toBookId, toSectionId), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
};

// move a page to another section (copy + delete)
export const movePage = async (uid, fromBookId, fromSectionId, pageId, toBookId, toSectionId) => {
  await copyPage(uid, fromBookId, fromSectionId, pageId, toBookId, toSectionId);
  await deletePage(uid, fromBookId, fromSectionId, pageId);
};

// copy a section (and its pages) to another notebook
export const copySection = async (uid, fromBookId, sectionId, toBookId, parentSectionId = null) => {
  const srcDoc = await getDoc(doc(db, "users", uid, "notebooks", fromBookId, "sections", sectionId));
  if (!srcDoc.exists()) return;
  const data = srcDoc.data();
  const newRef = await addDoc(sectionsCol(uid, toBookId), { ...data, parentSectionId, createdAt: serverTimestamp() });
  const pagesSnap = await getDocs(pagesCol(uid, fromBookId, sectionId));
  for (const p of pagesSnap.docs) {
    const pd = p.data();
    await addDoc(pagesCol(uid, toBookId, newRef.id), { ...pd, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
};

// move a section to another notebook
export const moveSection = async (uid, fromBookId, sectionId, toBookId) => {
  await copySection(uid, fromBookId, sectionId, toBookId, null);
  await deleteSection(uid, fromBookId, sectionId);
};

// --- MINIMIZED EDITOR DRAFTS (geräteübergreifend synchronisiert) ---
export const minimizedCol = (uid) => collection(db, "users", uid, "minimized");

const sanitizeDraftDate = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const saveMinimizedDraft = (uid, todoId, draft) => {
  const data = { ...draft };
  data.deadline = sanitizeDraftDate(draft.deadline);
  data.wiedervorlage = sanitizeDraftDate(draft.wiedervorlage);
  // Firestore akzeptiert kein undefined
  Object.keys(data).forEach((k) => { if (data[k] === undefined) data[k] = null; });
  return setDoc(doc(db, "users", uid, "minimized", todoId), {
    draft: data,
    updatedAt: serverTimestamp(),
  });
};

export const removeMinimizedDraft = (uid, todoId) =>
  deleteDoc(doc(db, "users", uid, "minimized", todoId));

export const subscribeMinimized = (uid, callback) => {
  const unsub = onSnapshot(query(minimizedCol(uid), orderBy("updatedAt", "asc")), snapOpts, (snap) => {
    reportPending("minimized", snap.metadata.hasPendingWrites);
    callback(snap.docs.map((d) => ({ todoId: d.id, draft: docData(d).draft || {} })));
  });
  return withPendingCleanup("minimized", unsub);
};

// --- FILTER PRESETS (synced per user in Firestore) ---
export const filterPresetsDoc = (uid) => doc(db, "users", uid, "settings", "filterPresets");

export const saveFilterPresets = (uid, presets) =>
  setDoc(filterPresetsDoc(uid), { presets }, { merge: false });

export const subscribeFilterPresets = (uid, callback) =>
  onSnapshot(filterPresetsDoc(uid), (snap) => {
    callback(snap.exists() ? (snap.data().presets || []) : []);
  });