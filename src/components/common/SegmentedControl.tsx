import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
  activeColor?: string;
  activeTextColor?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  pill?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  pill = true,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderRadius: pill ? Radius.full : Radius.md,
        },
      ]}>
      {options.map((option) => {
        const selected = option.value === value;
        const activeBg = option.activeColor ?? theme.primary;
        const activeText = option.activeTextColor ?? '#FFFFFF';

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.option,
              {
                borderRadius: pill ? Radius.full : Radius.sm,
              },
              selected && {
                backgroundColor: activeBg,
              },
            ]}>
            <Text
              style={[
                styles.label,
                {
                  color: selected ? activeText : theme.textSecondary,
                  fontWeight: selected ? '700' : '500',
                },
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  option: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  label: {
    fontSize: 13,
  },
});
