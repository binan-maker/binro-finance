import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { computeModalCardMaxHeight } from '@/utils/modalPickerLayout';

export { computeModalCardMaxHeight };

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
  const { height: windowHeight } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  if (visible && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    if (!keyboardAvoiding || !rendered) {
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const subHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [keyboardAvoiding, rendered]);

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
        setKeyboardHeight(0);
        setRendered(false);
      }
    });
  }, [visible, progress]);

  if (!rendered) {
    return null;
  }

  const topReserve = Math.max(insets.top + Spacing.three, Spacing.four);
  const cardMaxHeight = computeModalCardMaxHeight({
    windowHeight,
    topInset: insets.top,
    keyboardHeight: keyboardAvoiding && rendered ? keyboardHeight : 0,
    variant,
  });

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
        pointerEvents="auto"
        style={[
          styles.centerCard,
          {
            maxWidth,
            maxHeight: cardMaxHeight,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: progress,
            transform: [{ scale: centerScale }],
          },
          containerStyle,
        ]}>
        <View style={styles.innerContent}>{children}</View>
      </Animated.View>
    ) : (
      <Animated.View
        pointerEvents="auto"
        style={[
          styles.sheetCard,
          {
            maxHeight: cardMaxHeight,
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: Math.max(insets.bottom + Spacing.three, Spacing.four),
            opacity: progress,
            transform: [{ translateY: sheetTranslateY }],
          },
          containerStyle,
        ]}>
        <View style={styles.innerContent}>{children}</View>
      </Animated.View>
    );

  const stageContent = (
    <View
      style={[
        styles.root,
        { paddingTop: topReserve },
        variant === 'center' ? styles.rootCenter : styles.rootSheet,
      ]}>
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
    width: '100%',
    flexShrink: 1,
    overflow: 'hidden',
  },
  centerCard: {
    width: '100%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    flexShrink: 1,
    overflow: 'hidden',
  },
  innerContent: {
    gap: Spacing.two + 4,
    width: '100%',
    flexShrink: 1,
    maxHeight: '100%',
  },
});
