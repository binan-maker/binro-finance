import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  preserveAppearanceWhenDisabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  preserveAppearanceWhenDisabled = false,
  icon,
  style,
  fullWidth = false,
}: AppButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const shouldDimForDisabled = disabled && !loading && !preserveAppearanceWhenDisabled;

  const variantColors: Record<
    ButtonVariant,
    { bg: string; text: string; border: string }
  > = {
    primary: {
      bg: theme.primary,
      text: theme.primaryText,
      border: theme.primary,
    },
    secondary: {
      bg: theme.surfaceElevated,
      text: theme.text,
      border: theme.border,
    },
    outline: {
      bg: 'transparent',
      text: theme.text,
      border: theme.border,
    },
    danger: {
      bg: theme.danger,
      text: '#FFFFFF',
      border: theme.danger,
    },
    ghost: {
      bg: 'transparent',
      text: theme.primary,
      border: 'transparent',
    },
  };

  const palette = variantColors[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        pressed && !isDisabled && styles.pressed,
        shouldDimForDisabled && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={palette.text} /> : icon}
      <Text
        style={[
          styles.label,
          size === 'sm' ? styles.labelSm : styles.labelMd,
          { color: palette.text },
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 36,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
  },
  md: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  lg: {
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three - 2,
  },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontWeight: '600',
  },
  labelSm: {
    fontSize: 13,
  },
  labelMd: {
    fontSize: 15,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
});
