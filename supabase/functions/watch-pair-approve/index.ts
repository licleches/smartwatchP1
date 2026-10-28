import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredString, requiredUuid } from '../_shared/http.ts';
import { pairingCode, pairingResultFailure } from '../_shared/pairing.ts';
import { callRpc, consumeRateLimit, hashPairingCode, requireUser, requestRateLimitKey } from '../_shared/server.ts';

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const user = await requireUser(request);
    const body = await readJson(request);
    const requestId = requiredUuid(body, 'request_id');
    const code = pairingCode(requiredString(body, 'code', 6));

    const allowedByUser = await consumeRateLimit(`pair-approve:${user.id}:${requestId}`, 60, 10);
    const allowedByAddress = await consumeRateLimit(requestRateLimitKey(request, 'pair-approve-address'), 60, 20);
    if (!allowedByUser || !allowedByAddress) {
      throw new ApiError(429, 'RATE_LIMITED', 'Espera un momento antes de volver a intentarlo.');
    }

    const result = await callRpc('watch_pair_approve', {
      p_request_id: requestId,
      p_pairing_code_hash: await hashPairingCode(code),
      p_user_id: user.id,
    });
    pairingResultFailure(result);

    return jsonResponse({
      request_id: result.request_id,
      device_id: result.device_id,
      status: result.status,
      linked_at: result.linked_at ?? null,
      expires_at: result.expires_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
