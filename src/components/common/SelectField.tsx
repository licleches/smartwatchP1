import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

export type SelectOption = { label: string; value: string };

type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
};

export function SelectField({ label, value, options, onChange, placeholder = 'Selecciona una opción', error }: SelectFieldProps) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((option) => option.value === value);

  function choose(option: SelectOption) {
    onChange(option.value);
    setVisible(false);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={[styles.field, error && styles.errorField]}>
        <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
        <Ionicons color={colors.muted} name="chevron-down" size={19} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Modal animationType="slide" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable accessibilityLabel="Cerrar" onPress={() => setVisible(false)}>
                <Ionicons color={colors.muted} name="close" size={24} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable key={option.value} onPress={() => choose(option)} style={[styles.option, isSelected && styles.selectedOption]}>
                    <Text style={[styles.optionText, isSelected && styles.selectedOptionText]}>{option.label}</Text>
                    {isSelected ? <Ionicons color={colors.primary} name="checkmark" size={20} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  field: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: spacing.md },
  errorField: { borderColor: colors.error },
  value: { color: colors.text, flex: 1, fontSize: 16 },
  placeholder: { color: colors.muted },
  error: { color: colors.error, fontSize: 12 },
  modalBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)', flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '82%', padding: spacing.md },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  option: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.sm },
  selectedOption: { backgroundColor: colors.softPrimary },
  optionText: { color: colors.text, fontSize: 15 },
  selectedOptionText: { color: colors.primary, fontWeight: '800' },
});
