import { db } from "./firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
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
  // Create a shared document
  const sharedRef = await addDoc(sharedTodosCol(), {
    ...todo,
    id: undefined,
    sharedBy: senderUid,
    sharedByName: senderName,
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
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "sharedTodos", sharedTodoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};