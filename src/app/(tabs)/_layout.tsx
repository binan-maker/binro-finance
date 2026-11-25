import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CustomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function CustomTabBar({ state, emitter, navigateToTab, insets }: CustomTabBarProps) {
  const theme = useTheme();
  const router = useRouter();

  const routes = state.routes;

  const renderTabItem = (routeIndex: number) => {
    const route = routes[routeIndex];
    if (!route) return null;
    const isFocused = state.index === routeIndex;

    let label = 'Home';
    let iconName: keyof typeof Ionicons.glyphMap = isFocused ? 'home' : 'home-outline';

    if (route.name === 'transactions') {
      label = 'Transactions';
      iconName = isFocused ? 'receipt' : 'receipt-outline';
    } else if (route.name === 'reports') {
      label = 'Reports';
      iconName = isFocused ? 'bar-chart' : 'bar-chart-outline';
    } else if (route.name === 'settings') {
      label = 'Settings';
      iconName = isFocused ? 'settings' : 'settings-outline';
    }

    const color = isFocused ? theme.primary : theme.textMuted;

    const onPress = () => {
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigateToTab(route.key);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        style={styles.tabItem}>
        <Ionicons name={iconName} size={21} color={color} />
        <Text
          style={[
            styles.tabLabel,
            { color, fontWeight: isFocused ? '700' : '500' },
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}>
      {renderTabItem(0)}
      {renderTabItem(1)}

      <View style={styles.centerSlot}>
        <Pressable
          onPress={() => router.push('/transactions/add')}
          accessibilityRole="button"
          accessibilityLabel="New Transaction"
          style={({ pressed }) => [
            styles.fabButton,
            {
              backgroundColor: theme.primary,
              shadowColor: theme.shadow,
            },
            pressed && styles.fabPressed,
          ]}>
          <Ionicons name="add" size={28} color={theme.primaryText} />
        </Pressable>
      </View>

      {renderTabItem(2)}
      {renderTabItem(3)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: Spacing.one + 4,
    paddingHorizontal: Spacing.one,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
  },
  centerSlot: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
