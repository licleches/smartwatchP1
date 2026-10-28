import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { MedicationForm } from '@/components/medications/MedicationForm';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useSession } from '@/contexts/SessionContext';
import { createMedication } from '@/services/medications';
import { syncMedicationNotifications } from '@/services/notifications';
import { getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

export default function AddMedicationScreen() {
  const { user, profile } = useSession();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function handleSubmit(input: Parameters<typeof createMedication>[0]) {
    if (savingRef.current) return;
    if (!user) {
      Alert.alert('Sesión requerida', 'Inicia sesión nuevamente para guardar el medicamento.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const medication = await createMedication(input);
      const timeZone = getSafeTimeZone(profile?.zona_horaria);
      let notificationWarning: string | null = null;
      try {
        await syncMedicationNotifications(medication.usuario_id, timeZone);
      } catch (notificationError) {
        notificationWarning = getErrorMessage(notificationError, 'No se pudieron sincronizar los recordatorios locales.');
      }
      Alert.alert(
        notificationWarning ? 'Guardado con advertencia' : 'Medicamento guardado',
        notificationWarning
          ? `El medicamento y sus horarios se guardaron, pero ${notificationWarning.toLowerCase()}`
          : 'El horario fue agregado a tus próximas dosis.',
        [{ text: 'Continuar', onPress: () => router.replace('/(tabs)/medications') }],
      );
    } catch (error) {
      Alert.alert('No se pudo guardar', getErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Nuevo medicamento" subtitle="Configura la dosis y sus recordatorios." />
      <MedicationForm onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar medicamento" loading={saving} />
    </AppScreen>
  );
}
