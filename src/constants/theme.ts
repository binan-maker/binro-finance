import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#6B7280',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    backgroundElement: '#F1F5F9',
    backgroundSelected: '#E2E8F0',
    border: '#E2E8F0',
    primary: '#0F766E',
    primarySoft: '#CCFBF1',
    primaryText: '#FFFFFF',
    income: '#15803D',
    incomeSoft: '#DCFCE7',
    expense: '#B91C1C',
    expenseSoft: '#FEE2E2',
    warning: '#B45309',
    warningSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    background: '#0B1120',
    surface: '#111827',
    surfaceElevated: '#1E293B',
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',
    border: '#273549',
    primary: '#14B8A6',
    primarySoft: '#134E4A',
    primaryText: '#042F2E',
    income: '#4ADE80',
    incomeSoft: '#14532D',
    expense: '#F87171',
    expenseSoft: '#7F1D1D',
    warning: '#FBBF24',
    warningSoft: '#78350F',
    danger: '#EF4444',
    dangerSoft: '#7F1D1D',
  },
} as const;

export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 72 }) ?? 0;
export const MaxContentWidth = 800;
