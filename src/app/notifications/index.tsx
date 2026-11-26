import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AnchoredActionMenu,
  type AnchoredMenuAction,
  type AnchorRect,
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
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const triggerRefs = useRef<Map<string, ComponentRef<typeof View> | null>>(new Map());

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

  const openMenuForItem = (item: AppNotification) => {
    const triggerView = triggerRefs.current.get(item.id);
    if (triggerView) {
      triggerView.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ x, y, width, height });
        setSelectedNotification(item);
      });
    } else {
      setMenuAnchor(null);
      setSelectedNotification(item);
    }
  };

  const menuActions: AnchoredMenuAction[] = selectedNotification
    ? [
        {
          key: 'toggle-read',
          label: selectedNotification.isRead ? 'Mark as unread' : 'Mark as read',
          icon: selectedNotification.isRead
            ? 'mail-unread-outline'
            : 'checkmark-done-outline',
          onPress: () => {
            if (selectedNotification.isRead) {
              void markNotificationUnread(selectedNotification.id);
            } else {
              void markNotificationRead(selectedNotification.id);
            }
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: 'trash-outline',
          destructive: true,
          onPress: () => void deleteNotification(selectedNotification.id),
        },
      ]
    : [];

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
          description="Account, backup, and budget alerts appear here."
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
                      <View
                        ref={(el) => {
                          if (el) triggerRefs.current.set(item.id, el);
                          else triggerRefs.current.delete(item.id);
                        }}
                        collapsable={false}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            openMenuForItem(item);
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

      <AnchoredActionMenu
        visible={Boolean(selectedNotification)}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={() => setSelectedNotification(null)}
      />
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
  pressed: {
    opacity: 0.72,
  },
});
