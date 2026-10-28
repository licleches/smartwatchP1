import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { Notice } from '@/components/common/Notice';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { DoseCard } from '@/components/medications/DoseCard';
import { useSession } from '@/contexts/SessionContext';
import { useDoseRealtimeRefresh } from '@/hooks/useDoseRealtimeRefresh';
import { getDosesForDate, updateDoseStatus } from '@/services/doses';
import { getMedicationsWithSchedules } from '@/services/medications';
import { syncMedicationNotifications } from '@/services/notifications';
import type { DoseWithMedication } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { formatLongDate, formatTime, getDateKey, getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

const postponeOptions = [
  { label: '15 minutos', minutes: 15 },
  { label: '30 minutos', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
] as const;

function getPostponedUntil(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function getDoseEffectiveTime(dose: DoseWithMedication) {
  if (dose.estado === 'pospuesta' && dose.pospuesta_hasta) {
    const postponedTime = Date.parse(dose.pospuesta_hasta);
    if (Number.isFinite(postponedTime)) return postponedTime;
  }
  return Date.parse(dose.programada_para);
}

export default function HomeTabScreen() {
  const { user, profile, displayName } = useSession();
  const { doseId, notificationAction } = useLocalSearchParams<{ doseId?: string; notificationAction?: string }>();
  const focusedDoseId = typeof doseId === 'string' ? doseId : undefined;
  const timeZone = getSafeTimeZone(profile?.zona_horaria);
  const [doses, setDoses] = useState<DoseWithMedication[]>([]);
  const [medicationCount, setMedicationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDose, setBusyDose] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date().getTime());
  const loadVersion = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().getTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = useCallback(async (refreshNotifications = true) => {
    if (!user) return;
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setLoading(true);
    setError(null);
    try {
      const today = getDateKey(new Date(), timeZone);
      if (refreshNotifications) await syncMedicationNotifications(user.id, timeZone);
      const [medications, todayDoses] = await Promise.all([
        getMedicationsWithSchedules(user.id, true),
        getDosesForDate(user.id, today, timeZone),
      ]);
      if (version !== loadVersion.current) return;
      setMedicationCount(medications.length);
      const focusedDose = focusedDoseId ? todayDoses.find((dose) => dose.id === focusedDoseId) : undefined;
      setDoses(focusedDose ? [focusedDose, ...todayDoses.filter((dose) => dose.id !== focusedDose.id)] : todayDoses);
    } catch (loadError) {
      if (version !== loadVersion.current) return;
      setError(getErrorMessage(loadError, 'No se pudo cargar tu resumen.'));
    } finally {
      if (version !== loadVersion.current) return;
      setLoading(false);
    }
  }, [focusedDoseId, timeZone, user]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      return () => {
        loadVersion.current += 1;
      };
    }, [loadDashboard]),
  );

  useDoseRealtimeRefresh(user?.id, () => {
    return loadDashboard(false);
  });

  const changeDose = useCallback(async (dose: DoseWithMedication, status: 'confirmada' | 'omitida' | 'pospuesta', postponeMinutes?: number) => {
    if (!user || busyDose) return;
    if (status === 'pospuesta' && !postponeMinutes) {
      setError('Selecciona cuánto tiempo quieres posponer la dosis.');
      return;
    }
    setBusyDose(dose.id);
    try {
      const postponedUntil = status === 'pospuesta' ? getPostponedUntil(postponeMinutes!) : undefined;
      await updateDoseStatus(user.id, dose.id, status, postponedUntil?.toISOString());

      let notificationWarning: string | null = null;
      try {
        await syncMedicationNotifications(user.id, timeZone);
      } catch (notificationError) {
        notificationWarning = getErrorMessage(notificationError, 'no se pudo actualizar el recordatorio local.');
      }

      await loadDashboard(false);
      if (notificationWarning) setError(`La dosis se actualizó, pero ${notificationWarning.toLowerCase()}`);
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'No se pudo actualizar la dosis.'));
    } finally {
      setBusyDose(null);
    }
  }, [busyDose, loadDashboard, timeZone, user]);

  const selectPostponeInterval = useCallback((dose: DoseWithMedication) => {
    if (busyDose) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: postponeOptions.length,
          message: 'Selecciona cuándo quieres recibir nuevamente el recordatorio.',
          options: [...postponeOptions.map((option) => option.label), 'Cancelar'],
          title: 'Posponer dosis',
        },
        (buttonIndex) => {
          const option = postponeOptions[buttonIndex];
          if (option) void changeDose(dose, 'pospuesta', option.minutes);
        },
      );
      return;
    }

    Alert.alert(
      'Posponer dosis',
      'Selecciona cuándo quieres recibir nuevamente el recordatorio.',
      postponeOptions.slice(0, 3).map((option) => ({
        text: option.label,
        onPress: () => void changeDose(dose, 'pospuesta', option.minutes),
      })),
      { cancelable: true },
    );
  }, [busyDose, changeDose]);

  const promptedSnoozeDose = useRef<string | null>(null);
  useEffect(() => {
    if (notificationAction !== 'snooze' || !focusedDoseId || loading || busyDose) return;
    const dose = doses.find((item) => item.id === focusedDoseId);
    if (!dose || promptedSnoozeDose.current === dose.id) return;
    promptedSnoozeDose.current = dose.id;
    if (dose.estado === 'confirmada' || dose.estado === 'omitida') return;
    selectPostponeInterval(dose);
  }, [busyDose, doses, focusedDoseId, loading, notificationAction, selectPostponeInterval]);

  const today = getDateKey(new Date(), timeZone);
  const confirmed = doses.filter((dose) => dose.estado === 'confirmada').length;
  const pending = doses.filter(
    (dose) => !['confirmada', 'omitida'].includes(dose.estado) && getDoseEffectiveTime(dose) <= now,
  ).length;
  const progress = doses.length ? Math.round((confirmed / doses.length) * 100) : 0;
  const nextDose = doses
    .filter((dose) => !['confirmada', 'omitida'].includes(dose.estado))
    .filter((dose) => getDoseEffectiveTime(dose) >= now)
    .sort((left, right) => getDoseEffectiveTime(left) - getDoseEffectiveTime(right))[0];
  const nextDoseTime = nextDose ? new Date(getDoseEffectiveTime(nextDose)).toISOString() : null;

  return (
    <AppScreen>
      <ScreenHeader
        title={`Hola, ${displayName.split(' ')[0]}`}
        subtitle={formatLongDate(today, timeZone)}
        action={
          <View style={styles.headerIcon}>
            <Ionicons color={colors.primary} name="heart" size={20} />
          </View>
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState /> : medicationCount === 0 ? (
        <EmptyState
          icon="medical-outline"
          message="Agrega tu primer medicamento para empezar a organizar tus tomas y recordatorios."
          title="Tu rutina empieza aquí"
          action={<AppButton onPress={() => router.push('/medication/add')}>Agregar medicamento</AppButton>}
        />
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard icon="medical-outline" label="Activos" value={medicationCount} />
            <StatCard icon="today-outline" label="Para hoy" value={doses.length} />
            <StatCard icon="checkmark-circle-outline" label="Confirmadas" value={confirmed} tone="success" />
            <StatCard icon="time-outline" label="Pendientes ahora" value={pending} tone="alert" />
          </View>

          <Card>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.eyebrow}>PROGRESO DE HOY</Text>
                <Text style={styles.progressTitle}>{confirmed} de {doses.length} dosis confirmadas</Text>
              </View>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressHint}>
              {pending ? `${pending} dosis requieren confirmación.` : doses.length ? 'No hay dosis vencidas sin confirmar.' : 'No hay dosis programadas para hoy.'}
            </Text>
          </Card>

          <Card>
            <View style={styles.nextHeader}>
              <View>
                <Text style={styles.eyebrow}>PRÓXIMA TOMA</Text>
                <Text style={styles.nextTitle}>{nextDose ? nextDose.medicamento.nombre : 'Todo al día'}</Text>
              </View>
              <View style={styles.nextIcon}>
                <Ionicons color={colors.primary} name="alarm-outline" size={24} />
              </View>
            </View>
            {nextDose ? (
              <Text style={styles.nextDetails}>
                {nextDose.medicamento.dosis_indicada} · {nextDose.estado === 'pospuesta' ? 'Pospuesta · ' : ''}{formatTime(nextDoseTime!, timeZone)}
              </Text>
            ) : (
              <Text style={styles.nextDetails}>No hay tomas pendientes por ahora.</Text>
            )}
          </Card>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tomas de hoy</Text>
            <AppButton compact onPress={() => router.push('/medication/add')} variant="secondary">
              + Agregar
            </AppButton>
          </View>
          {doses.length ? (
            <View style={styles.doses}>
              {doses.slice(0, 5).map((dose) => (
                <DoseCard
                  busy={busyDose === dose.id}
                  dose={dose}
                  disabled={Boolean(busyDose)}
                  key={dose.id}
                  onConfirm={() => void changeDose(dose, 'confirmada')}
                  onOmit={() => void changeDose(dose, 'omitida')}
                  onPostpone={() => selectPostponeInterval(dose)}
                  timeZone={timeZone}
                />
              ))}
            </View>
          ) : (
            <Card>
              <Text style={styles.noDoses}>No hay dosis programadas para hoy.</Text>
            </Card>
          )}
        </>
      )}
    </AppScreen>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  tone?: 'primary' | 'success' | 'alert';
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, styles[`${tone}Icon` as 'primaryIcon' | 'successIcon' | 'alertIcon']]}>
        <Ionicons color={tone === 'success' ? colors.success : tone === 'alert' ? colors.alert : colors.primary} name={icon} size={20} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerIcon: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.pill, height: 40, justifyContent: 'center', width: 40 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexBasis: '47%', flexGrow: 1, padding: spacing.md },
  statIcon: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', marginBottom: spacing.sm, width: 36 },
  primaryIcon: { backgroundColor: colors.softPrimary },
  successIcon: { backgroundColor: colors.successSoft },
  alertIcon: { backgroundColor: colors.alertSoft },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  nextHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  nextTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 5 },
  nextIcon: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.pill, height: 48, justifyContent: 'center', width: 48 },
  nextDetails: { color: colors.muted, fontSize: 14, marginTop: spacing.sm },
  progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  progressValue: { color: colors.primary, fontSize: 25, fontWeight: '800' },
  progressTrack: { backgroundColor: colors.border, borderRadius: radius.pill, height: 9, marginTop: spacing.md, overflow: 'hidden' },
  progressBar: { backgroundColor: colors.secondary, borderRadius: radius.pill, height: '100%' },
  progressHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  doses: { gap: spacing.sm },
  noDoses: { color: colors.muted, textAlign: 'center' },
});
