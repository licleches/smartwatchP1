import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type CharacterCountFieldProps = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  label: string;
  value: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  error?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  containerStyle?: StyleProp<ViewStyle>;
};

export function CharacterCountField({ label, value, maxLength, onChangeText, error, icon, style, containerStyle, ...props }: CharacterCountFieldProps) {
  const atLimit = value.length >= maxLength;
  return (
    <View style={[styles.wrapper, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.counter, atLimit && styles.limitCounter]}>{value.length}/{maxLength}</Text>
      </View>
      <View style={[styles.inputWrap, (atLimit || error) && styles.errorInput]}>
        {icon ? <Ionicons color={colors.muted} name={icon} size={19} style={styles.icon} /> : null}
        <TextInput
          {...props}
          maxLength={maxLength}
          onChangeText={(nextValue) => onChangeText(nextValue.slice(0, maxLength))}
          placeholderTextColor={colors.muted}
          style={[styles.input, props.multiline && styles.multiline, style]}
          value={value}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  counter: { color: colors.muted, fontSize: 12 },
  limitCounter: { color: colors.error, fontWeight: '800' },
  inputWrap: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: spacing.md },
  errorInput: { borderColor: colors.error },
  icon: { marginRight: spacing.sm },
  input: { color: colors.text, flex: 1, fontSize: 16, paddingVertical: spacing.sm },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: colors.error, fontSize: 12 },
});
