import { getMedicationsWithSchedules } from '@/services/medications';
import { supabase } from '@/services/supabase';
import type { DoseWithMedication } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';
import {
  addDays,
  dateForTimeZone,
  getDateKey,
  getDateKeys,
  getDeviceTimeZone,
  getWeekday,
  normalizeDate,
} from '@/utils/dates';

const doseActions = ['confirmada', 'pospuesta', 'omitida'] as const;
type DoseAction = (typeof doseActions)[number];

function scheduleDays(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter((day) => Number.isInteger(day));
  if (typeof value === 'string') {
    return value
      .replace(/[{}]/g, '')
      .split(',')
      .map(Number)
      .filter((day) => Number.isInteger(day));
  }
  return [];
}

export async function generateUpcomingDoses(
  userId: string,
  timeZone = getDeviceTimeZone(),
  days = 14,
) {
  const medications = await getMedicationsWithSchedules(userId, true);
  const dateKeys = getDateKeys(getDateKey(new Date(), timeZone), days);
  const rows = medications.flatMap((medication) =>
    medication.horarios.flatMap((schedule) =>
      dateKeys.flatMap((dateKey) => {
        const weekday = getWeekday(dateKey);
        const start = normalizeDate(medication.fecha_inicio);
        const end = medication.fecha_fin ? normalizeDate(medication.fecha_fin) : null;
        if (
          dateKey < start ||
          (end && dateKey > end) ||
          !scheduleDays(schedule.dias_semana).includes(weekday)
        ) {
          return [];
        }

        return [
          {
            horario_id: schedule.id,
            programada_para: dateForTimeZone(dateKey, schedule.hora, timeZone).toISOString(),
            estado: 'programada' as const,
          },
        ];
      }),
    ),
  );

  if (!rows.length) return 0;

  const { error } = await supabase
    .from('dosis_programadas')
    .upsert(rows, { onConflict: 'horario_id,programada_para', ignoreDuplicates: true });
  if (error) {
    logSupabaseError('dosis_programadas.upsert', error, { userId });
    throw error;
  }
  return rows.length;
}

async function getDoseContext(userId: string, includeInactive: boolean) {
  const medications = await getMedicationsWithSchedules(userId, !includeInactive, includeInactive);
  const schedules = medications.flatMap((medication) => medication.horarios);
  return {
    medications,
    schedules,
    scheduleMap: new Map(schedules.map((schedule) => [schedule.id, schedule])),
    medicationMap: new Map(medications.map((medication) => [medication.id, medication])),
  };
}

export async function getDosesForRange(
  userId: string,
  startDateKey: string,
  endDateKeyExclusive: string,
  timeZone = getDeviceTimeZone(),
  includeInactive = true,
  includeRecords = true,
) {
  const context = await getDoseContext(userId, includeInactive);
  if (!context.schedules.length) return [] as DoseWithMedication[];

  const start = dateForTimeZone(startDateKey, '00:00', timeZone).toISOString();
  const end = dateForTimeZone(endDateKeyExclusive, '00:00', timeZone).toISOString();
  const { data: doses, error } = await supabase
    .from('dosis_programadas')
    .select('*')
    .in('horario_id', context.schedules.map((schedule) => schedule.id))
    .gte('programada_para', start)
    .lt('programada_para', end)
    .order('programada_para');
  if (error) {
    logSupabaseError('dosis_programadas.selectRange', error, { userId });
    throw error;
  }

  const recordIds = includeRecords ? await getRecordIdsForDoses((doses ?? []).map((dose) => dose.id)) : new Set<string>();
  return (doses ?? []).flatMap((dose) => {
    const schedule = context.scheduleMap.get(dose.horario_id);
    const medication = schedule ? context.medicationMap.get(schedule.medicamento_id) : undefined;
    if (!schedule || !medication) return [];
    return [
      {
        ...dose,
        horario: schedule,
        medicamento: medication,
        tieneRegistro: recordIds.has(dose.id),
      },
    ];
  }) as DoseWithMedication[];
}

export function getDosesForDate(
  userId: string,
  dateKey: string,
  timeZone = getDeviceTimeZone(),
  includeInactive = false,
) {
  return getDosesForRange(userId, dateKey, addDays(dateKey, 1), timeZone, includeInactive);
}

async function getRecordIdsForDoses(doseIds: string[]) {
  const ids = new Set<string>();
  if (!doseIds.length) return ids;

  const { data, error } = await supabase.from('registros_tomas').select('*').limit(2000);
  if (error) {
    logSupabaseError('registros_tomas.selectForDoses', error);
    throw error;
  }

  for (const record of data ?? []) {
    const doseId = record.dosis_programada_id ?? record.dosis_id;
    if (typeof doseId === 'string' && doseIds.includes(doseId)) ids.add(doseId);
  }
  return ids;
}

export async function updateDoseStatus(
  userId: string,
  doseId: string,
  status: DoseAction,
  postponedUntil?: string,
) {
  if (!doseActions.includes(status)) {
    throw new Error('La acción solicitada para la dosis no es válida.');
  }

  if (status === 'pospuesta') {
    const postponedTimestamp = postponedUntil ? Date.parse(postponedUntil) : Number.NaN;
    if (!Number.isFinite(postponedTimestamp) || postponedTimestamp <= Date.now()) {
      throw new Error('Selecciona un intervalo futuro para posponer la dosis.');
    }
  }

  const context = await getDoseContext(userId, true);
  const allowedScheduleIds = context.schedules.map((schedule) => schedule.id);
  if (!allowedScheduleIds.length) throw new Error('No se encontró el horario de esta dosis.');

  const { data, error } = await supabase
    .from('dosis_programadas')
    .update({
      estado: status,
      confirmada_en: status === 'confirmada' ? new Date().toISOString() : null,
      pospuesta_hasta: status === 'pospuesta' ? postponedUntil ?? null : null,
    })
    .eq('id', doseId)
    .in('horario_id', allowedScheduleIds)
    .neq('estado', 'confirmada')
    .neq('estado', 'omitida')
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('dosis_programadas.updateStatus', error, { userId, doseId });
    throw error;
  }
  if (data) return data;

  // A conditional update makes repeated taps safe even when a trigger records
  // a confirmation for every state transition.
  const { data: currentDose, error: currentDoseError } = await supabase
    .from('dosis_programadas')
    .select('*')
    .eq('id', doseId)
    .in('horario_id', allowedScheduleIds)
    .maybeSingle();
  if (currentDoseError) {
    logSupabaseError('dosis_programadas.selectAfterUpdate', currentDoseError, { userId, doseId });
    throw currentDoseError;
  }
  if (currentDose?.estado === status && (status === 'confirmada' || status === 'omitida')) return currentDose;
  if (currentDose?.estado === 'confirmada') throw new Error('Esta dosis ya fue confirmada.');
  if (currentDose?.estado === 'omitida') throw new Error('Esta dosis ya fue omitida.');
  throw new Error('No se pudo actualizar la dosis. Revisa la sesión y las políticas de dosis.');
}
