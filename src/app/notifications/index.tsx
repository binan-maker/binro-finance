import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  EmptyState,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { NotificationType } from '@/types/models';
import { formatDateTimeForDisplay } from '@/utils/date';

export default function NotificationsScreen() {
  const theme = useTheme();
  const settings = useAppStore((s) => s.settings);
  const notifications = useAppStore((s) => s.notifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const iconForType = (type: NotificationType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'backup':
        return 'cloud-done-outline';
      case 'budget_alert':
        return 'alert-circle-outline';
      case 'system':
      default:
        return 'notifications-outline';
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Notifications"
        subtitle={
          unreadCount > 0 ? `${unreadCount} unread` : 'Genuine activity & alerts'
        }
        showBack
        rightAction={
          unreadCount > 0 ? (
            <AppButton
              label="Mark all read"
              size="sm"
              variant="ghost"
              onPress={() => void markAllNotificationsRead()}
            />
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No notifications yet"
          description="Alerts for backup exports, restores, and important app milestones will appear here."
        />
      ) : (
        <View style={styles.list}>
          {notifications.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (!item.isRead) {
                  void markNotificationRead(item.id);
                }
              }}>
              <AppCard
                style={
                  !item.isRead
                    ? {
                        borderColor: theme.primary,
                        backgroundColor: theme.primarySoft,
                      }
                    : undefined
                }>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.iconBadge,
                      {
                        backgroundColor:
                          item.type === 'budget_alert'
                            ? theme.warningSoft
                            : theme.surfaceElevated,
                      },
                    ]}>
                    <Ionicons
                      name={iconForType(item.type)}
                      size={18}
                      color={
                        item.type === 'budget_alert' ? theme.warning : theme.primary
                      }
                    />
                  </View>

                  <View style={styles.content}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: theme.text }]}>
                        {item.title}
                      </Text>
                      {!item.isRead ? (
                        <View
                          style={[styles.unreadDot, { backgroundColor: theme.primary }]}
                        />
                      ) : null}
                    </View>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>
                      {item.body}
                    </Text>
                    <Text style={[styles.time, { color: theme.textMuted }]}>
                      {formatDateTimeForDisplay(item.createdAt, settings.dateFormat)}
                    </Text>
                  </View>
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    marginTop: 2,
  },
});
