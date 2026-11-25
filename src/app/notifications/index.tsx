import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
import type { AppNotification, NotificationType } from '@/types/models';
import { formatDateTimeForDisplay } from '@/utils/date';

export default function NotificationsScreen() {
  const theme = useTheme();
  const settings = useAppStore((s) => s.settings);
  const notifications = useAppStore((s) => s.notifications);
  const markNotificationRead = useAppStore((s) => s.markNotificationRead);
  const markNotificationUnread = useAppStore((s) => s.markNotificationUnread);
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead);
  const deleteNotification = useAppStore((s) => s.deleteNotification);

  const [selectedNotification, setSelectedNotification] =
    useState<AppNotification | null>(null);

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
          description="Backup and budget alerts appear here."
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
                      <View style={styles.titleLeft}>
                        {!item.isRead ? (
                          <View
                            style={[styles.unreadDot, { backgroundColor: theme.primary }]}
                          />
                        ) : null}
                        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                      </View>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedNotification(item);
                        }}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Actions for ${item.title}`}
                        style={({ pressed }) => [
                          styles.menuTrigger,
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name="ellipsis-vertical"
                          size={18}
                          color={theme.textSecondary}
                        />
                      </Pressable>
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

      <Modal
        visible={Boolean(selectedNotification)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedNotification(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedNotification(null)}>
          {selectedNotification ? (
            <View
              style={[
                styles.menuCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <Pressable
                onPress={() => {
                  const target = selectedNotification;
                  setSelectedNotification(null);
                  if (target.isRead) {
                    void markNotificationUnread(target.id);
                  } else {
                    void markNotificationRead(target.id);
                  }
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                <Text style={[styles.menuItemText, { color: theme.text }]}>
                  {selectedNotification.isRead ? 'Mark as unread' : 'Mark as read'}
                </Text>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <Pressable
                onPress={() => {
                  const targetId = selectedNotification.id;
                  setSelectedNotification(null);
                  void deleteNotification(targetId);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                <Text style={[styles.menuItemText, { color: theme.danger }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
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
  menuTrigger: {
    padding: 2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
  },
  menuCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
});
