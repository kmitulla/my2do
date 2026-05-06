import { db } from "./firebase";
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
} from "firebase/firestore";

// TODOS
export const todosCol = (uid) => collection(db, "users", uid, "todos");
export const categoriesCol = (uid) => collection(db, "users", uid, "categories");
export const settingsDoc = (uid) => doc(db, "users", uid, "settings", "prefs");

export const addTodo = (uid, data) =>
  addDoc(todosCol(uid), { ...data, userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), archived: false });

export const updateTodo = (uid, id, data) =>
  updateDoc(doc(db, "users", uid, "todos", id), { ...data, updatedAt: serverTimestamp() });

export const deleteTodo = (uid, id) =>
  deleteDoc(doc(db, "users", uid, "todos", id));

export const addCategory = (uid, name, color) =>
  addDoc(categoriesCol(uid), { name, color, userId: uid, createdAt: serverTimestamp() });

export const deleteCategory = (uid, id) =>
  deleteDoc(doc(db, "users", uid, "categories", id));

export const saveSettings = (uid, data) =>
  setDoc(settingsDoc(uid), data, { merge: true });

export const subscribeTodos = (uid, callback) => {
  const q = query(todosCol(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(todos);
  });
};

export const subscribeCategories = (uid, callback) => {
  const q = query(categoriesCol(uid), orderBy("name"));
  return onSnapshot(q, (snap) => {
    const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(cats);
  });
};

// --- SHARED TODOS (collaboration) ---
export const sharedTodosCol = () => collection(db, "sharedTodos");
export const inboxCol = (uid) => collection(db, "users", uid, "inbox");

export const sendTodoToUsers = async (senderUid, senderName, todo, targetUids, collaborate) => {
  // Sanitize: convert Timestamp objects to plain dates so Firestore doesn't reject them
  const toDate = (v) => v ? (v.toDate ? v.toDate() : new Date(v)) : null;
  const sharedRef = await addDoc(sharedTodosCol(), {
    title: todo.title || "",
    description: todo.description || "",
    prio: todo.prio || "B",
    status: todo.status || "offen",
    category: todo.category || "",
    deadline: toDate(todo.deadline),
    wiedervorlage: toDate(todo.wiedervorlage),
    sharedBy: senderUid,
    sharedByName: senderName,
    targetUids: targetUids,
    collaborators: collaborate ? [senderUid, ...targetUids] : [],
    isCollaborative: !!collaborate,
    originalId: todo.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Send inbox notification to each target
  for (const uid of targetUids) {
    await addDoc(inboxCol(uid), {
      sharedTodoId: sharedRef.id,
      fromUid: senderUid,
      fromName: senderName,
      todoTitle: todo.title,
      isCollaborative: !!collaborate,
      read: false,
      createdAt: serverTimestamp(),
    });
  }
  return sharedRef.id;
};

export const subscribeInbox = (uid, callback) => {
  const q = query(inboxCol(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

export const acceptSharedTodo = async (uid, inboxItem, sharedTodo) => {
  // Copy as own todo
  await addDoc(collection(db, "users", uid, "todos"), {
    title: sharedTodo.title,
    description: sharedTodo.description || "",
    prio: sharedTodo.prio || "B",
    status: "offen",
    category: sharedTodo.category || "",
    deadline: sharedTodo.deadline || null,
    wiedervorlage: sharedTodo.wiedervorlage || null,
    emailTitle: sharedTodo.emailTitle || "",
    emailBody: sharedTodo.emailBody || "",
    archived: false,
    sharedFromId: inboxItem.sharedTodoId,
    userId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, "users", uid, "inbox", inboxItem.id));
};

export const dismissInboxItem = (uid, inboxItemId) =>
  deleteDoc(doc(db, "users", uid, "inbox", inboxItemId));

export const getSharedTodo = async (sharedTodoId) => {
  const snap = await getDoc(doc(db, "sharedTodos", sharedTodoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

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

export const addNotebook = (uid, name) =>
  addDoc(notebooksCol(uid), { name, userId: uid, createdAt: serverTimestamp() });

export const updateNotebook = (uid, id, data) =>
  updateDoc(doc(db, "users", uid, "notebooks", id), data);

export const deleteNotebook = (uid, id) =>
  deleteDoc(doc(db, "users", uid, "notebooks", id));

export const subscribeNotebooks = (uid, callback) => {
  const q = query(notebooksCol(uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const addSection = (uid, bookId, name, parentSectionId = null) =>
  addDoc(sectionsCol(uid, bookId), { name, parentSectionId, userId: uid, createdAt: serverTimestamp() });

export const updateSection = (uid, bookId, sectionId, data) =>
  updateDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId), data);

export const deleteSection = (uid, bookId, sectionId) =>
  deleteDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId));

export const subscribeSections = (uid, bookId, callback) => {
  const q = query(sectionsCol(uid, bookId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
};

export const addPage = (uid, bookId, sectionId, title) =>
  addDoc(pagesCol(uid, bookId, sectionId), { title, content: "", userId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

export const updatePage = (uid, bookId, sectionId, pageId, data) =>
  updateDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId, "pages", pageId), { ...data, updatedAt: serverTimestamp() });

export const deletePage = (uid, bookId, sectionId, pageId) =>
  deleteDoc(doc(db, "users", uid, "notebooks", bookId, "sections", sectionId, "pages", pageId));

export const subscribePages = (uid, bookId, sectionId, callback) => {
  const q = query(pagesCol(uid, bookId, sectionId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
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

// --- FILTER PRESETS (synced per user in Firestore) ---
export const filterPresetsDoc = (uid) => doc(db, "users", uid, "settings", "filterPresets");

export const saveFilterPresets = (uid, presets) =>
  setDoc(filterPresetsDoc(uid), { presets }, { merge: false });

export const subscribeFilterPresets = (uid, callback) =>
  onSnapshot(filterPresetsDoc(uid), (snap) => {
    callback(snap.exists() ? (snap.data().presets || []) : []);
  });