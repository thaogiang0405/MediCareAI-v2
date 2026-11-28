import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { services, firebaseError } from "@/lib/firebase";
import { readProfile, type Profile } from "@/features/profile/profile";
import { authError } from "./validation";
import { clearMedicationReminders } from "@/features/medication/reminders";

type Session = { status: "loading" | "guest" | "missing" | "ready" | "error"; user: User | null; profile: Profile | null; message?: string };
type Context = Session & { refresh: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<Context | null>(null);
const loading: Session = { status: "loading", user: null, profile: null };

function invalidateGeneration(counter: { current: number }) {
  counter.current += 1;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() =>
    services
      ? loading
      : { status: "error", user: null, profile: null, message: firebaseError ?? undefined },
  );
  const generation = useRef(0);
  const load = useCallback(async (user: User | null, preserve = false) => {
    const ticket = ++generation.current;
    if (!preserve) setSession({ status: user ? "loading" : "guest", user, profile: null });
    if (!user) return;
    try {
      const profile = await readProfile(user);
      if (ticket === generation.current && services?.auth.currentUser?.uid === user.uid)
        setSession({ status: profile ? "ready" : "missing", user, profile });
    } catch (e) {
      if (ticket === generation.current && services?.auth.currentUser?.uid === user.uid)
        setSession({ status: "error", user, profile: null, message: authError(e) });
    }
  }, []);
  useEffect(() => {
    if (!services) return;
    const unsubscribe = onAuthStateChanged(services.auth, user => { void load(user); }, () => {
      ++generation.current;
      setSession({ status: "error", user: null, profile: null, message: "Không thể xác minh phiên đăng nhập." });
    });
    return () => {
      invalidateGeneration(generation);
      unsubscribe();
    };
  }, [load]);
  async function refresh() {
    if (services) await load(services.auth.currentUser, session.status === "ready" && session.user?.uid === services.auth.currentUser?.uid);
  }
  async function logout() {
    if (!services) return;
    ++generation.current;
    setSession(loading);
    try {
      // Cancel this app's local medication reminders before releasing the session.
      await clearMedicationReminders().catch(() => {});
      await signOut(services.auth);
    }
    finally { await load(services.auth.currentUser); }
  }
  return <AuthContext.Provider value={{ ...session, refresh, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
