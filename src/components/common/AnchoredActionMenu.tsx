import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchoredMenuAction {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface AnchoredActionMenuProps {
  visible: boolean;
  anchor: AnchorRect | null;
  actions: readonly AnchoredMenuAction[];
  onClose: () => void;
  minWidth?: number;
}

export function AnchoredActionMenu({
  visible,
  anchor,
  actions,
  onClose,
  minWidth = 176,
}: AnchoredActionMenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  if (!visible || actions.length === 0) {
    return null;
  }

  const menuWidth = Math.min(Math.max(minWidth, 168), windowWidth - Spacing.four);
  const estimatedRowHeight = 46;
  const estimatedMenuHeight = actions.length * estimatedRowHeight + 8;

  const anchorX = anchor ? anchor.x : windowWidth - Spacing.four - 28;
  const anchorY = anchor ? anchor.y : insets.top + 64;
  const anchorW = anchor ? anchor.width : 28;
  const anchorH = anchor ? anchor.height : 28;

  const preferredLeft = anchorX + anchorW - menuWidth;
  const left = Math.min(
    Math.max(preferredLeft, Spacing.two),
    windowWidth - menuWidth - Spacing.two,
  );

  const spaceBelow = windowHeight - insets.bottom - (anchorY + anchorH + 8);
  const shouldOpenAbove =
    spaceBelow < estimatedMenuHeight && anchorY - insets.top > estimatedMenuHeight + 12;

  const rawTop = shouldOpenAbove
    ? anchorY - estimatedMenuHeight - 6
    : anchorY + anchorH + 6;
  const top = Math.min(
    Math.max(rawTop, insets.top + 8),
    windowHeight - insets.bottom - estimatedMenuHeight - 8,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Dismiss action menu">
        <View
          style={[
            styles.menuCard,
            {
              width: menuWidth,
              top,
              left,
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}>
          {actions.map((action, index) => (
            <View key={action.key}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
              ) : null}
              <Pressable
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && { backgroundColor: theme.surfaceElevated },
                ]}>
                {action.icon ? (
                  <Ionicons
                    name={action.icon}
                    size={17}
                    color={action.destructive ? theme.danger : theme.textSecondary}
                  />
                ) : null}
                <Text
                  style={[
                    styles.menuItemText,
                    { color: action.destructive ? theme.danger : theme.text },
                  ]}
                  numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  menuCard: {
    position: 'absolute',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    width: '100%',
  },
});
