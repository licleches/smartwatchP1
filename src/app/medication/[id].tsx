import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { MedicationForm } from '@/components/medications/MedicationForm';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useSession } from '@/contexts/SessionContext';
import { deactivateMedication, getMedicationWithSchedules, reactivateMedication, updateMedication } from '@/services/medications';
import { syncMedicationNotifications } from '@/services/notifications';
import type { MedicationWithSchedules } from '@/types/database';
import { colors, spacing } from '@/theme/colors';
import { getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useSession();
  const [medication, setMedication] = useState<MedicationWithSchedules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const loadMedication = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      setMedication(await getMedicationWithSchedules(user.id, id));
    } catch (error) {
      Alert.alert('No se pudo cargar', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      void loadMedication();
    }, [loadMedication]),
  );

  async function handleSubmit(input: Parameters<typeof updateMedication>[1]) {
    if (savingRef.current) return;
    if (!user || !id) {
      Alert.alert('Sesión requerida', 'Inicia sesión nuevamente para actualizar el medicamento.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const updatedMedication = await updateMedication(id, input, medication?.activo ?? true);
      const timeZone = getSafeTimeZone(profile?.zona_horaria);
      let notificationWarning: string | null = null;
      try {
        await syncMedicationNotifications(updatedMedication.usuario_id, timeZone);
      } catch (notificationError) {
        notificationWarning = getErrorMessage(notificationError, 'No se pudieron sincronizar los recordatorios locales.');
      }
      Alert.alert(
        notificationWarning ? 'Guardado con advertencia' : 'Cambios guardados',
        notificationWarning
          ? `El medicamento y sus horarios se guardaron, pero ${notificationWarning.toLowerCase()}`
          : 'Las próximas dosis fueron actualizadas.',
        [{ text: 'Continuar', onPress: () => router.replace('/(tabs)/medications') }],
      );
    } catch (error) {
      Alert.alert('No se pudo actualizar', getErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleDeactivate() {
    if (!user || !id || savingRef.current) return;
    Alert.alert('Desactivar medicamento', 'No se borrará el historial y dejarás de recibir sus próximos recordatorios.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
           try {
             await deactivateMedication(id);
             let notificationWarning: string | null = null;
             try {
               await syncMedicationNotifications(user.id, getSafeTimeZone(profile?.zona_horaria));
             } catch (notificationError) {
               notificationWarning = getErrorMessage(notificationError, 'no se pudieron cancelar los recordatorios locales.');
             }
             Alert.alert(
               notificationWarning ? 'Medicamento desactivado con advertencia' : 'Medicamento desactivado',
               notificationWarning
                 ? `El tratamiento se desactivó y su historial se conservó, pero ${notificationWarning.toLowerCase()}`
                 : 'Se conservará el historial y no se mostrarán sus próximas dosis.',
               [{ text: 'Continuar', onPress: () => router.replace('/(tabs)/medications') }],
             );
           } catch (error) {
             Alert.alert('No se pudo desactivar', getErrorMessage(error));
           } finally {
            savingRef.current = false;
            setSaving(false);
          }
        },
      },
    ]);
  }

  function handleReactivate() {
    if (!user || !id || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    void (async () => {
      try {
        const reactivatedMedication = await reactivateMedication(id);
        let notificationWarning: string | null = null;
        try {
          await syncMedicationNotifications(reactivatedMedication.usuario_id, getSafeTimeZone(profile?.zona_horaria));
        } catch (notificationError) {
          notificationWarning = getErrorMessage(notificationError, 'no se pudieron programar los recordatorios locales.');
        }
        Alert.alert(
          notificationWarning ? 'Medicamento reactivado con advertencia' : 'Medicamento reactivado',
          notificationWarning
            ? `El tratamiento volvió a estar activo, pero ${notificationWarning.toLowerCase()}`
            : 'Sus próximas dosis volverán a aparecer en el Dashboard.',
          [{ text: 'Continuar', onPress: () => router.replace('/(tabs)/medications') }],
        );
      } catch (error) {
        Alert.alert('No se pudo reactivar', getErrorMessage(error));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
  }

  if (loading) return <AppScreen scroll={false}><LoadingState /></AppScreen>;
  if (!medication) {
    return (
      <AppScreen>
        <EmptyState message="No encontramos este medicamento." title="Medicamento no disponible" action={<AppButton onPress={() => router.back()}>Volver</AppButton>} />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader title="Editar medicamento" subtitle={medication.nombre} />
      <View style={styles.status}>
        <Text style={styles.statusLabel}>Estado actual</Text>
        <Text style={[styles.statusValue, !medication.activo && styles.inactive]}>
          {medication.activo ? 'Activo' : 'Inactivo'}
        </Text>
      </View>
      <MedicationForm initial={medication} onCancel={() => router.back()} onSubmit={handleSubmit} submitLabel="Guardar cambios" loading={saving} />
      {medication.activo ? (
        <View style={styles.deactivate}>
          <AppButton disabled={saving} onPress={handleDeactivate} variant="danger">
            Desactivar medicamento
          </AppButton>
        </View>
      ) : (
        <View style={styles.deactivate}>
          <AppButton disabled={saving} loading={saving} onPress={handleReactivate}>
            Reactivar medicamento
          </AppButton>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  statusLabel: { color: colors.muted, fontSize: 14 },
  statusValue: { color: colors.success, fontSize: 14, fontWeight: '800' },
  inactive: { color: colors.muted },
  deactivate: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.lg },
});
