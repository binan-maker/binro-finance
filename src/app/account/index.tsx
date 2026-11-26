import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  ConfirmDialog,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolveLocalImageUri } from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import type { SyncStatus } from '@/types/models';
import { formatDateForDisplay } from '@/utils/date';
import { getProfileInitials, PROFILE_AVATAR_COLOR } from '@/utils/profile';

function getSyncStatusMeta(
  status: SyncStatus,
  hasLastSynced: boolean,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string; bg: string } {
  switch (status) {
    case 'syncing':
      return { label: 'Syncing...', color: theme.primary, bg: theme.primarySoft };
    case 'offline':
      return { label: 'Offline', color: theme.warning, bg: theme.surfaceElevated };
    case 'error':
      return { label: 'Sync Error', color: theme.danger, bg: theme.surfaceElevated };
    case 'pending_link':
      return { label: 'Pending Link', color: theme.warning, bg: theme.surfaceElevated };
    case 'needs_account_switch':
      return { label: 'Action Needed', color: theme.warning, bg: theme.surfaceElevated };
    case 'idle':
    default:
      if (hasLastSynced) {
        return { label: 'Synced', color: theme.income, bg: theme.primarySoft };
      }
      return { label: 'Ready', color: theme.textSecondary, bg: theme.surfaceElevated };
  }
}

export default function AccountManagementScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const budgets = useAppStore((s) => s.budgets);
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const syncState = useAppStore((s) => s.syncState);
  const pendingOutboxCount = useAppStore((s) => s.pendingOutboxCount);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const syncNow = useAppStore((s) => s.syncNow);
  const signOutCloud = useAppStore((s) => s.signOutCloud);
  const clearAllLocalData = useAppStore((s) => s.clearAllLocalData);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncingManual, setSyncingManual] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);

  const avatarUri =
    resolveLocalImageUri(settings.profileAvatar) ??
    resolveLocalImageUri(authUser?.googleAvatarUrl ?? settings.googleAvatarUrl);
  const showAvatar = Boolean(avatarUri && failedAvatarUri !== avatarUri);
  const initials = getProfileInitials(
    authUser?.googleName || settings.profileName || authUser?.email,
  );
  const statusMeta = getSyncStatusMeta(
    syncState.syncStatus,
    Boolean(syncState.lastSyncedAt),
    theme,
  );

  const lastSyncedLabel = syncState.lastSyncedAt
    ? `${formatDateForDisplay(syncState.lastSyncedAt.slice(0, 10), settings.dateFormat)} · ${syncState.lastSyncedAt.slice(11, 16)} UTC`
    : 'Not synced yet';

  const handleGoogleSignIn = async () => {
    if (authBusy) return;
    setErrorMsg(null);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'error') {
        setErrorMsg(result.message);
        return;
      }
      if (result.status === 'success') {
        const latest = useAppStore.getState();
        if (!latest.accountSwitchConflict && !latest.settings.profileCompletedAt) {
          router.push('/profile/complete');
        }
      }
    } catch {
      setErrorMsg('Unable to complete Google sign-in. Please try again.');
    }
  };

  const handleSyncNow = async () => {
    if (syncingManual || authBusy) return;
    setErrorMsg(null);
    setSyncingManual(true);
    try {
      const res = await syncNow();
      if (res.status === 'error' && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setSyncingManual(false);
    }
  };

  const handleSignOut = async () => {
    setErrorMsg(null);
    try {
      await signOutCloud();
    } catch {
      setErrorMsg('Unable to sign out right now.');
    }
  };

  const handleClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    setErrorMsg(null);
    try {
      await clearAllLocalData();
      setConfirmVisible(false);
      router.replace('/onboarding');
    } catch {
      setConfirmVisible(false);
      setErrorMsg('Unable to clear local data. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Account Management" showBack />

      <AppCard>
        {authUser ? (
          <>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.avatarBadge,
                  { backgroundColor: PROFILE_AVATAR_COLOR },
                ]}>
                {showAvatar && avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    onError={() => setFailedAvatarUri(avatarUri)}
                  />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                  {authUser.googleName || settings.profileName || 'Google Account'}
                </Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {authUser.email ?? settings.googleEmail ?? 'Signed in with Google'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusMeta.bg, borderColor: theme.border },
                ]}>
                <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.syncMetaRows}>
              <View style={styles.syncMetaRow}>
                <Text style={[styles.syncMetaLabel, { color: theme.textSecondary }]}>
                  Last synced
                </Text>
                <Text style={[styles.syncMetaValue, { color: theme.text }]}>
                  {lastSyncedLabel}
                </Text>
              </View>
              <View style={styles.syncMetaRow}>
                <Text style={[styles.syncMetaLabel, { color: theme.textSecondary }]}>
                  Pending local changes
                </Text>
                <Text style={[styles.syncMetaValue, { color: theme.text }]}>
                  {pendingOutboxCount === 0
                    ? 'All backed up'
                    : `${pendingOutboxCount} pending`}
                </Text>
              </View>
            </View>

            {syncState.syncStatus === 'error' && syncState.lastError ? (
              <Text style={[styles.inlineError, { color: theme.danger }]}>
                {syncState.lastError}
              </Text>
            ) : null}

            <View style={styles.cloudActionsRow}>
              <View style={styles.flex1}>
                <AppButton
                  label="Sync Now"
                  icon={<Ionicons name="sync-outline" size={16} color={theme.primaryText} />}
                  onPress={() => void handleSyncNow()}
                  loading={syncingManual || syncState.syncStatus === 'syncing'}
                  disabled={authBusy}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Sign Out"
                  variant="outline"
                  onPress={() => void handleSignOut()}
                  disabled={authBusy || syncingManual}
                  fullWidth
                />
              </View>
            </View>

            <Text style={[styles.cloudHint, { color: theme.textMuted }]}>
              Signing out keeps all financial records stored locally on this device.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBadge, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="cloud-upload-outline" size={20} color={theme.primary} />
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Cloud Backup & Sync (Optional)
                </Text>
                <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                  Back up your ledger and custom icons privately with Google
                </Text>
              </View>
            </View>

            {syncState.linkedUserEmail ? (
              <Text style={[styles.cloudHint, { color: theme.textSecondary }]}>
                Previously linked to {syncState.linkedUserEmail}
                {pendingOutboxCount > 0
                  ? ` · ${pendingOutboxCount} local change(s) queued`
                  : ''}
              </Text>
            ) : null}

            <AppButton
              label="Continue with Google"
              variant="outline"
              icon={<Ionicons name="logo-google" size={18} color={theme.text} />}
              onPress={() => void handleGoogleSignIn()}
              loading={authBusy}
              fullWidth
            />
          </>
        )}
      </AppCard>

      <AppCard>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="phone-portrait-outline" size={20} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {settings.profileName?.trim() || 'Local Device Ledger'}
            </Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Stored locally on this device in SQLite
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.statsGrid}>
          <StatTile label="Transactions" value={String(transactions.length)} />
          <StatTile label="Categories" value={String(categories.length)} />
          <StatTile label="Tags" value={String(tags.length)} />
          <StatTile label="Budgets" value={String(budgets.length)} />
        </View>
      </AppCard>

      <AppCard>
        <Pressable
          onPress={() => router.push('/backup')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionLeft}>
            <Ionicons name="download-outline" size={20} color={theme.primary} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>
              Backup & Export
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>

      <AppCard>
        <Text style={[styles.dangerTitle, { color: theme.danger }]}>Danger Zone</Text>
        <Text style={[styles.dangerHint, { color: theme.textSecondary }]}>
          Permanently remove all local transactions, tags, custom categories, custom payment methods, and budgets on this device.
        </Text>
        <AppButton
          label="Clear All Local Data"
          variant="danger"
          onPress={() => setConfirmVisible(true)}
        />
      </AppCard>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}

      <ConfirmDialog
        visible={confirmVisible}
        title="Clear All Local Data?"
        message="All local data on this device will be permanently deleted. This action cannot be undone."
        confirmLabel="Clear All Data"
        cancelLabel="Cancel"
        destructive
        loading={clearing}
        onConfirm={() => void handleClearAll()}
        onCancel={() => setConfirmVisible(false)}
      />
    </AppScreen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statTile,
        { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
      ]}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  syncMetaRows: {
    gap: 6,
  },
  syncMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  syncMetaLabel: {
    fontSize: 13,
  },
  syncMetaValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  cloudActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cloudHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  inlineError: {
    fontSize: 12,
    fontWeight: '600',
  },
  flex1: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTile: {
    width: '48%',
    flexGrow: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dangerHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
