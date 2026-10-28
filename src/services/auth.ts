import type { User } from '@supabase/supabase-js';

import { getConfiguredTimeZone, TIME_ZONE_OPTIONS } from '@/constants/options';
import { logSupabaseClientConfig, supabase } from '@/services/supabase';
import type { UserProfile } from '@/types/database';
import { logSupabaseDiagnostic, logSupabaseError, logSupabaseNoRows } from '@/utils/errors';
import { digitsOnly, isValidMexicanPhone } from '@/utils/validation';

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
}

export async function registerUser({
  nombre,
  email,
  telefono,
  password,
}: {
  nombre: string;
  email: string;
  telefono?: string;
  password: string;
}) {
  return supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        nombre: nombre.trim(),
        ...(telefono?.trim() ? { telefono: telefono.trim() } : {}),
      },
    },
  });
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'medtime://reset-password',
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export class UserProfileNotFoundError extends Error {
  readonly code = 'PROFILE_NOT_FOUND';
  readonly userId: string;

  constructor(userId: string) {
    super('No se encontró el perfil del usuario autenticado.');
    this.name = 'UserProfileNotFoundError';
    this.userId = userId;
  }
}

export async function getAuthenticatedUser() {
  logSupabaseClientConfig();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logSupabaseError('auth.getSession', sessionError);
    throw sessionError;
  }
  logSupabaseDiagnostic('auth.getSession.result', {
    hasSession: String(Boolean(sessionData.session)),
    sessionUserId: sessionData.session?.user.id,
  });
  if (!sessionData.session?.user) {
    throw new Error('No hay una sesión autenticada. Inicia sesión para continuar.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    logSupabaseError('auth.getUser', userError);
    throw userError;
  }
  if (!userData.user) {
    throw new Error('No se pudo validar el usuario autenticado. Inicia sesión nuevamente.');
  }
  if (userData.user.id !== sessionData.session.user.id) {
    throw new Error('La sesión autenticada no coincide con el usuario actual. Inicia sesión nuevamente.');
  }

  logSupabaseDiagnostic('auth.getUser.result', {
    hasSession: 'true',
    sessionUserId: sessionData.session.user.id,
    userId: userData.user.id,
    idsMatch: String(userData.user.id === sessionData.session.user.id),
  });

  return userData.user;
}

export async function getUserProfile(user: Pick<User, 'id'>) {
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', user.id).maybeSingle();
  if (error) {
    logSupabaseError('usuarios.selectProfile', error, { userId: user.id });
    throw error;
  }
  if (!data) {
    logSupabaseNoRows('usuarios.selectProfile', { userId: user.id });
    return null;
  }
  logSupabaseDiagnostic('usuarios.selectProfile.result', {
    queriedUserId: user.id,
    profileId: data.id,
    idsMatch: String(data.id === user.id),
  });
  if (data.id !== user.id) {
    throw new Error('El perfil devuelto no coincide con el usuario autenticado.');
  }
  return data as UserProfile | null;
}

export async function syncUserProfile(user: User) {
  const authenticatedUser = await getAuthenticatedUser();
  if (authenticatedUser.id !== user.id) {
    throw new Error('La sesión autenticada no coincide con el usuario actual.');
  }

  const metadataName = typeof authenticatedUser.user_metadata?.nombre === 'string' ? authenticatedUser.user_metadata.nombre.trim() : '';
  const metadataPhone = typeof authenticatedUser.user_metadata?.telefono === 'string' ? digitsOnly(authenticatedUser.user_metadata.telefono) : '';
  const metadataTimeZone = getConfiguredTimeZone(
    typeof authenticatedUser.user_metadata?.zona_horaria === 'string' ? authenticatedUser.user_metadata.zona_horaria : undefined,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getUserProfile(authenticatedUser);
    if (!existing) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }

    const updates: Partial<Pick<UserProfile, 'nombre' | 'telefono' | 'zona_horaria'>> = {};
    if (!existing.nombre?.trim() && metadataName) updates.nombre = metadataName;
    if (!existing.telefono?.trim() && isValidMexicanPhone(metadataPhone)) updates.telefono = metadataPhone;
    if (!existing.zona_horaria?.trim()) updates.zona_horaria = metadataTimeZone;
    if (!Object.keys(updates).length) return existing;

    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', authenticatedUser.id)
      .select()
      .maybeSingle();
    if (error) {
      logSupabaseError('usuarios.updateProfileMetadata', error, { userId: authenticatedUser.id });
      throw error;
    }
    if (!data) {
      throw new Error('No se pudo actualizar el perfil. Revisa las políticas de usuarios en Supabase.');
    }
    return data as UserProfile;
  }

  throw new UserProfileNotFoundError(authenticatedUser.id);
}

export async function updateUserProfile(
  values: { nombre: string; telefono: string | null; zona_horaria: string },
) {
  const user = await getAuthenticatedUser();
  if (!values.nombre.trim()) throw new Error('El nombre no puede estar vacío.');
  if (values.telefono && !isValidMexicanPhone(values.telefono)) {
    throw new Error('El teléfono debe contener 10 dígitos.');
  }
  if (!TIME_ZONE_OPTIONS.some((option) => option.value === values.zona_horaria)) {
    throw new Error('La zona horaria seleccionada no es válida.');
  }

  const existingProfile = await getUserProfile(user);
  if (!existingProfile) throw new UserProfileNotFoundError(user.id);

  const { data, error } = await supabase
    .from('usuarios')
    .update(values)
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('usuarios.updateProfile', error, { userId: user.id });
    throw error;
  }
  if (!data) {
    logSupabaseNoRows('usuarios.updateProfile', { userId: user.id });
    throw new Error('El perfil existe, pero la actualización no devolvió filas. Revisa la política UPDATE de public.usuarios.');
  }
  return data as UserProfile;
}

export function getFallbackName(user: User | null) {
  const name = user?.user_metadata?.nombre;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Usuario';
}
