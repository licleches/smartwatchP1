import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

type TextFieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  icon?: IconName;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({ label, error, icon, style, containerStyle, ...inputProps }: TextFieldProps) {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error && styles.inputError]}>
        {icon ? <Ionicons color={colors.muted} name={icon} size={19} style={styles.icon} /> : null}
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.error },
  icon: { marginRight: spacing.sm },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm },
  error: { color: colors.error, fontSize: 12 },
});
