import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

function extractTenant(user: User | null) {
  const appMeta: any = (user as any)?.app_metadata ?? {};
  const userMeta: any = (user as any)?.user_metadata ?? {};
  const tenantId =
    String(appMeta.tenant_id ?? userMeta.tenant_id ?? user?.id ?? "") || null;
  const role = String(appMeta.role ?? userMeta.role ?? (user ? "owner" : "")) || null;
  const permissions = (appMeta.permissions ?? userMeta.permissions ?? {}) as Record<string, boolean>;
  return { tenantId, role, permissions };
}

type AuthState = {
  tenantId: string | null;
  role: string | null;
  permissions: Record<string, boolean>;

  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set) => ({
  tenantId: null,
  role: null,
  permissions: {},
  user: null,
  session: null,
  loading: true,
  error: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await supabase.auth.getSession();
      let session = data.session ?? null;
      let u = session?.user ?? null;

      if (session?.access_token) {
        const { data: userData, error: userErr } = await supabase.auth.getUser(session.access_token);
        if (userErr || !userData?.user) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {}
          session = null;
          u = null;
        } else {
          u = userData.user;
        }
      }

      const claims = extractTenant(u);
      set({ session, user: u, ...claims });

      supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user ?? null;
        const claims = extractTenant(u);
        set({ session: session ?? null, user: u, loading: false, ...claims });
      });

      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao iniciar autenticação", loading: false });
    }
  },

  signInWithPassword: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange atualiza user/session
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha no login", loading: false });
    }
  },

  signUpWithPassword: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao criar conta", loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ user: null, session: null, loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao sair", loading: false });
    }
  },
}));
