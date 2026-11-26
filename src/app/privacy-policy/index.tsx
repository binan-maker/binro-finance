import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
} from '@/components/common';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from '@/constants/privacyPolicy';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function PrivacyPolicyScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Privacy Policy" showBack />

      <AppCard>
        <View style={styles.metaRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
          <Text style={[styles.updatedText, { color: theme.textSecondary }]}>
            {PRIVACY_POLICY_LAST_UPDATED}
          </Text>
        </View>
        <Text style={[styles.introText, { color: theme.text }]}>
          {PRIVACY_POLICY_INTRO}
        </Text>
      </AppCard>

      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <AppCard key={section.id}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {section.title}
          </Text>

          {section.paragraphs.map((paragraph, idx) => (
            <Text
              key={`${section.id}-p-${idx}`}
              style={[styles.paragraph, { color: theme.textSecondary }]}>
              {paragraph}
            </Text>
          ))}

          {section.bullets && section.bullets.length > 0 ? (
            <View style={styles.bulletList}>
              {section.bullets.map((bullet, idx) => (
                <View key={`${section.id}-b-${idx}`} style={styles.bulletRow}>
                  <Text style={[styles.bulletDot, { color: theme.primary }]}>•</Text>
                  <Text style={[styles.bulletText, { color: theme.textSecondary }]}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </AppCard>
      ))}

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Manage or Delete Your Data
        </Text>
        <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
          You can export your ledger, clear local device storage, or delete a linked Google cloud account from Account Management.
        </Text>
        <AppButton
          label="Open Account Management"
          variant="outline"
          onPress={() => router.push('/account')}
          fullWidth
        />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  updatedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  introText: {
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
  },
  bulletList: {
    gap: Spacing.one + 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  bulletDot: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
