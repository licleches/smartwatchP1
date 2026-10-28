import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { getDosesForRange, generateUpcomingDoses } from '@/services/doses';
import { getNotificationsEnabled } from '@/services/preferences';
import type { DoseWithMedication } from '@/types/database';
import {
  addDays,
  formatTime,
  getDateKey,
  getDeviceTimeZone,
  getWeekday,
  normalizeDate,
  normalizeTime,
} from '@/utils/dates';

export const REMINDER_CHANNEL_ID = 'medtime-reminders';
export const REMINDER_CATEGORY_ID = 'medtimeDose';
export const CONFIRM_DOSE_ACTION = 'confirmDose';
export const SNOOZE_DOSE_ACTION = 'snoozeDose';
export const REMINDER_WINDOW_DAYS = 7;
export const MAX_SCHEDULED_REMINDERS = 60;
const REMINDER_LOOKBACK_DAYS = 1;

type ReminderKind = 'medication' | 'snooze';

const reminderKinds = new Set<ReminderKind>(['medication', 'snooze']);

type DoseReminder = {
  dose: DoseWithMedication;
  kind: ReminderKind;
  triggerAt: Date;
};

type NotificationSynchronization = {
  generation: number;
  promise: Promise<boolean>;
  timeZone: string;
  userId: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let categoriesConfigured = false;
let synchronization: NotificationSynchronization | null = null;
let synchronizationGeneration = 0;

function logNotificationDiagnostic(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[Notifications] ${operation}`, context);
}

export async function configureNotificationCategories() {
  if (Platform.OS === 'web' || categoriesConfigured) return;

  try {
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
      {
        identifier: CONFIRM_DOSE_ACTION,
        buttonTitle: 'Ya lo tomé',
        options: { isAuthenticationRequired: true, opensAppToForeground: true },
      },
      {
        identifier: SNOOZE_DOSE_ACTION,
        buttonTitle: 'Recordar después',
        options: { opensAppToForeground: true },
      },
    ]);
    categoriesConfigured = true;
  } catch (error) {
    logNotificationDiagnostic('category.setupFailed', { message: error instanceof Error ? error.message : 'unknown' });
  }
}

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Recordatorios de medicamentos',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F766E',
    });
  }

  await configureNotificationCategories();

  const current = await Notifications.getPermissionsAsync();
  const currentAllowed = current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (currentAllowed) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return requested.granted || requested.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

async function cancelScheduledReminders(predicate: (data: Record<string, unknown>) => boolean = (data) => reminderKinds.has(data.kind as ReminderKind)) {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => predicate(request.content.data ?? {}))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function cancelMedicationNotifications() {
  synchronizationGeneration += 1;
  await cancelScheduledReminders();
}

export async function cancelAllReminderNotifications() {
  await cancelMedicationNotifications();
}

export async function cancelDoseNotifications(doseId: string) {
  synchronizationGeneration += 1;
  await cancelScheduledReminders((data) => reminderKinds.has(data.kind as ReminderKind) && data.doseId === doseId);
}

function buildDoseUrl(doseId: string, action?: string) {
  return action ? `/(tabs)?doseId=${doseId}&notificationAction=${action}` : `/(tabs)?doseId=${doseId}`;
}

function isCurrentTimezoneDose(dose: DoseWithMedication, timeZone: string) {
  const date = new Date(dose.programada_para);
  if (!Number.isFinite(date.getTime())) return false;

  const dateKey = getDateKey(date, timeZone);
  const start = normalizeDate(dose.medicamento.fecha_inicio);
  const end = dose.medicamento.fecha_fin ? normalizeDate(dose.medicamento.fecha_fin) : null;
  return (
    dateKey >= start &&
    (!end || dateKey <= end) &&
    dose.horario.dias_semana.includes(getWeekday(dateKey)) &&
    formatTime(dose.programada_para, timeZone) === normalizeTime(dose.horario.hora).slice(0, 5)
  );
}

function getDoseReminders(doses: DoseWithMedication[], timeZone: string) {
  const now = Date.now();
  const uniqueDoses = Array.from(new Map(doses.map((dose) => [dose.id, dose])).values());
  const reminders: DoseReminder[] = [];

  for (const dose of uniqueDoses) {
    if (dose.estado === 'confirmada' || dose.estado === 'omitida') continue;

    if (dose.estado === 'pospuesta') {
      const postponedUntil = dose.pospuesta_hasta ? new Date(dose.pospuesta_hasta) : null;
      if (postponedUntil && Number.isFinite(postponedUntil.getTime()) && postponedUntil.getTime() > now) {
        reminders.push({ dose, kind: 'snooze', triggerAt: postponedUntil });
      }
      continue;
    }

    const programadaPara = new Date(dose.programada_para);
    if (
      programadaPara.getTime() > now &&
      isCurrentTimezoneDose(dose, timeZone)
    ) {
      reminders.push({ dose, kind: 'medication', triggerAt: programadaPara });
    }
  }

  return reminders.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
}

async function getNotificationDelivery() {
  if (Platform.OS !== 'android') return undefined;

  try {
    const exactAlarm = await Notifications.getExactAlarmPermissionsAsync();
    if (!exactAlarm.granted) {
      logNotificationDiagnostic('exactAlarm.unavailable', { delivery: 'bestEffort' });
      return 'bestEffort' as const;
    }
    return 'alarmClock' as const;
  } catch (error) {
    logNotificationDiagnostic('exactAlarm.checkFailed', { message: error instanceof Error ? error.message : 'unknown' });
    return 'bestEffort' as const;
  }
}

async function scheduleDoseReminders(
  doses: DoseWithMedication[],
  userId: string,
  timeZone: string,
  generation: number,
) {
  const allowed = await requestNotificationPermissions();
  if (!allowed) {
    if (generation === synchronizationGeneration) await cancelScheduledReminders();
    return false;
  }

  if (generation !== synchronizationGeneration) return false;
  await cancelScheduledReminders();
  if (generation !== synchronizationGeneration) return false;
  const delivery = await getNotificationDelivery();
  const reminders = getDoseReminders(doses, timeZone).slice(0, MAX_SCHEDULED_REMINDERS);

  for (const reminder of reminders) {
    if (generation !== synchronizationGeneration) {
      await cancelScheduledReminders();
      return false;
    }

    const { dose, kind, triggerAt } = reminder;
    const time = formatTime(triggerAt.toISOString(), timeZone);
    const title = kind === 'snooze' ? `Recordatorio: ${dose.medicamento.nombre}` : `Hora de ${dose.medicamento.nombre}`;
    const action = kind === 'snooze' ? SNOOZE_DOSE_ACTION : undefined;
    const body = `Toma ${dose.medicamento.dosis_indicada} a las ${time}${dose.medicamento.instrucciones ? ` · ${dose.medicamento.instrucciones}` : ''}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        categoryIdentifier: REMINDER_CATEGORY_ID,
        data: {
          kind,
          userId,
          doseId: dose.id,
          medicationId: dose.medicamento.id,
          url: buildDoseUrl(dose.id, action),
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerAt,
        channelId: REMINDER_CHANNEL_ID,
        ...(delivery ? { delivery } : {}),
      },
    });
  }

  if (generation !== synchronizationGeneration) {
    await cancelScheduledReminders();
    return false;
  }

  logNotificationDiagnostic('sync.completed', {
    userId,
    scheduled: String(reminders.length),
    windowDays: String(REMINDER_WINDOW_DAYS),
    delivery: delivery ?? 'system',
  });
  return true;
}

async function syncMedicationNotificationsInternal(userId: string, timeZone = getDeviceTimeZone()) {
  const generation = synchronizationGeneration;
  await generateUpcomingDoses(userId, timeZone, REMINDER_WINDOW_DAYS);
  if (generation !== synchronizationGeneration) return false;

  if (!(await getNotificationsEnabled(userId))) {
    if (generation === synchronizationGeneration) await cancelScheduledReminders();
    return false;
  }

  const startDateKey = getDateKey(new Date(), timeZone);
  const doses = await getDosesForRange(
    userId,
    // Keep a dose from just before midnight if it was postponed into today.
    addDays(startDateKey, -REMINDER_LOOKBACK_DAYS),
    addDays(startDateKey, REMINDER_WINDOW_DAYS),
    timeZone,
    false,
    false,
  );
  if (generation !== synchronizationGeneration) return false;
  return scheduleDoseReminders(doses, userId, timeZone, generation);
}

export function syncMedicationNotifications(userId: string, timeZone = getDeviceTimeZone()) {
  const current = synchronization;
  if (
    current &&
    current.userId === userId &&
    current.timeZone === timeZone &&
    current.generation === synchronizationGeneration
  ) {
    return current.promise;
  }

  const previous = current?.promise;
  let promise: Promise<boolean>;
  const nextSync = previous
    ? previous.catch(() => false).then(() => syncMedicationNotificationsInternal(userId, timeZone))
    : syncMedicationNotificationsInternal(userId, timeZone);
  promise = nextSync.finally(() => {
    if (synchronization?.promise === promise) synchronization = null;
  });
  synchronization = { generation: synchronizationGeneration, promise, timeZone, userId };
  return promise;
}
