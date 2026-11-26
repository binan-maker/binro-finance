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
  GoogleSignInButton,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolveLocalImageUri } from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import type { SyncStatus } from '@/types/models';
import { formatDateForDisplay } from '@/utils/date';
import {
  getProfileInitials,
  PROFILE_AVATAR_COLOR,
  shouldPromptProfileCompletion,
} from '@/utils/profile';

function getAccountStatusMeta(
  signedIn: boolean,
  status: SyncStatus,
  hasLastSynced: boolean,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string; bg: string } {
  if (!signedIn) {
    return { label: 'Local Mode', color: theme.textSecondary, bg: theme.surfaceElevated };
  }
  switch (status) {
    case 'syncing':
      return { label: 'Syncing...', color: theme.primary, bg: theme.primarySoft };
    case 'offline':
      return { label: 'Offline', color: theme.warning, bg: theme.surfaceElevated };
    case 'error':
      return { label: 'Sync Error', color: theme.danger, bg: theme.surfaceElevated };
    case 'pending_link':
    case 'needs_account_switch':
      return { label: 'Action Needed', color: theme.warning, bg: theme.surfaceElevated };
    case 'idle':
    default:
      if (hasLastSynced) {
        return { label: 'Signed In · Synced', color: theme.income, bg: theme.primarySoft };
      }
      return { label: 'Signed In', color: theme.primary, bg: theme.primarySoft };
  }
}

export default function AccountManagementScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const syncState = useAppStore((s) => s.syncState);
  const pendingOutboxCount = useAppStore((s) => s.pendingOutboxCount);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const syncNow = useAppStore((s) => s.syncNow);
  const signOutCloud = useAppStore((s) => s.signOutCloud);

  const [onDeviceExpanded, setOnDeviceExpanded] = useState(false);
  const [syncingManual, setSyncingManual] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);

  const avatarUri =
    resolveLocalImageUri(settings.profileAvatar) ??
    resolveLocalImageUri(authUser?.googleAvatarUrl ?? settings.googleAvatarUrl);
  const showAvatar = Boolean(avatarUri && failedAvatarUri !== avatarUri);

  const displayName = authUser
    ? authUser.googleName || settings.profileName?.trim() || 'Google Account'
    : settings.profileName?.trim() || 'Local Profile';
  const identitySub = authUser
    ? authUser.email ?? settings.googleEmail ?? 'Connected with Google'
    : 'Not signed in';

  const initials = getProfileInitials(
    authUser?.googleName || settings.profileName || authUser?.email,
  );
  const statusMeta = getAccountStatusMeta(
    Boolean(authUser),
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
        if (
          !latest.accountSwitchConflict &&
          shouldPromptProfileCompletion(latest.settings)
        ) {
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

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Account Management" showBack />

      <AppCard>
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
              {displayName}
            </Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {identitySub}
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

        {authUser ? (
          <>
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
                  Pending changes
                </Text>
                <Text style={[styles.syncMetaValue, { color: theme.text }]}>
                  {pendingOutboxCount === 0
                    ? 'Up to date'
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
          </>
        ) : (
          <>
            {syncState.linkedUserEmail ? (
              <Text style={[styles.linkedHint, { color: theme.textSecondary }]}>
                Previously linked: {syncState.linkedUserEmail}
              </Text>
            ) : null}

            <GoogleSignInButton
              label="Continue with Google"
              size="md"
              onPress={() => void handleGoogleSignIn()}
              loading={authBusy}
            />
          </>
        )}
      </AppCard>

      <AppCard>
        <Pressable
          onPress={() => setOnDeviceExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded: onDeviceExpanded }}
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionLeft}>
            <Ionicons name="phone-portrait-outline" size={20} color={theme.textSecondary} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>
              On-device data
            </Text>
          </View>
          <Ionicons
            name={onDeviceExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textMuted}
          />
        </Pressable>

        {onDeviceExpanded ? (
          <Text style={[styles.onDeviceCopy, { color: theme.textSecondary }]}>
            Your records are saved directly on this device so the app works offline even without signing in.
          </Text>
        ) : null}
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

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}

      <AppCard style={styles.dangerEntryCard}>
        <Pressable
          onPress={() => router.push('/account/danger-zone')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionLeft}>
            <Ionicons name="warning-outline" size={18} color={theme.danger} />
            <Text style={[styles.dangerRowLabel, { color: theme.danger }]}>
              Danger Zone
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
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
  linkedHint: {
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
  onDeviceCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  dangerEntryCard: {
    marginTop: Spacing.one,
  },
  dangerRowLabel: {
    fontSize: 14,
    fontWeight: '600',
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
