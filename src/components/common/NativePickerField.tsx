import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/theme/colors';
import { formatDateForDisplay, formatTime12 } from '@/utils/dates';

type PickerMode = 'date' | 'time';

type NativePickerFieldProps = {
  label: string;
  mode: PickerMode;
  value: Date;
  displayValue: string;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  clearable?: boolean;
  onClear?: () => void;
};

function clampDate(value: Date, minimumDate?: Date, maximumDate?: Date) {
  if (minimumDate && value < minimumDate) return minimumDate;
  if (maximumDate && value > maximumDate) return maximumDate;
  return value;
}

export function NativePickerField({ label, mode, value, displayValue, onChange, minimumDate, maximumDate, clearable, onClear }: NativePickerFieldProps) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(value);

  function open() {
    const pickerValue = clampDate(value, minimumDate, maximumDate);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode,
        display: mode === 'date' ? 'calendar' : 'clock',
        is24Hour: false,
        minimumDate,
        maximumDate,
        minuteInterval: 1,
        onValueChange: (_event: DateTimePickerChangeEvent, selectedDate?: Date) => {
          if (selectedDate) onChange(selectedDate);
        },
      });
      return;
    }
    setDraft(pickerValue);
    setVisible(true);
  }

  function accept() {
    setVisible(false);
    onChange(draft);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={open} style={styles.field}>
          <Ionicons color={colors.primary} name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={19} />
          <Text style={styles.value}>{displayValue}</Text>
          <Ionicons color={colors.muted} name="chevron-forward" size={18} />
        </Pressable>
        {clearable && displayValue ? (
          <Pressable accessibilityRole="button" onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearText}>Limpiar</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal animationType="slide" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <DateTimePicker
              accentColor={colors.primary}
              display="spinner"
              is24Hour={false}
              locale="es-MX"
              maximumDate={maximumDate}
              minimumDate={minimumDate}
              mode={mode}
              onDismiss={() => setVisible(false)}
              onValueChange={(_event, selectedDate) => selectedDate && setDraft(selectedDate)}
              themeVariant="light"
              value={draft}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setVisible(false)}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
              <Pressable onPress={accept}><Text style={styles.acceptText}>Listo</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function DatePickerField(props: Omit<NativePickerFieldProps, 'mode' | 'displayValue' | 'value'> & { value: Date | null; placeholder?: string }) {
  return (
    <NativePickerField
      {...props}
      clearable={props.clearable && !!props.value}
      displayValue={props.value ? formatDateForDisplay(`${props.value.getFullYear()}-${String(props.value.getMonth() + 1).padStart(2, '0')}-${String(props.value.getDate()).padStart(2, '0')}`) : props.placeholder ?? 'Seleccionar fecha'}
      mode="date"
      value={props.value ?? new Date()}
    />
  );
}

export function TimePickerField(props: Omit<NativePickerFieldProps, 'mode' | 'displayValue'>) {
  return <NativePickerField {...props} displayValue={formatTime12(props.value)} mode="time" />;
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  field: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: spacing.md },
  value: { color: colors.text, flex: 1, fontSize: 16, marginLeft: spacing.sm },
  clearButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  clearText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  modalBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)', flex: 1, justifyContent: 'flex-end' },
  modalCard: { alignItems: 'center', backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  modalActions: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md, width: '100%' },
  cancelText: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  acceptText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
});
