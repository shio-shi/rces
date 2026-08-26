import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  description: string;
  rawbux: number;
  last_daily_at: string;
  is_banned: boolean;
  ban_reason: string | null;
  ban_until: string | null;
  created_at: string;
};

type AuthValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  profile: null,
  loading: true,
  refresh: async () => {},
});

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@rawblox.local`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session?.user.id);
  }, [loadProfile]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setTimeout(() => {
        void loadProfile(next?.user.id);
      }, 0);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        await supabase.rpc("claim_daily");
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    })();

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
