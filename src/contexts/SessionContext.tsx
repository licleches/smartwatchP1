import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getFallbackName, syncUserProfile } from '@/services/auth';
import { cancelAllReminderNotifications } from '@/services/notifications';
import { logSupabaseClientConfig, supabase } from '@/services/supabase';
import type { UserProfile } from '@/types/database';
import { getErrorMessage, logSupabaseDiagnostic, logSupabaseError } from '@/utils/errors';

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  profileError: string | null;
  displayName: string;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileLoadVersion = useRef(0);

  const loadProfile = useCallback(async (user: User | null) => {
    const loadVersion = profileLoadVersion.current + 1;
    profileLoadVersion.current = loadVersion;
    setProfileError(null);
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const nextProfile = await syncUserProfile(user);
      if (loadVersion !== profileLoadVersion.current) return;
      setProfile(nextProfile);
    } catch (error) {
      if (loadVersion !== profileLoadVersion.current) return;
      logSupabaseError('SessionContext.loadProfile', error, { userId: user.id });
      setProfile(null);
      setProfileError(getErrorMessage(error, 'No se pudo cargar tu perfil.'));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authRestored = false;
    let pendingAuthEvent: { event: string; session: Session | null } | null = null;
    logSupabaseClientConfig();

    function applySession(nextSession: Session | null) {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        profileLoadVersion.current += 1;
        setProfile(null);
        setProfileError(null);
        setIsLoading(false);
        return;
      }

      setProfile(null);
      setProfileError(null);
      setIsLoading(true);
      const requestedVersion = profileLoadVersion.current + 1;
      void loadProfile(nextSession.user).finally(() => {
        if (mounted && profileLoadVersion.current === requestedVersion) setIsLoading(false);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      logSupabaseDiagnostic('auth.stateChange', {
        event,
        hasSession: String(Boolean(nextSession)),
        userId: nextSession?.user.id,
      });

      // getSession() is the source of truth for INITIAL_SESSION. This prevents
      // the auth listener from exposing a temporary null session while storage
      // restoration is still in progress.
      if (event === 'INITIAL_SESSION') return;
      if (!authRestored) {
        pendingAuthEvent = { event, session: nextSession };
        return;
      }
      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession);
        return;
      }
      setTimeout(() => applySession(nextSession), 0);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!mounted) return;
        authRestored = true;
        logSupabaseDiagnostic('auth.sessionRestored', {
          hasSession: String(Boolean(initialSession)),
          userId: initialSession?.user.id,
        });
        applySession(initialSession);
        if (pendingAuthEvent) applySession(pendingAuthEvent.session);
      })
      .catch((error) => {
        if (!mounted) return;
        authRestored = true;
        logSupabaseError('auth.getSession.initial', error);
        if (pendingAuthEvent) {
          applySession(pendingAuthEvent.session);
        } else {
          setProfileError(getErrorMessage(error, 'No se pudo validar la sesión.'));
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user ?? null);
  }, [loadProfile, session?.user]);

  const signOut = useCallback(async () => {
    try {
      await cancelAllReminderNotifications();
    } catch {
      // La sesión aún debe cerrarse si el sistema no puede cancelar un aviso local.
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      displayName: profile?.nombre?.trim() || getFallbackName(session?.user ?? null),
      isLoading,
      refreshProfile,
      signOut,
    }),
    [isLoading, profile, profileError, refreshProfile, session, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession debe utilizarse dentro de SessionProvider.');
  }
  return context;
}
