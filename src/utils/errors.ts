export function getErrorMessage(error: unknown, fallback = 'Ocurrió un error. Intenta nuevamente.') {
  const message = getRawErrorMessage(error);
  const code = getErrorCode(error);
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (code === '42501' || normalizedMessage.includes('row-level security policy')) {
    return 'Supabase rechazó la operación por seguridad. Verifica que tu sesión esté activa y que el registro pertenezca a tu usuario.';
  }
  if (code === 'PROFILE_NOT_FOUND') {
    return 'La sesión es válida, pero no se encontró un perfil para el usuario autenticado en public.usuarios. Comprueba el proyecto Supabase conectado y el ID del usuario.';
  }
  if (code === 'PGRST116' || normalizedMessage.includes('cannot coerce the result to a single json object')) {
    return 'Supabase no devolvió un único registro. Verifica que exista un solo perfil para el usuario autenticado.';
  }
  if (message) return message;

  return fallback;
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return null;
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Logs only Supabase error metadata in development; tokens and session data are never included. */
export function logSupabaseError(
  operation: string,
  error: unknown,
  context: Record<string, string | undefined> = {},
) {
  if (process.env.NODE_ENV === 'production') return;

  const details = typeof error === 'object' && error !== null ? error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
    status?: unknown;
  } : {};

  console.warn(`[Supabase] ${operation}`, {
    ...context,
    code: typeof details.code === 'string' ? details.code : undefined,
    status: typeof details.status === 'number' ? String(details.status) : undefined,
    message: typeof details.message === 'string' ? details.message : getRawErrorMessage(error),
    details: typeof details.details === 'string' ? details.details : undefined,
    hint: typeof details.hint === 'string' ? details.hint : undefined,
  });
}

export function logSupabaseNoRows(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.warn(`[Supabase] ${operation} returned 0 rows`, context);
}

export function logSupabaseDiagnostic(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[Supabase] ${operation}`, context);
}
