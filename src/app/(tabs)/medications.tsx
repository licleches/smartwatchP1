import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useSession } from '@/contexts/SessionContext';
import { getMedicationsWithSchedules } from '@/services/medications';
import type { MedicationWithSchedules } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatTime, getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

export default function MedicationsScreen() {
  const { user, profile } = useSession();
  const timeZone = getSafeTimeZone(profile?.zona_horaria);
  const [medications, setMedications] = useState<MedicationWithSchedules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setMedications(await getMedicationsWithSchedules(user.id));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'No se pudieron cargar los medicamentos.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AppScreen>
      <ScreenHeader
        title="Medicamentos"
        subtitle="Tu tratamiento, siempre organizado."
        action={
          <AppButton compact onPress={() => router.push('/medication/add')}>
            + Agregar
          </AppButton>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState /> : medications.length === 0 ? (
        <EmptyState
          message="Registra tu primer medicamento y configura los días y horarios de tus tomas."
          title="Aún no tienes medicamentos"
          action={<AppButton onPress={() => router.push('/medication/add')}>Agregar medicamento</AppButton>}
        />
      ) : (
        <View style={styles.list}>
          {medications.map((medication) => (
            <MedicationCard key={medication.id} medication={medication} onPress={() => router.push(`/medication/${medication.id}`)} timeZone={timeZone} />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function MedicationCard({ medication, onPress, timeZone }: { medication: MedicationWithSchedules; onPress: () => void; timeZone: string }) {
  return (
    <Pressable accessibilityLabel={`Editar ${medication.nombre}`} accessibilityRole="button" onPress={onPress}>
      <Card>
        <View style={styles.cardTop}>
          <View style={styles.icon}>
            <Ionicons color={colors.primary} name="medical-outline" size={23} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.name}>{medication.nombre}</Text>
            <Text style={styles.details}>{medication.dosis_indicada} · {medication.presentacion}</Text>
          </View>
          <Ionicons color={colors.muted} name="chevron-forward" size={20} />
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons color={colors.primary} name="time-outline" size={16} />
            <Text style={styles.metaText}>
              {medication.horarios.length ? medication.horarios.map((schedule) => formatTime(schedule.hora, timeZone)).join(' · ') : 'Sin horarios activos'}
            </Text>
          </View>
          <Text style={[styles.active, !medication.activo && styles.inactive]}>{medication.activo ? 'Activo' : 'Inactivo'}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  cardTop: { alignItems: 'center', flexDirection: 'row' },
  icon: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: 13, height: 46, justifyContent: 'center', marginRight: spacing.sm, width: 46 },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  details: { color: colors.muted, fontSize: 13, marginTop: 3 },
  metaRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm },
  metaItem: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 5 },
  metaText: { color: colors.muted, fontSize: 13 },
  active: { backgroundColor: colors.successSoft, borderRadius: radius.pill, color: colors.success, fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  inactive: { backgroundColor: colors.border, color: colors.muted },
});
