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