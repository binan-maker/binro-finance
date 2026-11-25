import { Colors, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/store/app-store';

export function useResolvedColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const themePreference = useAppStore((state) => state.settings.theme);

  if (themePreference === 'light' || themePreference === 'dark') {
    return themePreference;
  }

  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function useTheme(): ThemeColors {
  const resolved = useResolvedColorScheme();
  return Colors[resolved];
}
