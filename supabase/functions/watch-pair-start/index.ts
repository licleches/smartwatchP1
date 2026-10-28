import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredString } from '../_shared/http.ts';
import { callRpc, consumeRateLimit, hashPairingCode, hashText, randomDigits, randomHex, requestRateLimitKey, requirePairingCodeSalt } from '../_shared/server.ts';

const CODE_LENGTH = 6;

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const body = await readJson(request);
    const deviceName = requiredString(body, 'device_name', 80);
    const deviceType = requiredString(body, 'device_type', 30);
    const deviceIdentifier = requiredString(body, 'device_identifier', 200);
    if (deviceType !== 'wear_os') {
      throw new ApiError(400, 'INVALID_DEVICE_TYPE', 'El tipo de dispositivo no es compatible.');
    }

    requirePairingCodeSalt();
    const allowedByAddress = await consumeRateLimit(requestRateLimitKey(request, 'pair-start-address'), 60, 20);
    const allowedByDevice = await consumeRateLimit(requestRateLimitKey(request, `pair-start:${deviceIdentifier}`), 60, 5);
    if (!allowedByAddress || !allowedByDevice) {
      throw new ApiError(429, 'RATE_LIMITED', 'Espera un momento antes de solicitar otro codigo.');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const requestId = crypto.randomUUID();
      const code = randomDigits(CODE_LENGTH);
      const challengeSecret = randomHex(32);
      const result = await callRpc('watch_start_pairing', {
        p_request_id: requestId,
        p_pairing_code_hash: await hashPairingCode(code),
        p_challenge_secret_hash: await hashText(challengeSecret),
        p_device_name: deviceName,
        p_device_identifier: deviceIdentifier,
        p_device_type: deviceType,
      });

      if (result.ok === true) {
        if (typeof result.request_id !== 'string' || typeof result.expires_at !== 'string') {
          throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
        }

        return jsonResponse(
          {
            request_id: result.request_id,
            code,
            challenge_secret: challengeSecret,
            expires_at: result.expires_at,
          },
          201,
        );
      }

      if (result.reason === 'active_request') {
        throw new ApiError(409, 'ACTIVE_REQUEST', 'Este reloj ya tiene una solicitud de vinculacion activa.');
      }

      if (result.reason === 'code_collision' && attempt < 2) continue;

      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo generar una solicitud segura.');
    }

    throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo generar una solicitud segura.');
  } catch (error) {
    return errorResponse(error);
  }
});
