import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { getAuthenticatedUser } from '@/services/auth';
import { cancelDoseNotifications, configureNotificationCategories, CONFIRM_DOSE_ACTION, SNOOZE_DOSE_ACTION, syncMedicationNotifications } from '@/services/notifications';
import { updateDoseStatus } from '@/services/doses';
import { useSession } from '@/contexts/SessionContext';
import { getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

function responseKey(response: Notifications.NotificationResponse) {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

export function NotificationController() {
  const { isLoading, profile, user } = useSession();
  const handledResponses = useRef(new Set<string>());
  const [pendingResponse, setPendingResponse] = useState<Notifications.NotificationResponse | null>(null);

  const handleResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data ?? {};
    const doseId = typeof data.doseId === 'string' ? data.doseId : null;
    const notificationUserId = typeof data.userId === 'string' ? data.userId : null;
    const fallbackUrl = typeof data.url === 'string' ? data.url : null;
    const isReminder = data.kind === 'medication' || data.kind === 'snooze';

    if (!doseId || !isReminder) {
      if (fallbackUrl === '/(tabs)') router.push('/(tabs)');
      return;
    }
    if (!user || notificationUserId !== user.id) return;

    if (response.actionIdentifier === CONFIRM_DOSE_ACTION) {
      const authenticatedUser = await getAuthenticatedUser();
      if (authenticatedUser.id !== user.id) return;
      await updateDoseStatus(authenticatedUser.id, doseId, 'confirmada');
      const warnings: string[] = [];
      try {
        await cancelDoseNotifications(doseId);
      } catch (cancelError) {
        warnings.push(getErrorMessage(cancelError, 'no se pudo cancelar el aviso actual'));
      }
      try {
        await syncMedicationNotifications(user.id, getSafeTimeZone(profile?.zona_horaria));
      } catch (syncError) {
        warnings.push(getErrorMessage(syncError, 'no se pudieron actualizar los demás recordatorios'));
      }
      if (warnings.length) {
        Alert.alert('Dosis confirmada', `La dosis se confirmó, pero ${warnings.join(' y ').toLowerCase()}.`);
      }
    }

    const params = response.actionIdentifier === SNOOZE_DOSE_ACTION
      ? { doseId, notificationAction: 'snooze' }
      : { doseId };
    router.push({ pathname: '/(tabs)', params });
  }, [profile, user]);

  useEffect(() => {
    let mounted = true;
    void configureNotificationCategories();

    void Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (mounted && lastResponse) setPendingResponse(lastResponse);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      setPendingResponse(response);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingResponse || isLoading) return;
    const key = responseKey(pendingResponse);
    if (handledResponses.current.has(key)) {
      setPendingResponse(null);
      return;
    }

    handledResponses.current.add(key);
    void handleResponse(pendingResponse)
      .catch((error) => {
        Alert.alert('No se pudo procesar la notificación', getErrorMessage(error));
      })
      .finally(() => {
        Notifications.clearLastNotificationResponse();
        setPendingResponse(null);
      });
  }, [handleResponse, isLoading, pendingResponse]);

  useEffect(() => {
    if (isLoading || !user) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncMedicationNotifications(user.id, getSafeTimeZone(profile?.zona_horaria)).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [isLoading, profile?.zona_horaria, user]);

  return null;
}
