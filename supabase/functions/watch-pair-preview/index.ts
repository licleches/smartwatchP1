import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredString, requiredUuid } from '../_shared/http.ts';
import { pairingCode, pairingResultFailure } from '../_shared/pairing.ts';
import { callRpc, consumeRateLimit, hashPairingCode, requireUser, requestRateLimitKey } from '../_shared/server.ts';

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const user = await requireUser(request);
    const body = await readJson(request);
    const requestId = body.request_id === undefined || body.request_id === null ? null : requiredUuid(body, 'request_id');
    const code = pairingCode(requiredString(body, 'code', 6));

    const allowedByUser = await consumeRateLimit(`pair-preview:${user.id}`, 60, 10);
    const allowedByAddress = await consumeRateLimit(requestRateLimitKey(request, 'pair-preview-address'), 60, 20);
    if (!allowedByUser || !allowedByAddress) {
      throw new ApiError(429, 'RATE_LIMITED', 'Espera un momento antes de volver a intentarlo.');
    }

    const result = await callRpc('watch_pair_preview', {
      p_request_id: requestId,
      p_pairing_code_hash: await hashPairingCode(code),
    });
    pairingResultFailure(result);

    return jsonResponse({
      request_id: result.request_id,
      device_name: result.device_name,
      device_type: result.device_type,
      status: result.status,
      expires_at: result.expires_at,
      can_approve: result.status === 'pending',
    });
  } catch (error) {
    return errorResponse(error);
  }
});
