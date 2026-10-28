import { getAuthenticatedUser } from '@/services/auth';
import { supabase } from '@/services/supabase';
import type { WatchConnection, WatchDevice, WatchPairingApproval, WatchPairingPreview } from '@/types/watch';

export const WATCH_PAIRING_CODE_LENGTH = 6;

export class WatchApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code = 'WATCH_API_ERROR', status: number | null = null) {
    super(message);
    this.name = 'WatchApiError';
    this.code = code;
    this.status = status;
  }
}

async function assertSession(expectedUserId: string) {
  const user = await getAuthenticatedUser();
  if (user.id !== expectedUserId) throw new Error('La sesión del smartwatch no coincide con el usuario actual.');
  return user;
}

export function normalizeWatchPairingCode(value: string) {
  return value.replace(/\D/g, '').slice(0, WATCH_PAIRING_CODE_LENGTH);
}

export function validateWatchPairingCode(value: string) {
  const code = normalizeWatchPairingCode(value);
  return code.length === WATCH_PAIRING_CODE_LENGTH && /^\d+$/.test(code);
}

type WatchFunctionPayload = Record<string, unknown>;
type WatchDevicesResponse = {
  devices: {
    id: string;
    name: string | null;
    type: string | null;
    identifier: string | null;
    status: 'pending' | 'linked';
    last_synced_at: string | null;
  }[];
};

async function invokeWatchFunction<T>(name: string, body: WatchFunctionPayload): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let payload: Record<string, unknown> | null = null;
    const context = typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : null;
    if (context && typeof context === 'object' && 'clone' in context && typeof (context as { clone?: unknown }).clone === 'function') {
      try {
        const response = (context as { clone: () => { json: () => Promise<unknown> } }).clone();
        const parsed = await response.json();
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch {
        // The SDK error message remains the fallback when the response body is unavailable.
      }
    }

    const code = typeof payload?.error === 'string' ? payload.error : 'WATCH_API_ERROR';
    const message = typeof payload?.message === 'string' ? payload.message : 'No se pudo completar la operación del smartwatch.';
    const status = context && typeof context === 'object' && 'status' in context && typeof (context as { status?: unknown }).status === 'number'
      ? (context as { status: number }).status
      : null;
    throw new WatchApiError(message, code, status);
  }
  if (!data) throw new WatchApiError('El backend no devolvió una respuesta válida.');
  return data;
}

export async function getWatchDevices(userId: string): Promise<WatchDevice[]> {
  await assertSession(userId);
  const response = await invokeWatchFunction<WatchDevicesResponse>('watch-devices-list', {});
  return response.devices.map((device) => ({
    id: device.id,
    name: device.name,
    type: device.type,
    identifier: device.identifier,
    status: device.status,
    lastSyncedAt: device.last_synced_at,
  }));
}

export async function getWatchConnection(userId: string): Promise<WatchConnection> {
  const devices = await getWatchDevices(userId);
  if (!devices.length) {
    return { state: 'no_device', devices, message: 'No hay un smartwatch vinculado a esta cuenta.' };
  }
  if (devices.some((device) => device.status === 'linked')) {
    return { state: 'linked', devices, message: 'El smartwatch está vinculado y puede sincronizar sus dosis.' };
  }
  return { state: 'pending', devices, message: 'La aprobación móvil se completó; espera a que el reloj reclame sus credenciales.' };
}

export async function previewWatchPairing(userId: string, code: string): Promise<WatchPairingPreview> {
  await assertSession(userId);
  if (!validateWatchPairingCode(code)) throw new Error(`El código debe tener ${WATCH_PAIRING_CODE_LENGTH} dígitos.`);
  const response = await invokeWatchFunction<{
    request_id: string;
    device_name: string;
    device_type: string;
    status: 'pending' | 'approved' | 'claimed';
    expires_at: string;
    can_approve: boolean;
  }>('watch-pair-preview', { code: normalizeWatchPairingCode(code) });
  return {
    requestId: response.request_id,
    deviceName: response.device_name,
    deviceType: response.device_type,
    status: response.status,
    expiresAt: response.expires_at,
    canApprove: response.can_approve,
  };
}

export async function approveWatchPairing(userId: string, requestId: string, code: string): Promise<WatchPairingApproval> {
  await assertSession(userId);
  if (!validateWatchPairingCode(code)) throw new Error(`El código debe tener ${WATCH_PAIRING_CODE_LENGTH} dígitos.`);
  const response = await invokeWatchFunction<{
    request_id: string;
    device_id: string;
    status: 'pending' | 'linked';
    linked_at: string | null;
    expires_at: string;
  }>('watch-pair-approve', { request_id: requestId, code: normalizeWatchPairingCode(code) });
  return {
    requestId: response.request_id,
    deviceId: response.device_id,
    status: response.status,
    linkedAt: response.linked_at,
    expiresAt: response.expires_at,
  };
}

export async function unlinkWatchDevice(userId: string, deviceId: string) {
  await assertSession(userId);
  if (!deviceId.trim()) throw new Error('No se recibió un identificador de dispositivo válido.');
  await invokeWatchFunction('watch-device-revoke', { device_id: deviceId });
}
