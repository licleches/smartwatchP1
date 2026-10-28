import { getAuthenticatedUser, getUserProfile, UserProfileNotFoundError } from '@/services/auth';
import { supabase } from '@/services/supabase';
import type { MedicationInsert, MedicationWithSchedules, ScheduleInsert } from '@/types/database';
import { normalizeTime } from '@/utils/dates';
import { getErrorMessage, logSupabaseError } from '@/utils/errors';

export interface MedicationInput {
  nombre: string;
  presentacion: string;
  dosis_indicada: string;
  instrucciones: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  horarios: { hora: string; dias_semana: number[] }[];
}

async function getRequestedUserId(expectedUserId: string) {
  const user = await getAuthenticatedUser();
  if (user.id !== expectedUserId) {
    throw new Error('El usuario solicitado no coincide con la sesión autenticada.');
  }
  return user.id;
}

export async function getMedicationsWithSchedules(
  userId: string,
  activeOnly = false,
  includeInactiveSchedules = false,
) {
  const authenticatedUserId = await getRequestedUserId(userId);
  let medicationQuery = supabase
    .from('medicamentos')
    .select('*')
    .eq('usuario_id', authenticatedUserId);

  if (activeOnly) {
    medicationQuery = medicationQuery.eq('activo', true);
  }

  const { data: medications, error: medicationError } = await medicationQuery.order('nombre');
  if (medicationError) {
    logSupabaseError('medicamentos.selectList', medicationError, { userId: authenticatedUserId });
    throw medicationError;
  }
  if (!medications?.length) return [] as MedicationWithSchedules[];

  const medicationIds = medications.map((medication) => medication.id);
  let scheduleQuery = supabase.from('horarios').select('*').in('medicamento_id', medicationIds);
  if (!includeInactiveSchedules) {
    scheduleQuery = scheduleQuery.eq('activo', true);
  }

  const { data: schedules, error: scheduleError } = await scheduleQuery.order('hora');
  if (scheduleError) {
    logSupabaseError('horarios.selectList', scheduleError, { userId: authenticatedUserId });
    throw scheduleError;
  }

  const scheduleMap = new Map<string, MedicationWithSchedules['horarios']>();
  for (const schedule of schedules ?? []) {
    const current = scheduleMap.get(schedule.medicamento_id) ?? [];
    current.push(schedule);
    scheduleMap.set(schedule.medicamento_id, current);
  }

  return medications.map((medication) => ({
    ...medication,
    horarios: scheduleMap.get(medication.id) ?? [],
  })) as MedicationWithSchedules[];
}

export async function getMedicationWithSchedules(userId: string, medicationId: string) {
  const authenticatedUserId = await getRequestedUserId(userId);
  const { data: medication, error: medicationError } = await supabase
    .from('medicamentos')
    .select('*')
    .eq('usuario_id', authenticatedUserId)
    .eq('id', medicationId)
    .maybeSingle();
  if (medicationError) {
    logSupabaseError('medicamentos.selectDetail', medicationError, { userId: authenticatedUserId, medicationId });
    throw medicationError;
  }
  if (!medication) return null;

  const { data: schedules, error: scheduleError } = await supabase
    .from('horarios')
    .select('*')
    .eq('medicamento_id', medicationId)
    .order('hora');
  if (scheduleError) {
    logSupabaseError('horarios.selectDetail', scheduleError, { userId: authenticatedUserId, medicationId });
    throw scheduleError;
  }

  const currentSchedules = (schedules ?? []).filter((schedule) => schedule.activo);
  const visibleSchedules = currentSchedules.length ? currentSchedules : schedules ?? [];
  return { ...medication, horarios: visibleSchedules } as MedicationWithSchedules;
}

function medicationValues(userId: string, input: MedicationInput): MedicationInsert {
  return {
    usuario_id: userId,
    nombre: input.nombre.trim(),
    presentacion: input.presentacion.trim(),
    dosis_indicada: input.dosis_indicada.trim(),
    instrucciones: input.instrucciones?.trim() || null,
    fecha_inicio: input.fecha_inicio,
    fecha_fin: input.fecha_fin || null,
    activo: true,
  };
}

function scheduleValues(medicationId: string, input: MedicationInput): ScheduleInsert[] {
  const uniqueSchedules = Array.from(new Map(input.horarios.map((schedule) => [normalizeTime(schedule.hora).slice(0, 5), schedule])).values());
  return uniqueSchedules.map((schedule) => ({
    medicamento_id: medicationId,
    hora: normalizeTime(schedule.hora),
    dias_semana: [...schedule.dias_semana],
    activo: true,
  }));
}

async function getMedicationOwner() {
  const user = await getAuthenticatedUser();
  const profile = await getUserProfile(user);
  if (!profile) {
    throw new UserProfileNotFoundError(user.id);
  }
  return { userId: user.id };
}

export async function createMedication(input: MedicationInput) {
  if (!input.horarios.length) throw new Error('Agrega al menos un horario.');
  const { userId } = await getMedicationOwner();
  const { data: medication, error: medicationError } = await supabase
    .from('medicamentos')
    .insert(medicationValues(userId, input))
    .select()
    .single();
  if (medicationError) {
    logSupabaseError('medicamentos.insert', medicationError, { userId });
    throw medicationError;
  }
  if (!medication) throw new Error('Supabase no devolvió el medicamento creado.');

  const { error: scheduleError } = await supabase
    .from('horarios')
    .insert(scheduleValues(medication.id, input));
  if (scheduleError) {
    logSupabaseError('horarios.insert', scheduleError, { userId, medicationId: medication.id });
    const { error: rollbackError } = await supabase
      .from('medicamentos')
      .update({ activo: false })
      .eq('id', medication.id)
      .eq('usuario_id', userId);
    if (rollbackError) {
      logSupabaseError('medicamentos.rollbackAfterScheduleInsert', rollbackError, { userId, medicationId: medication.id });
    }
    throw new Error(`El medicamento se creó, pero no se pudieron guardar sus horarios. ${getErrorMessage(scheduleError)}`);
  }

  return medication as unknown as MedicationWithSchedules;
}

export async function updateMedication(
  medicationId: string,
  input: MedicationInput,
  active = true,
) {
  if (!input.horarios.length) throw new Error('Agrega al menos un horario.');
  const { userId } = await getMedicationOwner();

  const { data: currentMedication, error: currentError } = await supabase
    .from('medicamentos')
    .select('*')
    .eq('id', medicationId)
    .eq('usuario_id', userId)
    .maybeSingle();
  if (currentError) {
    logSupabaseError('medicamentos.selectForUpdate', currentError, { userId, medicationId });
    throw currentError;
  }
  if (!currentMedication) throw new Error('No se encontró el medicamento.');

  const { data: currentSchedules, error: currentSchedulesError } = await supabase
    .from('horarios')
    .select('id')
    .eq('medicamento_id', medicationId)
    .eq('activo', true);
  if (currentSchedulesError) {
    logSupabaseError('horarios.selectForUpdate', currentSchedulesError, { userId, medicationId });
    throw currentSchedulesError;
  }

  const { data: medication, error: medicationError } = await supabase
    .from('medicamentos')
    .update({ ...medicationValues(userId, input), activo: active })
    .eq('id', medicationId)
    .eq('usuario_id', userId)
    .select()
    .maybeSingle();
  if (medicationError) {
    logSupabaseError('medicamentos.update', medicationError, { userId, medicationId });
    throw medicationError;
  }
  if (!medication) throw new Error('No se pudo actualizar el medicamento. Revisa la sesión y las políticas de medicamentos.');

  let insertedScheduleIds: string[] = [];
  try {
    const { data: insertedSchedules, error: scheduleError } = await supabase
      .from('horarios')
      .insert(scheduleValues(medicationId, input).map((schedule) => ({ ...schedule, activo: active })))
      .select('id');
    if (scheduleError) {
      logSupabaseError('horarios.insertForMedicationUpdate', scheduleError, { userId, medicationId });
      throw scheduleError;
    }
    insertedScheduleIds = (insertedSchedules ?? []).map((schedule) => schedule.id);

    const oldScheduleIds = (currentSchedules ?? []).map((schedule) => schedule.id);
    if (oldScheduleIds.length) {
      const { error: deactivateError } = await supabase
        .from('horarios')
        .update({ activo: false })
        .in('id', oldScheduleIds);
      if (deactivateError) {
        logSupabaseError('horarios.deactivatePrevious', deactivateError, { userId, medicationId });
        throw deactivateError;
      }
    }
  } catch (error) {
    if (insertedScheduleIds.length) {
      await supabase.from('horarios').update({ activo: false }).in('id', insertedScheduleIds);
    }
    await supabase
      .from('medicamentos')
      .update({
        nombre: currentMedication.nombre,
        presentacion: currentMedication.presentacion,
        dosis_indicada: currentMedication.dosis_indicada,
        instrucciones: currentMedication.instrucciones,
        fecha_inicio: currentMedication.fecha_inicio,
        fecha_fin: currentMedication.fecha_fin,
        activo: currentMedication.activo,
      })
      .eq('id', medicationId)
      .eq('usuario_id', userId);
    throw error;
  }

  return medication as unknown as MedicationWithSchedules;
}

export async function deactivateMedication(medicationId: string) {
  const { userId } = await getMedicationOwner();
  const { error: medicationError } = await supabase
    .from('medicamentos')
    .update({ activo: false })
    .eq('id', medicationId)
    .eq('usuario_id', userId);
  if (medicationError) {
    logSupabaseError('medicamentos.deactivate', medicationError, { userId, medicationId });
    throw medicationError;
  }

  const { error: scheduleError } = await supabase
    .from('horarios')
    .update({ activo: false })
    .eq('medicamento_id', medicationId)
    .eq('activo', true);
  if (scheduleError) {
    logSupabaseError('horarios.deactivate', scheduleError, { userId, medicationId });
    throw scheduleError;
  }
}

export async function reactivateMedication(medicationId: string) {
  const { userId } = await getMedicationOwner();
  const { data: medication, error: medicationError } = await supabase
    .from('medicamentos')
    .update({ activo: true })
    .eq('id', medicationId)
    .eq('usuario_id', userId)
    .select()
    .maybeSingle();
  if (medicationError) {
    logSupabaseError('medicamentos.reactivate', medicationError, { userId, medicationId });
    throw medicationError;
  }
  if (!medication) throw new Error('No se encontró el medicamento para reactivarlo.');

  const { error: scheduleError } = await supabase
    .from('horarios')
    .update({ activo: true })
    .eq('medicamento_id', medicationId);
  if (scheduleError) {
    logSupabaseError('horarios.reactivate', scheduleError, { userId, medicationId });
    await supabase
      .from('medicamentos')
      .update({ activo: false })
      .eq('id', medicationId)
      .eq('usuario_id', userId);
    throw scheduleError;
  }

  return medication as unknown as MedicationWithSchedules;
}
