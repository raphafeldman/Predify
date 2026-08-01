import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  isPlatformAdmin: boolean;
  /**
   * Administrador da plataforma que NÃO pertence a nenhum condomínio —
   * o operador puro do produto, para quem o app é só o painel de
   * administração.
   *
   * Ser admin não implica isso: um síndico pode administrar a plataforma
   * e continuar tocando o próprio condomínio. Enquanto essa distinção não
   * existia, a conta de admin perdia acesso a todas as funções de
   * condomínio — Encomendas, Documentos, Equipamentos — e a única saída
   * era manter duas contas.
   */
  isSomenteAdminPlataforma: boolean;
  loading: boolean;
  blockedMessage: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setIsPlatformAdmin(false);
        setLoading(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoading(true);
    loadProfile(session.user.id, () => cancelled).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Checa profiles e platform_admins em paralelo — uma conta pode ter as
  // duas coisas (ex: você mesmo, síndico do condomínio de teste e também
  // administrador da plataforma). Ser admin da plataforma tem prioridade
  // na navegação, mas não exige ausência de perfil.
  async function loadProfile(userId: string, cancelled: () => boolean) {
    const [{ data, error }, { data: adminRow }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]);
    if (cancelled()) return;

    if (error) {
      console.error('Erro ao carregar perfil:', error.message);
      setProfile(null);
      setIsPlatformAdmin(false);
      return;
    }

    if (adminRow) {
      setProfile((data as Profile | null) ?? null);
      setIsPlatformAdmin(true);
      return;
    }

    if (!data) {
      setBlockedMessage('Sua conta não está associada a nenhum condomínio. Fale com o administrador.');
      await supabase.auth.signOut();
      setProfile(null);
      setIsPlatformAdmin(false);
      return;
    }

    const loadedProfile = data as Profile;
    if (!loadedProfile.active) {
      setBlockedMessage('Sua conta foi bloqueada pelo síndico. Fale com ele para mais informações.');
      await supabase.auth.signOut();
      setProfile(null);
      setIsPlatformAdmin(false);
      return;
    }

    setProfile(loadedProfile);
    setIsPlatformAdmin(false);
  }

  async function refreshProfile() {
    if (!session) return;
    await loadProfile(session.user.id, () => false);
  }

  async function signIn(email: string, password: string) {
    setBlockedMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? traduzErro(error.message) : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isPlatformAdmin,
        isSomenteAdminPlataforma: isPlatformAdmin && !profile?.condominio_id,
        loading,
        blockedMessage,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de um AuthProvider');
  return ctx;
}

function traduzErro(message: string) {
  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  return message;
}
