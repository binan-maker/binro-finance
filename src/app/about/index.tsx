import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppCard,
  AppHeader,
  AppScreen,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AboutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="About" showBack />

      <AppCard>
        <View style={styles.brandHeader}>
          <View style={[styles.iconBadge, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="wallet-outline" size={24} color={theme.primary} />
          </View>
          <View style={styles.brandMeta}>
            <Text style={[styles.appName, { color: theme.text }]}>BinRo Finance</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>
              Local-first personal money manager
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Version</Text>
          <Text style={[styles.infoValue, { color: theme.textMuted }]}>
            v{appVersion}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Pressable
          onPress={() => router.push('/privacy-policy')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
          <Text style={[styles.infoLabel, { color: theme.text }]}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMeta: {
    flex: 1,
    gap: 2,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
  },
  tagline: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.72,
  },
});
