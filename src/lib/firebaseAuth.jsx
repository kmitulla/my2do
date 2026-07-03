import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db, firebaseConfig } from "./firebase";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const FirebaseAuthContext = createContext({});

export const useFirebaseAuth = () => useContext(FirebaseAuthContext);

export const FirebaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        const publicProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email,
        };
        // Always upsert public profile for sharing feature
        await setDoc(doc(db, "userProfiles", firebaseUser.uid), publicProfile, { merge: true });

        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data());
        } else {
          const profile = {
            ...publicProfile,
            role: "user",
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, "users", firebaseUser.uid), profile);
          setUserProfile(profile);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  // User anlegen über eine sekundäre Firebase-App-Instanz:
  // createUserWithEmailAndPassword meldet sonst den Admin ab und den neuen User an.
  const createUser = async (email, password, displayName) => {
    const secondary = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
    try {
      const secAuth = getAuth(secondary);
      const secDb = getFirestore(secondary);
      const cred = await createUserWithEmailAndPassword(secAuth, email, password);
      await updateProfile(cred.user, { displayName });
      const profile = { uid: cred.user.uid, email, displayName, role: "user", createdAt: serverTimestamp() };
      // Profil-Dokumente als der neue User selbst schreiben (Owner-Rechte in den Rules)
      await setDoc(doc(secDb, "users", cred.user.uid), profile);
      await setDoc(doc(secDb, "userProfiles", cred.user.uid), { uid: cred.user.uid, email, displayName }, { merge: true });
      await signOut(secAuth);
      return cred;
    } finally {
      await deleteApp(secondary).catch(() => {});
    }
  };

  const isAdmin = userProfile?.role === "admin";

  return (
    <FirebaseAuthContext.Provider value={{ user, userProfile, loading, login, logout, createUser, isAdmin }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};