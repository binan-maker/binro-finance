import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
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
  const [leftWidth, setLeftWidth] = useState(0);
  const [rightWidth, setRightWidth] = useState(0);

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  const balancedSideWidth = Math.max(42, leftWidth, rightWidth);

  return (
    <View style={[styles.container, subtitle ? styles.containerWithSubtitle : null]}>
      <View style={[styles.leftSlot, { minWidth: balancedSideWidth }]}>
        <View
          onLayout={(e) => {
            const next = Math.ceil(e.nativeEvent.layout.width);
            if (next !== leftWidth) setLeftWidth(next);
          }}>
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
      </View>

      <View style={styles.centerSlot}>
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

      <View style={[styles.rightSlot, { minWidth: balancedSideWidth }]}>
        <View
          onLayout={(e) => {
            const next = Math.ceil(e.nativeEvent.layout.width);
            if (next !== rightWidth) setRightWidth(next);
          }}>
          {rightAction}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  containerWithSubtitle: {
    minHeight: 52,
  },
  leftSlot: {
    minHeight: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
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
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
