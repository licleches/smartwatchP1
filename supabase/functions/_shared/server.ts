import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

import { ApiError, getBearerToken, getRequestAddress, isRecord } from './http.ts';

let adminClient: SupabaseClient | null = null;

export function getAdminClient() {
  if (adminClient) return adminClient;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta configurado.');
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
}

export async function requireUser(request: Request): Promise<User> {
  const token = getBearerToken(request);
  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'La sesion no es valida.');
  }
  return data.user;
}

export async function requireDevice(request: Request) {
  const token = getBearerToken(request);
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'La credencial del reloj no tiene un formato valido.');
  }
  const tokenHash = await hashText(token);
  const result = await callRpc('watch_authenticate_device', { p_token_hash: tokenHash });

  if (result.ok !== true || typeof result.device_id !== 'string' || typeof result.user_id !== 'string') {
    throw new ApiError(401, 'INVALID_DEVICE_TOKEN', 'La credencial del reloj es invalida, expiro o fue revocada.');
  }

  return {
    deviceId: result.device_id,
    userId: result.user_id,
  };
}

export async function callRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await getAdminClient().rpc(name, args);
  if (error || !isRecord(data)) {
    throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
  }
  return data;
}

export async function consumeRateLimit(key: string, windowSeconds: number, maxAttempts: number) {
  const keyHash = await hashRateLimitKey(key);
  const { data, error } = await getAdminClient().rpc('watch_consume_rate_limit', {
    p_key_hash: keyHash,
    p_window_seconds: windowSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error || typeof data !== 'boolean') {
    throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
  }
  return data;
}

export async function hashText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function requirePairingCodeSalt() {
  const salt = Deno.env.get('WATCH_PAIRING_CODE_SALT');
  if (!salt || salt.length < 32) {
    throw new ApiError(503, 'BACKEND_NOT_READY', 'Falta configurar el secreto de codigos de vinculacion.');
  }
  return salt;
}

export async function hashPairingCode(value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requirePairingCodeSalt()),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomDigits(length: number) {
  const upperBound = 10 ** length;
  const maxUint32 = 2 ** 32;
  const acceptedLimit = Math.floor(maxUint32 / upperBound) * upperBound;
  const sample = new Uint32Array(1);

  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= acceptedLimit);

  return String(sample[0] % upperBound).padStart(length, '0');
}

export async function hashRateLimitKey(value: string) {
  const salt = Deno.env.get('WATCH_RATE_LIMIT_SALT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'watch-rate-limit';
  return hashText(`${salt}:${value}`);
}

export function requestRateLimitKey(request: Request, scope: string) {
  return `${scope}:${getRequestAddress(request)}`;
}
