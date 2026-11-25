import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'sheet' | 'center';
  keyboardAvoiding?: boolean;
  maxWidth?: number;
  containerStyle?: StyleProp<ViewStyle>;
  disableBackdropPress?: boolean;
}

export function BottomSheetModal({
  visible,
  onClose,
  children,
  variant = 'sheet',
  keyboardAvoiding = false,
  maxWidth = 420,
  containerStyle,
  disableBackdropPress = false,
}: BottomSheetModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  if (visible && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, {
        toValue: 1,
        duration: 210,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 170,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setRendered(false);
      }
    });
  }, [visible, progress]);

  if (!rendered) {
    return null;
  }

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [280, 0],
  });

  const centerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1],
  });

  const card =
    variant === 'center' ? (
      <Animated.View
        style={[
          styles.centerCard,
          {
            maxWidth,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: progress,
            transform: [{ scale: centerScale }],
          },
          containerStyle,
        ]}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.innerPressable}>
          {children}
        </Pressable>
      </Animated.View>
    ) : (
      <Animated.View
        style={[
          styles.sheetCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom + Spacing.three, Spacing.four),
            opacity: progress,
            transform: [{ translateY: sheetTranslateY }],
          },
          containerStyle,
        ]}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.innerPressable}>
          {children}
        </Pressable>
      </Animated.View>
    );

  const stageContent = (
    <View style={[styles.root, variant === 'center' ? styles.rootCenter : styles.rootSheet]}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={disableBackdropPress ? undefined : onClose}
      />
      {card}
    </View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={disableBackdropPress ? undefined : onClose}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {stageContent}
        </KeyboardAvoidingView>
      ) : (
        stageContent
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  rootSheet: {
    justifyContent: 'flex-end',
  },
  rootCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
  },
  sheetCard: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    maxHeight: '84%',
    width: '100%',
  },
  centerCard: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
  },
  innerPressable: {
    gap: Spacing.two + 4,
  },
});
