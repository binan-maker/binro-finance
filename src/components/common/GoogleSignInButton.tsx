import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Radius, Spacing } from '@/constants/theme';
import { useResolvedColorScheme } from '@/hooks/use-theme';

interface GoogleLogoIconProps {
  size?: number;
}

/**
 * Official 4-color Google "G" mark per Google Identity Branding Guidelines.
 */
export function GoogleLogoIcon({ size = 20 }: GoogleLogoIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

interface GoogleSignInButtonProps {
  label?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  preserveAppearanceWhenDisabled?: boolean;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function GoogleSignInButton({
  label = 'Continue with Google',
  onPress,
  loading = false,
  disabled = false,
  preserveAppearanceWhenDisabled = false,
  size = 'lg',
  fullWidth = true,
  style,
  accessibilityLabel,
}: GoogleSignInButtonProps) {
  const colorScheme = useResolvedColorScheme();
  const isDark = colorScheme === 'dark';

  const isDisabled = disabled || loading;
  const shouldDimForDisabled =
    disabled && !loading && !preserveAppearanceWhenDisabled;

  const surfaceColor = isDark ? '#131314' : '#FFFFFF';
  const borderColor = isDark ? '#5F6368' : '#DADCE0';
  const textColor = isDark ? '#E3E3E3' : '#1F1F1F';
  const pressedBackground = isDark ? '#1F2022' : '#F8F9FA';

  const minHeight = size === 'lg' ? 50 : 44;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed && !isDisabled ? pressedBackground : surfaceColor,
          borderColor,
          minHeight,
          opacity: shouldDimForDisabled ? 0.52 : pressed && !isDisabled ? 0.92 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <GoogleLogoIcon size={20} />
        )}
        <Text
          style={[styles.label, { color: textColor }]}
          numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two + 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
