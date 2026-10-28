import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CharacterCountField } from '@/components/common/CharacterCountField';
import { AppButton } from '@/components/common/AppButton';
import { DatePickerField, TimePickerField } from '@/components/common/NativePickerField';
import { Notice } from '@/components/common/Notice';
import { SelectField } from '@/components/common/SelectField';
import { PRESENTATION_OPTIONS, OTHER_PRESENTATION } from '@/constants/options';
import type { MedicationInput } from '@/services/medications';
import type { MedicationWithSchedules } from '@/types/database';
import { colors, radius, spacing } from '@/theme/colors';
import {
  addCalendarMonths,
  dateFromDateKey,
  dateKeyFromLocalDate,
  formatDateForDisplay,
  formatTime12,
  normalizeDate,
  normalizeTime,
  timeFromDate,
  weekdayLabels,
  weekdayNames,
} from '@/utils/dates';

const presentationOptions = [
  ...PRESENTATION_OPTIONS.map((value) => ({ label: value, value })),
  { label: OTHER_PRESENTATION, value: OTHER_PRESENTATION },
];

function initialPresentation(medication?: MedicationWithSchedules | null) {
  const value = medication?.presentacion ?? '';
  return PRESENTATION_OPTIONS.includes(value as (typeof PRESENTATION_OPTIONS)[number]) ? value : value ? OTHER_PRESENTATION : '';
}

function initialOtherPresentation(medication?: MedicationWithSchedules | null) {
  const value = medication?.presentacion ?? '';
  return PRESENTATION_OPTIONS.includes(value as (typeof PRESENTATION_OPTIONS)[number]) ? '' : value;
}

function initialDays(medication?: MedicationWithSchedules | null) {
  const days = new Set<number>();
  for (const schedule of medication?.horarios ?? []) {
    for (const day of schedule.dias_semana) days.add(day);
  }
  return days.size ? Array.from(days).sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

function initialTimeDays(medication?: MedicationWithSchedules | null) {
  const daysByTime = new Map<string, Set<number>>();
  for (const schedule of medication?.horarios ?? []) {
    const time = normalizeTime(schedule.hora);
    const days = daysByTime.get(time) ?? new Set<number>();
    for (const day of schedule.dias_semana) days.add(day);
    daysByTime.set(time, days);
  }
  return new Map(Array.from(daysByTime.entries()).map(([time, days]) => [time, Array.from(days).sort((left, right) => left - right)]));
}

function haveDifferentScheduleDays(timeDays: Map<string, number[]>) {
  const signatures = new Set(Array.from(timeDays.values()).map((days) => days.join(',')));
  return signatures.size > 1;
}

type MedicationFormProps = {
  initial?: MedicationWithSchedules | null;
  onSubmit: (input: MedicationInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
};

export function MedicationForm({ initial, onSubmit, onCancel, submitLabel, loading = false }: MedicationFormProps) {
  const [name, setName] = useState(initial?.nombre ?? '');
  const [presentation, setPresentation] = useState(initialPresentation(initial));
  const [otherPresentation, setOtherPresentation] = useState(initialOtherPresentation(initial));
  const [dose, setDose] = useState(initial?.dosis_indicada ?? '');
  const [instructions, setInstructions] = useState(initial?.instrucciones ?? '');
  const [startDate, setStartDate] = useState(normalizeDate(initial?.fecha_inicio ?? dateKeyFromLocalDate(new Date())));
  const [endDate, setEndDate] = useState(initial?.fecha_fin ? normalizeDate(initial.fecha_fin) : '');
  const initialTimeDaysValue = initialTimeDays(initial);
  const initialTimesValue = Array.from(initialTimeDaysValue.keys()).sort();
  const timesRef = useRef(initialTimesValue);
  const timeDaysRef = useRef(initialTimeDaysValue);
  const [times, setTimes] = useState<string[]>(initialTimesValue);
  const [newTime, setNewTime] = useState(() => new Date());
  const [days, setDays] = useState<number[]>(initialDays(initial));
  const [daysChanged, setDaysChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateBounds] = useState(() => {
    const today = dateFromDateKey(dateKeyFromLocalDate(new Date()));
    return { today, maximum: addCalendarMonths(today, 6) };
  });

  const todayKey = dateKeyFromLocalDate(dateBounds.today);
  const maximumDateKey = dateKeyFromLocalDate(dateBounds.maximum);
  const originalStart = initial?.fecha_inicio ? normalizeDate(initial.fecha_inicio) : null;
  const originalEnd = initial?.fecha_fin ? normalizeDate(initial.fecha_fin) : null;
  const startMinimumDate = originalStart && originalStart < todayKey ? dateFromDateKey(originalStart) : dateBounds.today;
  const startMaximumDate = originalStart && originalStart > maximumDateKey ? dateFromDateKey(originalStart) : dateBounds.maximum;
  const endMaximumDate = originalEnd && originalEnd > maximumDateKey ? dateFromDateKey(originalEnd) : dateBounds.maximum;

  function addTime(value: Date) {
    const normalized = timeFromDate(value);
    if (timesRef.current.some((time) => time.slice(0, 5) === normalized.slice(0, 5))) {
      setError('Ese horario ya está agregado.');
      return;
    }
    const nextTimes = [...timesRef.current, normalized].sort();
    timesRef.current = nextTimes;
    timeDaysRef.current.set(normalized, [...days]);
    setTimes(nextTimes);
    setError(null);
  }

  function removeTime(timeToRemove: string) {
    const nextTimes = timesRef.current.filter((time) => time !== timeToRemove);
    timesRef.current = nextTimes;
    timeDaysRef.current.delete(timeToRemove);
    setTimes(nextTimes);
  }

  function toggleDay(day: number) {
    setDaysChanged(true);
    setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()));
  }

  function changeStartDate(value: Date) {
    const nextDate = dateKeyFromLocalDate(value);
    setStartDate(nextDate);
    if (endDate && endDate < nextDate) setEndDate('');
  }

  async function handleSubmit() {
    setError(null);
    const selectedPresentation = presentation === OTHER_PRESENTATION ? otherPresentation.trim() : presentation.trim();
    const startIsOriginal = startDate === originalStart;
    const endIsOriginal = endDate === originalEnd;

    if (!name.trim()) {
      setError('El nombre del medicamento es obligatorio.');
      return;
    }
    if (name.length > 50) {
      setError('El nombre del medicamento no puede superar 50 caracteres.');
      return;
    }
    if (!presentation) {
      setError('Selecciona una presentación.');
      return;
    }
    if (!selectedPresentation) {
      setError('Escribe la otra presentación.');
      return;
    }
    if (selectedPresentation.length > 50) {
      setError('La presentación no puede superar 50 caracteres.');
      return;
    }
    if (!dose.trim()) {
      setError('La dosis indicada es obligatoria.');
      return;
    }
    if (dose.length > 100) {
      setError('La dosis indicada no puede superar 100 caracteres.');
      return;
    }
    if (instructions.length > 200) {
      setError('Las instrucciones no pueden superar 200 caracteres.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || (!startIsOriginal && (startDate < todayKey || startDate > maximumDateKey))) {
      setError('La fecha de inicio debe estar entre hoy y seis meses después.');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setError('La fecha de finalización no es válida.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('La fecha de finalización no puede ser anterior al inicio.');
      return;
    }
    if (endDate && !endIsOriginal && endDate > maximumDateKey) {
      setError('La fecha de finalización no puede superar seis meses desde hoy.');
      return;
    }
    if (!times.length) {
      setError('Agrega al menos un horario.');
      return;
    }
    if (!days.length) {
      setError('Selecciona al menos un día de la semana.');
      return;
    }

    await onSubmit({
      nombre: name.trim(),
      presentacion: selectedPresentation,
      dosis_indicada: dose.trim(),
      instrucciones: instructions.trim() || null,
      fecha_inicio: startDate,
      fecha_fin: endDate || null,
      horarios: times.map((hora) => ({
        hora: normalizeTime(hora),
        dias_semana: [...(daysChanged ? days : timeDaysRef.current.get(hora) ?? days)].sort((left, right) => left - right),
      })),
    });
  }

  return (
    <View style={styles.container}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.form}>
        <CharacterCountField label="Nombre del medicamento" maxLength={50} onChangeText={setName} placeholder="Ej. Paracetamol" value={name} />
        <SelectField label="Presentación" onChange={setPresentation} options={presentationOptions} placeholder="Selecciona una presentación" value={presentation} />
        {presentation === OTHER_PRESENTATION ? (
          <CharacterCountField label="Otra presentación" maxLength={50} onChangeText={setOtherPresentation} placeholder="Escribe la presentación" value={otherPresentation} />
        ) : null}
        <CharacterCountField label="Dosis indicada" maxLength={100} onChangeText={setDose} placeholder="Ej. 1 tableta cada 8 horas" value={dose} />
        <CharacterCountField label="Instrucciones (opcional)" maxLength={200} multiline onChangeText={setInstructions} placeholder="Ej. Después de los alimentos" value={instructions} />

        <DatePickerField
          label="Fecha de inicio"
          maximumDate={startMaximumDate}
          minimumDate={startMinimumDate}
          onChange={changeStartDate}
          value={dateFromDateKey(startDate)}
        />
        <DatePickerField
          clearable
          label="Fecha de finalización (opcional)"
          maximumDate={endMaximumDate}
          minimumDate={dateFromDateKey(startDate)}
          onChange={(value) => setEndDate(dateKeyFromLocalDate(value))}
          onClear={() => setEndDate('')}
          placeholder="Sin fecha de finalización"
          value={endDate ? dateFromDateKey(endDate) : null}
        />
        {startDate && endDate ? <Text style={styles.dateHint}>{formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Horarios seleccionados</Text>
          <TimePickerField label="Nueva hora" onChange={(value) => { setNewTime(value); addTime(value); }} value={newTime} />
          <View style={styles.chips}>
            {times.map((time) => (
              <Pressable accessibilityLabel={`Eliminar horario ${formatTime12(time)}`} key={time} onPress={() => removeTime(time)} style={styles.timeChip}>
                <Text style={styles.timeChipText}>{formatTime12(time)}</Text>
                <Ionicons color={colors.primary} name="close-circle" size={16} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Días de la semana</Text>
          {haveDifferentScheduleDays(initialTimeDaysValue) && !daysChanged ? (
            <Text style={styles.helper}>Este tratamiento conserva días distintos por horario. Si cambias un día, se aplicará a todos los horarios.</Text>
          ) : null}
          <View style={styles.weekRow}>
            {weekdayLabels.map((label, day) => {
              const selected = days.includes(day);
              return (
                <Pressable accessibilityLabel={weekdayNames[day]} key={day} onPress={() => toggleDay(day)} style={[styles.day, selected && styles.selectedDay]}>
                  <Text style={[styles.dayText, selected && styles.selectedDayText]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.helper}>Selecciona todos los días en que debes tomarlo.</Text>
        </View>

        <View style={styles.buttons}>
          <AppButton loading={loading} onPress={handleSubmit}>{submitLabel}</AppButton>
          <AppButton disabled={loading} onPress={onCancel} variant="ghost">Cancelar</AppButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  form: { gap: spacing.md },
  dateHint: { color: colors.muted, fontSize: 12, marginTop: -spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.pill, flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  timeChipText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  selectedDay: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  selectedDayText: { color: colors.white },
  helper: { color: colors.muted, fontSize: 12 },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
