import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLjBN11gsUL9SevfKkffhUjM_mUbe3Fa4",
  authDomain: "test2do-3adca.firebaseapp.com",
  projectId: "test2do-3adca",
  storageBucket: "test2do-3adca.firebasestorage.app",
  messagingSenderId: "617918578505",
  appId: "1:617918578505:web:ac52b0a067f9bd6db9a498",
  measurementId: "G-39NR0820HY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Login persistent (bleibt gespeichert)
setPersistence(auth, browserLocalPersistence);

export default app;