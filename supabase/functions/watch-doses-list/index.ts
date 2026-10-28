import { ApiError, assertPost, errorResponse, jsonResponse, optionsResponse, optionalString, readJson } from '../_shared/http.ts';
import { getAdminClient, requireDevice } from '../_shared/server.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 31 * DAY_MS;

function dateInput(value: string | undefined, field: string, fallback: Date) {
  if (value === undefined) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ApiError(400, 'INVALID_INPUT', `La fecha ${field} no es valida.`);
  }
  return parsed;
}

Deno.serve(async (request) => {
  try {
    if (!assertPost(request)) return optionsResponse();

    const device = await requireDevice(request);
    const body = await readJson(request);
    const from = dateInput(optionalString(body, 'from', 80), 'from', new Date(Date.now() - DAY_MS));
    const to = dateInput(optionalString(body, 'to', 80), 'to', new Date(from.getTime() + 7 * DAY_MS));

    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new ApiError(400, 'INVALID_RANGE', 'El rango de dosis debe ser positivo y no mayor a 31 dias.');
    }

    const rawLimit = body.limit;
    const limit = rawLimit === undefined ? 100 : rawLimit;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ApiError(400, 'INVALID_LIMIT', 'El limite debe ser un numero entero entre 1 y 100.');
    }

    const admin = getAdminClient();
    const [{ data: profile, error: profileError }, { data: medications, error: medicationsError }] = await Promise.all([
      admin.from('usuarios').select('zona_horaria').eq('id', device.userId).maybeSingle(),
      admin
        .from('medicamentos')
        .select('id,nombre,presentacion,dosis_indicada,instrucciones')
        .eq('usuario_id', device.userId)
        .eq('activo', true),
    ]);

    if (profileError || medicationsError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudieron consultar las dosis.');
    }

    const medicationRows = Array.isArray(medications) ? medications : [];
    const medicationIds = medicationRows
      .map((row) => (row as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === 'string');

    if (!medicationIds.length) {
      return jsonResponse({
        time_zone: (profile as Record<string, unknown> | null)?.zona_horaria ?? null,
        from: from.toISOString(),
        to: to.toISOString(),
        doses: [],
      });
    }

    const { data: schedules, error: schedulesError } = await admin
      .from('horarios')
      .select('id,medicamento_id,hora,dias_semana')
      .in('medicamento_id', medicationIds)
      .eq('activo', true);
    if (schedulesError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudieron consultar los horarios.');
    }

    const scheduleRows = Array.isArray(schedules) ? schedules : [];
    const scheduleIds = scheduleRows
      .map((row) => (row as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === 'string');
    if (!scheduleIds.length) {
      return jsonResponse({
        time_zone: (profile as Record<string, unknown> | null)?.zona_horaria ?? null,
        from: from.toISOString(),
        to: to.toISOString(),
        doses: [],
      });
    }

    const { data: doses, error: dosesError } = await admin
      .from('dosis_programadas')
      .select('id,horario_id,programada_para,estado,confirmada_en,pospuesta_hasta,actualizado_en')
      .in('horario_id', scheduleIds)
      .gte('programada_para', from.toISOString())
      .lt('programada_para', to.toISOString())
      .order('programada_para', { ascending: true })
      .limit(limit);
    if (dosesError) {
      throw new ApiError(503, 'BACKEND_NOT_READY', 'No se pudieron consultar las dosis.');
    }

    const medicationMap = new Map(
      medicationRows.map((row) => {
        const medication = row as Record<string, unknown>;
        return [String(medication.id), medication];
      }),
    );
    const scheduleMap = new Map(
      scheduleRows.map((row) => {
        const schedule = row as Record<string, unknown>;
        return [String(schedule.id), schedule];
      }),
    );

    const responseDoses = (Array.isArray(doses) ? doses : []).flatMap((row) => {
      const dose = row as Record<string, unknown>;
      const schedule = scheduleMap.get(String(dose.horario_id));
      const medication = schedule ? medicationMap.get(String(schedule.medicamento_id)) : undefined;
      if (!schedule || !medication) return [];

      return [{
        dose_id: dose.id,
        scheduled_for: dose.programada_para,
        status: dose.estado,
        confirmed_at: dose.confirmada_en ?? null,
        postponed_until: dose.pospuesta_hasta ?? null,
        updated_at: dose.actualizado_en,
        medication: {
          id: medication.id,
          name: medication.nombre,
          presentation: medication.presentacion,
          prescribed_dose: medication.dosis_indicada,
          instructions: medication.instrucciones ?? null,
        },
        schedule: {
          id: schedule.id,
          time: schedule.hora,
          weekdays: schedule.dias_semana,
        },
      }];
    });

    return jsonResponse({
      time_zone: (profile as Record<string, unknown> | null)?.zona_horaria ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      doses: responseDoses,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
