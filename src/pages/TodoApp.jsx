import React, { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/firebaseAuth";
import LoginPage from "@/components/todo/LoginPage";
import Dashboard from "@/components/todo/Dashboard";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function TodoApp() {
  const { user, loading } = useFirebaseAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/70 backdrop-blur-xl shadow-lg flex items-center justify-center border border-white/50 animate-pulse">
            <span className="text-2xl">✓</span>
          </div>
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Dashboard />;
}