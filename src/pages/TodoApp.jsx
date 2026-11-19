import React, { useState } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import { windowKind } from "@/lib/desktop";
import LoginPage from "@/components/todo/LoginPage.jsx";
import Dashboard from "@/components/todo/Dashboard";
import SplashScreen from "@/components/todo/SplashScreen.jsx";
import DesktopWorkspace from "@/components/desktop/DesktopWorkspace";

// Windows-App: ohne Splash, Anmeldung mit verschiebbarer Titelleiste,
// danach die Desktop-Arbeitsfläche
function DesktopApp() {
  const { user, loading } = useFirebaseAuth();
  if (user) return <DesktopWorkspace />;
  return (
    <div className="h-screen flex flex-col">
      <div className="dt-titlebar flex-shrink-0">
        <div className="flex items-center gap-2.5 dt-titlebar-brand">
          <div className="w-7 h-7 rounded-[9px] bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <span className="text-[14px] font-semibold text-slate-700">2Do</span>
        </div>
      </div>
      <div className="dt-login flex-1 min-h-0 overflow-y-auto relative">
        {loading
          ? <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
          : <LoginPage />}
      </div>
    </div>
  );
}

export default function TodoApp() {
  const { user, loading } = useFirebaseAuth();
  const [showSplash, setShowSplash] = useState(true);

  if (windowKind === "main") return <DesktopApp />;

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
