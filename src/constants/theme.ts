import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F1412',
    textSecondary: '#5B6560',
    textMuted: '#84908A',
    background: '#F5F7F6',
    surface: '#FFFFFF',
    surfaceElevated: '#EAEFED',
    backgroundElement: '#EAEFED',
    backgroundSelected: '#DCE5E0',
    border: '#DFE6E2',
    primary: '#059669',
    primaryBright: '#10B981',
    primarySoft: '#D1FAE5',
    primaryText: '#FFFFFF',
    income: '#15803D',
    incomeSoft: '#DCFCE7',
    expense: '#DC2626',
    expenseSoft: '#FEE2E2',
    warning: '#B45309',
    warningSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    tabBar: '#FFFFFF',
    shadow: '#000000',
  },
  dark: {
    text: '#F4F7F5',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    background: '#07090A',
    surface: '#111416',
    surfaceElevated: '#1A1F22',
    backgroundElement: '#1A1F22',
    backgroundSelected: '#262D31',
    border: '#22282C',
    primary: '#16C784',
    primaryBright: '#10B981',
    primarySoft: '#0D2B20',
    primaryText: '#04140D',
    income: '#16C784',
    incomeSoft: '#0C291E',
    expense: '#EF4444',
    expenseSoft: '#2C1215',
    warning: '#F59E0B',
    warningSoft: '#2A1F0A',
    danger: '#EF4444',
    dangerSoft: '#2C1215',
    tabBar: '#0D1012',
    shadow: '#000000',
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
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 88, android: 86 }) ?? 86;
export const MaxContentWidth = 800;
