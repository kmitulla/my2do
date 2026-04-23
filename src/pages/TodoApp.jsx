import React, { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import LoginPage from "@/components/todo/LoginPage.jsx";
import Dashboard from "@/components/todo/Dashboard";
import SplashScreen from "@/components/todo/SplashScreen.jsx";

export default function TodoApp() {
  const { user, loading } = useFirebaseAuth();
  const [showSplash, setShowSplash] = useState(true);

  if (loading && showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      {!user ? <LoginPage /> : <Dashboard />}
    </>
  );
}