import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as Network from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { AppButton, BottomSheetModal, ErrorState, LoadingState } from '@/components/common';
import { Colors, Spacing } from '@/constants/theme';
import { useResolvedColorScheme, useTheme } from '@/hooks/use-theme';
import { trackAnalyticsEvent } from '@/services/analytics/analyticsService';
import { extractAuthProfileFromSessionUser } from '@/services/auth/googleAuthService';
import { getSupabaseClient, registerSupabaseAppStateRefresh } from '@/services/supabase/client';
import { useAppStore } from '@/store/app-store';
import { shouldPromptProfileCompletion } from '@/utils/profile';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const resolvedScheme = useResolvedColorScheme();
  const themeColors = Colors[resolvedScheme];

  const isInitialized = useAppStore((s) => s.isInitialized);
  const error = useAppStore((s) => s.error);
  const onboardingCompleted = useAppStore((s) => s.settings.onboardingCompleted);
  const profileCompletedAt = useAppStore((s) => s.settings.profileCompletedAt);
  const savedGender = useAppStore((s) => s.settings.gender);
  const savedDateOfBirth = useAppStore((s) => s.settings.dateOfBirth);
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const accountSwitchConflict = useAppStore((s) => s.accountSwitchConflict);
  const initializeApp = useAppStore((s) => s.initializeApp);
  const confirmAccountSwitchReplace = useAppStore((s) => s.confirmAccountSwitchReplace);
  const cancelAccountSwitch = useAppStore((s) => s.cancelAccountSwitch);

  const segments = useSegments();
  const router = useRouter();
  const appOpenedTrackedRef = useRef(false);
  const wasConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (isInitialized || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isInitialized, error]);

  useEffect(() => {
    if (!isInitialized || appOpenedTrackedRef.current) return;
    appOpenedTrackedRef.current = true;
    void trackAnalyticsEvent('app_opened');
  }, [isInitialized]);

  useEffect(() => {
    const unregisterRefresh = registerSupabaseAppStateRefresh();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && useAppStore.getState().isInitialized) {
        void useAppStore.getState().syncNow();
      }
    });

    const netSub = Network.addNetworkStateListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online && wasConnectedRef.current === false && useAppStore.getState().isInitialized) {
        void useAppStore.getState().syncNow();
      }
      wasConnectedRef.current = online;
    });

    return () => {
      unregisterRefresh();
      appStateSub.remove();
      netSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || !data.session?.user) return;
        const store = useAppStore.getState();
        const profile = extractAuthProfileFromSessionUser(data.session.user);
        if (store.authUser?.userId !== profile.userId && !store.authBusy) {
          void store
            .applySignedInSession(profile, { source: 'session_restore' })
            .catch(() => {});
        }
      })
      .catch(() => {});

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const store = useAppStore.getState();
      if (
        (event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED') &&
        session?.user
      ) {
        const profile = extractAuthProfileFromSessionUser(session.user);
        if (store.authUser?.userId !== profile.userId && !store.authBusy) {
          void store
            .applySignedInSession(profile, { source: 'session_restore' })
            .catch(() => {});
        }
      } else if (event === 'SIGNED_OUT' && store.authUser && !store.authBusy) {
        void store.signOutCloud().catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized || accountSwitchConflict || authBusy) return;

    const rootSegment = segments[0];
    const inOnboarding = rootSegment === 'onboarding';
    const allowedBeforeOnboarding = inOnboarding || rootSegment === 'currency';
    if (!onboardingCompleted && !allowedBeforeOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingCompleted && inOnboarding) {
      if (
        authUser &&
        shouldPromptProfileCompletion({
          gender: savedGender,
          dateOfBirth: savedDateOfBirth,
          profileCompletedAt,
        })
      ) {
        router.replace('/profile/complete');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [
    isInitialized,
    onboardingCompleted,
    profileCompletedAt,
    savedGender,
    savedDateOfBirth,
    authUser,
    authBusy,
    accountSwitchConflict,
    segments,
    router,
  ]);

  const navigationTheme =
    resolvedScheme === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: themeColors.background,
            card: themeColors.surface,
            text: themeColors.text,
            border: themeColors.border,
            primary: themeColors.primary,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: themeColors.background,
            card: themeColors.surface,
            text: themeColors.text,
            border: themeColors.border,
            primary: themeColors.primary,
          },
        };

  if (!isInitialized) {
    return (
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.bootstrapContainer, { backgroundColor: themeColors.background }]}>
          {error ? (
            <ErrorState message={error} onRetry={() => void initializeApp()} />
          ) : (
            <LoadingState message="Preparing your local ledger..." />
          )}
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/complete" options={{ gestureEnabled: false }} />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="account/index" />
        <Stack.Screen name="account/danger-zone" />
        <Stack.Screen name="currency/index" />
        <Stack.Screen name="transactions/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/filters" />
        <Stack.Screen name="transactions/[id]" />
        <Stack.Screen name="notifications/index" />
        <Stack.Screen name="calendar/index" />
        <Stack.Screen name="categories/index" />
        <Stack.Screen name="tags/index" />
        <Stack.Screen name="payment-methods/index" />
        <Stack.Screen name="budgets/index" />
        <Stack.Screen name="backup/index" />
        <Stack.Screen name="privacy-policy/index" />
        <Stack.Screen name="about/index" />
      </Stack>

      <AccountSwitchConflictModal
        conflict={accountSwitchConflict}
        busy={authBusy}
        onBackupFirst={() => {
          void cancelAccountSwitch().then(() => {
            router.push('/backup');
          });
        }}
        onConfirmSwitch={() => void confirmAccountSwitchReplace()}
        onCancel={() => void cancelAccountSwitch()}
      />
    </ThemeProvider>
  );
}

interface AccountSwitchConflictModalProps {
  conflict: ReturnType<typeof useAppStore.getState>['accountSwitchConflict'];
  busy: boolean;
  onBackupFirst: () => void;
  onConfirmSwitch: () => void;
  onCancel: () => void;
}

function AccountSwitchConflictModal({
  conflict,
  busy,
  onBackupFirst,
  onConfirmSwitch,
  onCancel,
}: AccountSwitchConflictModalProps) {
  const theme = useTheme();
  if (!conflict) return null;

  const previousLabel = conflict.previousUserEmail || 'the previous Google account';
  const nextLabel = conflict.newProfile.email || 'the new Google account';

  return (
    <BottomSheetModal
      visible
      variant="center"
      onClose={busy ? () => {} : onCancel}>
      <Text style={[styles.conflictTitle, { color: theme.text }]}>
        Switch Google Account?
      </Text>
      <Text style={[styles.conflictMessage, { color: theme.textSecondary }]}>
        This device currently stores data linked to {previousLabel}. Switching to {nextLabel} clears the previous account&apos;s local workspace so accounts never mix, then syncs the new account&apos;s cloud data.
      </Text>
      {conflict.pendingOutboxCount > 0 ? (
        <Text style={[styles.conflictWarning, { color: theme.warning }]}>
          {conflict.pendingOutboxCount} unsynced local change(s) have not been uploaded yet. Export a backup first if you want a local copy.
        </Text>
      ) : null}

      <View style={styles.conflictActions}>
        <AppButton
          label="Back up & Export"
          variant="outline"
          onPress={onBackupFirst}
          disabled={busy}
          fullWidth
        />
        <AppButton
          label="Switch & Load New Account"
          variant="danger"
          onPress={onConfirmSwitch}
          loading={busy}
          fullWidth
        />
        <AppButton
          label="Keep Previous Account"
          variant="outline"
          onPress={onCancel}
          disabled={busy}
          fullWidth
        />
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  bootstrapContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  conflictTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  conflictMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  conflictWarning: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  conflictActions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
