import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface AppInputProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string | null;
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function AppInput({
  label,
  helperText,
  error,
  prefix,
  containerStyle,
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: AppInputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? theme.danger
    : isFocused
      ? theme.primary
      : theme.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          multiline && styles.multilineWrapper,
          {
            backgroundColor: theme.surface,
            borderColor,
          },
        ]}>
        {prefix ? (
          <Text style={[styles.prefix, { color: theme.textSecondary }]}>{prefix}</Text>
        ) : null}

        <TextInput
          placeholderTextColor={theme.textMuted}
          multiline={multiline}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && styles.multilineInput,
            { color: theme.text },
            style,
          ]}
          {...rest}
        />
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.helperText, { color: theme.textMuted }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  multilineWrapper: {
    minHeight: 92,
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
  },
  prefix: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
