import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/common/AppScreen';
import { Card } from '@/components/common/Card';
import { DoseCard } from '@/components/medications/DoseCard';
import { LoadingState } from '@/components/common/LoadingState';
import { DatePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { SelectField } from '@/components/common/SelectField';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useSession } from '@/contexts/SessionContext';
import { useDoseRealtimeRefresh } from '@/hooks/useDoseRealtimeRefresh';
import { getDosesForRange, updateDoseStatus } from '@/services/doses';
import { getMedicationsWithSchedules } from '@/services/medications';
import { syncMedicationNotifications } from '@/services/notifications';
import type { DoseWithMedication, MedicationWithSchedules } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import { addDays, dateFromDateKey, dateKeyFromLocalDate, formatShortDate, getDateKey, getDateKeys, getSafeTimeZone } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';

const statusOptions = [
  { label: 'Todos los estados', value: 'all' },
  { label: 'Programadas', value: 'programada' },
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Pospuestas', value: 'pospuesta' },
  { label: 'Confirmadas', value: 'confirmada' },
  { label: 'Omitidas', value: 'omitida' },
  { label: 'Sin confirmar', value: 'sin_confirmar' },
] as const;

function effectiveDoseTime(dose: DoseWithMedication) {
  if (dose.estado === 'pospuesta' && dose.pospuesta_hasta) {
    const postponed = Date.parse(dose.pospuesta_hasta);
    if (Number.isFinite(postponed)) return postponed;
  }
  return Date.parse(dose.programada_para);
}

export default function HistoryScreen() {
  const { user, profile } = useSession();
  const timeZone = getSafeTimeZone(profile?.zona_horaria);
  const today = getDateKey(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMedication, setSelectedMedication] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [medications, setMedications] = useState<MedicationWithSchedules[]>([]);
  const [doses, setDoses] = useState<DoseWithMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDose, setBusyDose] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date().getTime());
  const loadVersion = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().getTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const weekStart = addDays(selectedDate, -6);
  const dates = useMemo(() => getDateKeys(weekStart, 7), [weekStart]);

  const load = useCallback(async (refreshNotifications = true) => {
    if (!user) return;
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setLoading(true);
    setError(null);
    try {
      if (refreshNotifications) await syncMedicationNotifications(user.id, timeZone);
      const [medicationRows, doseRows] = await Promise.all([
        getMedicationsWithSchedules(user.id),
        getDosesForRange(user.id, weekStart, addDays(selectedDate, 1), timeZone, true),
      ]);
      if (version !== loadVersion.current) return;
      setMedications(medicationRows);
      setDoses(doseRows);
    } catch (loadError) {
      if (version !== loadVersion.current) return;
      setError(getErrorMessage(loadError, 'No se pudo cargar el historial.'));
    } finally {
      if (version !== loadVersion.current) return;
      setLoading(false);
    }
  }, [selectedDate, timeZone, user, weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadVersion.current += 1;
      };
    }, [load]),
  );

  useDoseRealtimeRefresh(user?.id, () => {
    return load(false);
  });

  async function changeDose(dose: DoseWithMedication, status: 'confirmada' | 'omitida') {
    if (!user || busyDose) return;
    setBusyDose(dose.id);
    try {
      await updateDoseStatus(user.id, dose.id, status);

      let notificationWarning: string | null = null;
      try {
        await syncMedicationNotifications(user.id, timeZone);
      } catch (notificationError) {
        notificationWarning = getErrorMessage(notificationError, 'no se pudo actualizar el recordatorio local.');
      }

      await load(false);
      if (notificationWarning) setError(`La dosis se actualizó, pero ${notificationWarning.toLowerCase()}`);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusyDose(null);
    }
  }

  const visibleDoses = doses.filter(
    (dose) =>
      getDateKey(new Date(dose.programada_para), timeZone) === selectedDate &&
      (selectedMedication === 'all' || dose.medicamento.id === selectedMedication) &&
      (selectedStatus === 'all' || dose.estado === selectedStatus),
  );
  const metricDoses = selectedMedication === 'all'
    ? doses
    : doses.filter((dose) => dose.medicamento.id === selectedMedication);
  const confirmed = metricDoses.filter((dose) => dose.estado === 'confirmada').length;
  const scheduled = metricDoses.length;
  const adherence = scheduled ? Math.round((confirmed / scheduled) * 100) : 0;
  const dueUnconfirmed = metricDoses.filter(
    (dose) => !['confirmada', 'omitida'].includes(dose.estado) && effectiveDoseTime(dose) <= now,
  ).length;
  const chartMax = Math.max(1, ...dates.map((date) => metricDoses.filter((dose) => getDateKey(new Date(dose.programada_para), timeZone) === date).length));
  const chartData = dates.map((date) => {
    const dayDoses = metricDoses.filter((dose) => getDateKey(new Date(dose.programada_para), timeZone) === date);
    return {
      date,
      scheduled: dayDoses.length,
      confirmed: dayDoses.filter((dose) => dose.estado === 'confirmada').length,
    };
  });

  return (
    <AppScreen>
      <ScreenHeader title="Historial" subtitle="Consulta tus tomas y tu progreso semanal." />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState /> : (
        <>
          <Card>
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.eyebrow}>RESUMEN DE 7 DÍAS</Text>
                <Text style={styles.summaryValue}>{confirmed} de {scheduled} confirmadas</Text>
              </View>
              <Text style={styles.percent}>{adherence}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progress, { width: `${adherence}%` }]} />
            </View>
            <Text style={styles.summaryHint}>{dueUnconfirmed ? `${dueUnconfirmed} dosis pendientes de confirmar.` : 'No hay dosis vencidas sin confirmar.'}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitleSmall}>Comparativo semanal</Text>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, styles.scheduledDot]} /><Text style={styles.legendText}>Programadas</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, styles.confirmedDot]} /><Text style={styles.legendText}>Confirmadas</Text></View>
            </View>
            <View style={styles.chart}>
              {chartData.map((day) => (
                <View key={day.date} style={styles.chartColumn}>
                  <View style={styles.barArea}>
                    <View style={[styles.bar, styles.scheduledBar, { height: `${(day.scheduled / chartMax) * 100}%` }]} />
                    <View style={[styles.bar, styles.confirmedBar, { height: `${(day.confirmed / chartMax) * 100}%` }]} />
                  </View>
                  <Text numberOfLines={1} style={styles.chartDate}>{formatShortDate(day.date, timeZone)}</Text>
                  <Text style={styles.chartValue}>{day.confirmed}/{day.scheduled}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Selecciona una fecha</Text>
          <DatePickerField
            label="Fecha del historial"
            maximumDate={dateFromDateKey(today)}
            onChange={(value) => setSelectedDate(dateKeyFromLocalDate(value))}
            value={dateFromDateKey(selectedDate)}
          />
          <View style={styles.dateRow}>
            {dates.map((date) => {
              const selected = selectedDate === date;
              return (
                <Pressable accessibilityLabel={`Seleccionar ${formatShortDate(date, timeZone)}`} accessibilityRole="button" key={date} onPress={() => setSelectedDate(date)} style={[styles.dateChip, selected && styles.selectedDate]}>
                  <Text style={[styles.dateText, selected && styles.selectedDateText]}>{formatShortDate(date, timeZone)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.filterHeader}>
            <Text style={styles.sectionTitle}>Filtrar medicamento</Text>
            <Ionicons color={colors.muted} name="filter-outline" size={18} />
          </View>
          <View style={styles.filters}>
            <FilterChip label="Todos" selected={selectedMedication === 'all'} onPress={() => setSelectedMedication('all')} />
            {medications.map((medication) => (
              <FilterChip key={medication.id} label={medication.nombre} selected={selectedMedication === medication.id} onPress={() => setSelectedMedication(medication.id)} />
            ))}
          </View>

          <SelectField label="Filtrar por estado" onChange={setSelectedStatus} options={statusOptions} value={selectedStatus} />

          <Text style={styles.sectionTitle}>Dosis del día</Text>
          {visibleDoses.length ? (
            <View style={styles.doses}>
              {visibleDoses.map((dose) => (
                <DoseCard
                  busy={busyDose === dose.id}
                  dose={dose}
                  disabled={Boolean(busyDose)}
                  key={dose.id}
                  onConfirm={() => void changeDose(dose, 'confirmada')}
                  onOmit={() => void changeDose(dose, 'omitida')}
                  timeZone={timeZone}
                />
              ))}
            </View>
          ) : (
            <Card><Text style={styles.emptyText}>No hay dosis para los filtros seleccionados.</Text></Card>
          )}
        </>
      )}
    </AppScreen>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filterChip, selected && styles.selectedFilter]}>
      <Text style={[styles.filterText, selected && styles.selectedFilterText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summaryTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  percent: { color: colors.primary, fontSize: 25, fontWeight: '800' },
  progressTrack: { backgroundColor: colors.border, borderRadius: radius.pill, height: 8, marginTop: spacing.md, overflow: 'hidden' },
  progress: { backgroundColor: colors.secondary, borderRadius: radius.pill, height: '100%' },
  summaryHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  sectionTitleSmall: { color: colors.text, fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: radius.pill, height: 9, width: 9 },
  scheduledDot: { backgroundColor: colors.blue },
  confirmedDot: { backgroundColor: colors.secondary },
  legendText: { color: colors.muted, fontSize: 12 },
  chart: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  chartColumn: { alignItems: 'center', flex: 1, minWidth: 0 },
  barArea: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 110, justifyContent: 'center', width: '100%' },
  bar: { borderTopLeftRadius: 5, borderTopRightRadius: 5, minHeight: 2, width: 10 },
  scheduledBar: { backgroundColor: colors.blue },
  confirmedBar: { backgroundColor: colors.secondary },
  chartDate: { color: colors.muted, fontSize: 9, marginTop: spacing.xs },
  chartValue: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dateChip: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 3 },
  selectedDate: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateText: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  selectedDateText: { color: colors.white },
  filterHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  selectedFilter: { backgroundColor: colors.softPrimary, borderColor: colors.secondary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  selectedFilterText: { color: colors.primary },
  doses: { gap: spacing.sm },
  emptyText: { color: colors.muted, textAlign: 'center' },
});
