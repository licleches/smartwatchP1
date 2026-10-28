import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type AppButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}>;

export function AppButton({
  children,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  compact = false,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.primary} />
      ) : (
        <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  compact: { minHeight: 44, paddingHorizontal: spacing.sm },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.softPrimary },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.error },
  label: { color: colors.white, fontSize: 15, fontWeight: '700' },
  ghostLabel: { color: colors.primary },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.98 }] },
});
