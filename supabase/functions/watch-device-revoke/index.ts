import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredUuid } from '../_shared/http.ts';
import { callRpc, requireUser } from '../_shared/server.ts';

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const user = await requireUser(request);
    const body = await readJson(request);
    const deviceId = requiredUuid(body, 'device_id');
    const result = await callRpc('watch_revoke_device', {
      p_user_id: user.id,
      p_device_id: deviceId,
    });

    if (result.ok !== true) {
      throw new ApiError(404, 'DEVICE_NOT_FOUND', 'No se encontro un reloj activo para esta cuenta.');
    }

    return jsonResponse({
      device_id: result.device_id,
      status: result.status,
      revoked_at: result.revoked_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
