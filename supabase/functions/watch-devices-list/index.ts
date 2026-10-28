import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { requireUser, getAdminClient } from '../_shared/server.ts';

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const user = await requireUser(request);
    await readJson(request);
    const { data, error } = await getAdminClient()
      .from('watch_devices')
      .select('id,name,device_type,device_identifier,status,linked_at,last_seen_at,created_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'linked'])
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'El backend seguro no esta disponible.');
    }

    return jsonResponse({
      devices: (Array.isArray(data) ? data : []).map((row) => {
        const device = row as Record<string, unknown>;
        return {
          id: device.id,
          name: device.name ?? null,
          type: device.device_type ?? null,
          identifier: device.device_identifier ?? null,
          status: device.status,
          linked_at: device.linked_at ?? null,
          last_synced_at: device.last_seen_at ?? null,
          created_at: device.created_at,
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
