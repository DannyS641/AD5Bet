import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  needsMfa: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null; needsMfa: boolean }>;
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshMfaStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getMfaStatus() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    return { needsMfa: false };
  }
  return {
    needsMfa: data.currentLevel === "aal1" && data.nextLevel === "aal2",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    const status = await getMfaStatus();
    setNeedsMfa(status.needsMfa);
  }, []);

  useEffect(() => {
    if (session) {
      refreshMfaStatus();
    } else {
      setNeedsMfa(false);
    }
  }, [session, refreshMfaStatus]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message, needsMfa: false };
      }
      const status = await getMfaStatus();
      setNeedsMfa(status.needsMfa);
      return { error: null, needsMfa: status.needsMfa };
    },
    []
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return error.message;
      }

      if (data.session) {
        await refreshMfaStatus();
      }

      return null;
    },
    [refreshMfaStatus]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      needsMfa,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshMfaStatus,
    }),
    [session, user, loading, needsMfa, signInWithPassword, signUpWithPassword, signOut, refreshMfaStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
