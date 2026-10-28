import { ApiError } from './http.ts';

export function pairingCode(value: unknown) {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value.trim())) {
    throw new ApiError(400, 'INVALID_CODE', 'El codigo debe contener exactamente 6 digitos.');
  }
  return value.trim();
}

export function challengeSecret(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value.trim())) {
    throw new ApiError(400, 'INVALID_CHALLENGE', 'El secreto de desafio no es valido.');
  }
  return value.trim().toLowerCase();
}

export function pairingResultFailure(result: Record<string, unknown>): never | void {
  if (result.ok === true) return;

  switch (result.reason) {
    case 'not_found':
      throw new ApiError(404, 'PAIRING_NOT_FOUND', 'La solicitud de vinculacion no existe.');
    case 'invalid_code':
      throw new ApiError(400, 'INVALID_CODE', 'El codigo no es valido.');
    case 'used':
      throw new ApiError(409, 'PAIRING_CODE_USED', 'El codigo de vinculacion ya fue utilizado.');
    case 'locked':
      throw new ApiError(429, 'PAIRING_LOCKED', 'La solicitud supero el limite de intentos.');
    case 'expired':
      throw new ApiError(409, 'PAIRING_EXPIRED', 'El codigo de vinculacion expiro.');
    case 'revoked':
      throw new ApiError(409, 'PAIRING_REVOKED', 'La solicitud de vinculacion fue revocada.');
    case 'already_approved':
      throw new ApiError(409, 'PAIRING_ALREADY_APPROVED', 'La solicitud ya fue aprobada por otra cuenta.');
    case 'device_exists':
      throw new ApiError(409, 'DEVICE_ALREADY_LINKED', 'Este reloj ya esta vinculado a la cuenta.');
    case 'device_not_ready':
      throw new ApiError(409, 'DEVICE_NOT_READY', 'El dispositivo aun no esta listo para recibir credenciales.');
    case 'device_revoked':
      throw new ApiError(409, 'DEVICE_REVOKED', 'El dispositivo fue revocado y debe vincularse nuevamente.');
    case 'invalid_challenge':
      throw new ApiError(401, 'INVALID_CHALLENGE', 'El secreto de desafio no es valido.');
    default:
      throw new ApiError(409, 'PAIRING_UNAVAILABLE', 'La solicitud de vinculacion ya no esta disponible.');
  }
}
