import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredUuid } from '../_shared/http.ts';
import { challengeSecret, pairingResultFailure } from '../_shared/pairing.ts';
import { callRpc, consumeRateLimit, hashText, randomHex, requestRateLimitKey } from '../_shared/server.ts';

const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const body = await readJson(request);
    const requestId = requiredUuid(body, 'request_id');
    const secret = challengeSecret(body.challenge_secret);

    const allowed = await consumeRateLimit(requestRateLimitKey(request, `pair-status:${requestId}`), 60, 30);
    if (!allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'Espera antes de consultar nuevamente.');
    }

    const deviceToken = randomHex(32);
    const tokenExpiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS).toISOString();
    const result = await callRpc('watch_pair_claim_token', {
      p_request_id: requestId,
      p_challenge_secret_hash: await hashText(secret),
      p_token_hash: await hashText(deviceToken),
      p_token_expires_at: tokenExpiresAt,
    });
    pairingResultFailure(result);

    const response: Record<string, unknown> = {
      request_id: requestId,
      status: result.status,
      device_id: result.device_id ?? null,
      expires_at: result.expires_at ?? null,
    };

    if (result.token_issued === true) {
      response.device_token = deviceToken;
      response.token_expires_at = result.token_expires_at ?? tokenExpiresAt;
    }

    return jsonResponse(response);
  } catch (error) {
    return errorResponse(error);
  }
});
