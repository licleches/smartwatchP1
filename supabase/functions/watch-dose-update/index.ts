import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, readJson, requiredString, requiredUuid } from '../_shared/http.ts';
import { getAdminClient, requireDevice } from '../_shared/server.ts';

const ALLOWED_STATUSES = ['confirmada', 'omitida', 'pospuesta'] as const;
const ALLOWED_POSTPONE_MINUTES = [15, 30, 60, 120] as const;
type DoseAction = (typeof ALLOWED_STATUSES)[number];

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    const body = await readJson(request);
    const doseId = requiredUuid(body, 'dose_id');
    const statusValue = requiredString(body, 'status', 20) as DoseAction;
    if (!ALLOWED_STATUSES.includes(statusValue)) {
      throw new ApiError(400, 'INVALID_STATUS', 'La accion para la dosis no es valida.');
    }

    let postponedUntil: string | null = null;
    if (statusValue === 'pospuesta') {
      const postponeMinutes = body.postpone_minutes;
      if (
        typeof postponeMinutes !== 'number'
        || !Number.isInteger(postponeMinutes)
        || !ALLOWED_POSTPONE_MINUTES.includes(postponeMinutes as (typeof ALLOWED_POSTPONE_MINUTES)[number])
      ) {
        throw new ApiError(400, 'INVALID_POSTPONEMENT', 'Solo se permiten posposiciones de 15, 30, 60 o 120 minutos.');
      }
      postponedUntil = new Date(Date.now() + postponeMinutes * 60 * 1000).toISOString();
    }

    const admin = getAdminClient();
    const { data: medications, error: medicationsError } = await admin
      .from('medicamentos')
      .select('id')
      .eq('usuario_id', device.userId);
    if (medicationsError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo validar la propiedad de la dosis.');
    }

    const medicationIds = (Array.isArray(medications) ? medications : [])
      .map((row) => (row as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === 'string');
    if (!medicationIds.length) {
      throw new ApiError(404, 'DOSE_NOT_FOUND', 'No se encontro la dosis solicitada.');
    }

    const { data: schedules, error: schedulesError } = await admin
      .from('horarios')
      .select('id')
      .in('medicamento_id', medicationIds);
    if (schedulesError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo validar el horario de la dosis.');
    }

    const scheduleIds = (Array.isArray(schedules) ? schedules : [])
      .map((row) => (row as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === 'string');
    if (!scheduleIds.length) {
      throw new ApiError(404, 'DOSE_NOT_FOUND', 'No se encontro la dosis solicitada.');
    }

    const { data: updatedDose, error: updateError } = await admin
      .from('dosis_programadas')
      .update({
        estado: statusValue,
        confirmada_en: statusValue === 'confirmada' ? new Date().toISOString() : null,
        pospuesta_hasta: statusValue === 'pospuesta' ? postponedUntil : null,
      })
      .eq('id', doseId)
      .in('horario_id', scheduleIds)
      .neq('estado', 'confirmada')
      .neq('estado', 'omitida')
      .select('id,horario_id,programada_para,estado,confirmada_en,pospuesta_hasta,actualizado_en')
      .maybeSingle();

    if (updateError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo actualizar la dosis.');
    }
    if (updatedDose) {
      return jsonResponse({ dose: updatedDose, idempotent: false });
    }

    const { data: currentDose, error: currentError } = await admin
      .from('dosis_programadas')
      .select('id,horario_id,programada_para,estado,confirmada_en,pospuesta_hasta,actualizado_en')
      .eq('id', doseId)
      .in('horario_id', scheduleIds)
      .maybeSingle();
    if (currentError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudo comprobar el estado de la dosis.');
    }
    if (!currentDose) {
      throw new ApiError(404, 'DOSE_NOT_FOUND', 'No se encontro la dosis solicitada.');
    }
    if (currentDose.estado === statusValue && (statusValue === 'confirmada' || statusValue === 'omitida')) {
      return jsonResponse({ dose: currentDose, idempotent: true });
    }
    if (currentDose.estado === 'confirmada' || currentDose.estado === 'omitida') {
      throw new ApiError(409, 'DOSE_TERMINAL', 'La dosis ya tiene un estado final.');
    }
    throw new ApiError(409, 'DOSE_NOT_UPDATED', 'La dosis cambio antes de completar la operacion.');
  } catch (error) {
    return errorResponse(error);
  }
});
