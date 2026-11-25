import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  showBack = false,
  onBackPress,
  leftAction,
  rightAction,
}: AppHeaderProps) {
  const theme = useTheme();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View style={[styles.container, subtitle ? styles.containerWithSubtitle : null]}>
      <View style={styles.leftSlot}>
        {showBack ? (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="arrow-back" size={19} color={theme.text} />
          </Pressable>
        ) : (
          leftAction
        )}
      </View>

      <View
        pointerEvents="none"
        style={[styles.centerOverlay, rightAction ? styles.centerWideInset : styles.centerStdInset]}>
        <Text
          style={[styles.title, { color: theme.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightSlot}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  containerWithSubtitle: {
    minHeight: 52,
  },
  leftSlot: {
    minWidth: 42,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    zIndex: 1,
  },
  centerStdInset: {
    left: 50,
    right: 50,
  },
  centerWideInset: {
    left: 68,
    right: 68,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  rightSlot: {
    minWidth: 42,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
