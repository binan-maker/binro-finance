import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface AppScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

export function AppScreen({
  children,
  scrollable = true,
  keyboardAvoiding = false,
  edges = ['top', 'left', 'right'],
  contentStyle,
  style,
  footer,
}: AppScreenProps) {
  const theme = useTheme();

  const body = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        footer ? styles.scrollContentWithFooter : null,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}>
      <View style={styles.innerWidth}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.staticContent, contentStyle]}>
      <View style={[styles.innerWidth, styles.flex]}>{children}</View>
    </View>
  );

  const innerContent = (
    <>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderTopColor: theme.border },
          ]}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </>
  );

  const wrappedBody = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      {innerContent}
    </KeyboardAvoidingView>
  ) : (
    innerContent
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, { backgroundColor: theme.background }, style]}>
      {wrappedBody}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    alignItems: 'center',
  },
  scrollContentWithFooter: {
    paddingBottom: Spacing.four,
  },
  staticContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    alignItems: 'center',
  },
  innerWidth: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
});
