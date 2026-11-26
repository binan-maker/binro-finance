import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AppCard } from './AppCard';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SignInReminderCardProps {
  loading?: boolean;
  errorMessage?: string | null;
  onSignInPress: () => void;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SignInReminderCard({
  loading = false,
  errorMessage = null,
  onSignInPress,
  onDismiss,
  style,
}: SignInReminderCardProps) {
  const theme = useTheme();

  return (
    <AppCard style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: theme.text }]}>Sync your data</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Sign in with Google to connect your account.
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Google sign-in reminder"
          style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={theme.textMuted} />
        </Pressable>
      </View>

      {errorMessage ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMessage}</Text>
      ) : null}

      <GoogleSignInButton
        label="Continue with Google"
        size="md"
        loading={loading}
        onPress={onSignInPress}
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
