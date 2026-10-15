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
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Default-Einblendedauer des Rückgängig-Banners (Sekunden)
export const DEFAULT_UNDO_DURATION_SEC = 4;

// Firebase-Auth-Fehlercodes → verständliche Meldungen
const AUTH_ERRORS = {
  "auth/invalid-email": "Ungültige E-Mail-Adresse.",
  "auth/missing-email": "Bitte E-Mail-Adresse eingeben.",
  "auth/wrong-password": "Das aktuelle Passwort ist falsch.",
  "auth/invalid-credential": "Das aktuelle Passwort ist falsch.",
  "auth/invalid-login-credentials": "Das aktuelle Passwort ist falsch.",
  "auth/weak-password": "Das neue Passwort ist zu schwach (mindestens 6 Zeichen).",
  "auth/password-does-not-meet-requirements": "Das neue Passwort erfüllt die Passwort-Richtlinien nicht.",
  "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten und erneut versuchen.",
  "auth/network-request-failed": "Keine Internetverbindung. Bitte später erneut versuchen.",
  "auth/requires-recent-login": "Bitte einmal ab- und wieder anmelden und es dann erneut versuchen.",
};

export const authErrorMessage = (err) =>
  AUTH_ERRORS[err?.code] || "Fehler: " + (err?.message || err);

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
        const publicProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email,
        };
        // Always upsert public profile for sharing feature.
        // Kein await: mit Offline-Persistenz resolven Writes erst nach
        // Server-Ack – ein await würde die App offline dauerhaft im
        // Ladebildschirm blockieren. Der Write wird gequeued und gesynct.
        setDoc(doc(db, "userProfiles", firebaseUser.uid), publicProfile, { merge: true }).catch(() => {});

        let profileDoc = null;
        try {
          // Offline wird das Profil aus dem lokalen Cache bedient
          profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        } catch {
          // offline + Cache-Miss (allererster Start) → Default-Profil unten
        }

        if (profileDoc?.exists()) {
          setUserProfile(profileDoc.data());
        } else {
          const profile = {
            ...publicProfile,
            role: "user",
            createdAt: serverTimestamp(),
          };
          setDoc(doc(db, "users", firebaseUser.uid), profile).catch(() => {});
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

  // Link zum Zurücksetzen des Passworts per E-Mail senden. Der Link führt
  // nach dem Zurücksetzen zurück zur App – ist die Domain in Firebase nicht
  // als "Authorized domain" freigegeben, wird ohne Rücksprung-Link gesendet.
  const resetPassword = async (email) => {
    const continueUrl = window.location.origin + window.location.pathname;
    try {
      await sendPasswordResetEmail(auth, email, { url: continueUrl });
    } catch (err) {
      if (err?.code !== "auth/unauthorized-continue-uri" && err?.code !== "auth/invalid-continue-uri") throw err;
      await sendPasswordResetEmail(auth, email);
    }
  };

  // Passwort ändern: Firebase verlangt für updatePassword eine frische
  // Anmeldung (sonst auth/requires-recent-login) – daher zuerst mit dem
  // aktuellen Passwort re-authentifizieren.
  const changePassword = async (currentPassword, newPassword) => {
    const current = auth.currentUser;
    const cred = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, cred);
    await updatePassword(current, newPassword);
  };

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

  // Einstellungen ins Profil schreiben (users/{uid}) und lokalen State sofort
  // aktualisieren. Firestore synchronisiert das Profil geräteübergreifend.
  const updateUserProfile = async (updates) => {
    if (!user) return;
    setUserProfile((prev) => ({ ...(prev || {}), ...updates }));
    await setDoc(doc(db, "users", user.uid), updates, { merge: true });
  };

  const isAdmin = userProfile?.role === "admin";

  return (
    <FirebaseAuthContext.Provider value={{ user, userProfile, loading, login, logout, resetPassword, changePassword, createUser, isAdmin, updateUserProfile }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};