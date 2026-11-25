import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/common';
import { Colors } from '@/constants/theme';
import { useResolvedColorScheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const resolvedScheme = useResolvedColorScheme();
  const themeColors = Colors[resolvedScheme];

  const isInitialized = useAppStore((s) => s.isInitialized);
  const error = useAppStore((s) => s.error);
  const onboardingCompleted = useAppStore((s) => s.settings.onboardingCompleted);
  const initializeApp = useAppStore((s) => s.initializeApp);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (isInitialized || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isInitialized, error]);

  useEffect(() => {
    if (!isInitialized) return;

    const inOnboarding = segments[0] === 'onboarding';
    if (!onboardingCompleted && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingCompleted && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [isInitialized, onboardingCompleted, segments, router]);

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
        <Stack.Screen name="transactions/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/[id]" />
        <Stack.Screen name="calendar/index" />
        <Stack.Screen name="categories/index" />
        <Stack.Screen name="budgets/index" />
        <Stack.Screen name="backup/index" />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  bootstrapContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
});
