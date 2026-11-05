import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import type { Repo } from "./repo";
import { createSupabaseRepo } from "./supabaseRepo";
import { createLocalRepo, resetDemoData } from "./localRepo";
import { safeStorage } from "@/lib/utils";

const DEMO_FLAG = "cf-demo-mode";
const store = safeStorage();

type Status = "loading" | "signedOut" | "signedIn";

interface SessionCtx {
  status: Status;
  mode: "supabase" | "demo" | null;
  email: string | null;
  userId: string | null;
  repo: Repo | null;
  passwordRecovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  enterDemo(): void;
  resetDemo(): void;
  signOut(): Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

function translateError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha inválidos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar.",
    "User already registered": "Este e-mail já está cadastrado.",
  };
  return new Error(map[msg] ?? msg);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(() => store.get(DEMO_FLAG) === "1");
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const enterDemo = useCallback(() => {
    store.set(DEMO_FLAG, "1");
    setDemo(true);
  }, []);

  const value = useMemo<SessionCtx>(() => {
    let repo: Repo | null = null;
    let mode: SessionCtx["mode"] = null;
    if (demo) {
      repo = createLocalRepo();
      mode = "demo";
    } else if (session && supabase) {
      repo = createSupabaseRepo(supabase, session.user.id);
      mode = "supabase";
    }
    const status: Status = demo ? "signedIn" : !ready ? "loading" : session ? "signedIn" : "signedOut";

    return {
      status,
      mode,
      repo,
      passwordRecovery,
      email: demo ? "demo@exemplo.com" : (session?.user.email ?? null),
      userId: demo ? "demo" : (session?.user.id ?? null),
      async signIn(email, password) {
        if (email.trim().toLowerCase() === "teste" && password === "teste") {
          enterDemo();
          return;
        }
        if (!supabase) throw new Error("Supabase não configurado. Use o acesso de demonstração.");
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw translateError(error);
      },
      async signUp(name, email, password) {
        if (!supabase) throw new Error("Supabase não configurado.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw translateError(error);
        return { needsConfirmation: !data.session };
      },
      async sendPasswordReset(email) {
        if (!supabase) throw new Error("Supabase não configurado.");
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
        if (error) throw translateError(error);
      },
      async updatePassword(password) {
        if (!supabase) throw new Error("Supabase não configurado.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw translateError(error);
        setPasswordRecovery(false);
      },
      enterDemo,
      resetDemo() {
        resetDemoData();
      },
      async signOut() {
        if (demo) {
          store.remove(DEMO_FLAG);
          setDemo(false);
          return;
        }
        await supabase?.auth.signOut();
      },
    };
  }, [demo, session, ready, passwordRecovery, enterDemo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession fora do provider");
  return ctx;
}
