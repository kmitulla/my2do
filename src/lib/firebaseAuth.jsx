import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
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

  const createUser = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    const profile = { uid: cred.user.uid, email, displayName, role: "user", createdAt: serverTimestamp() };
    await setDoc(doc(db, "users", cred.user.uid), profile);
    // Also write public profile
    await setDoc(doc(db, "userProfiles", cred.user.uid), { uid: cred.user.uid, email, displayName }, { merge: true });
    return cred;
  };

  const isAdmin = userProfile?.role === "admin";

  return (
    <FirebaseAuthContext.Provider value={{ user, userProfile, loading, login, logout, createUser, isAdmin }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};