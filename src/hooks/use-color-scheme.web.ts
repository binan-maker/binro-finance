import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * Hydration-safe color scheme hook for web static rendering without triggering
 * synchronous setState inside useEffect.
 */
export function useColorScheme() {
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return isHydrated ? colorScheme : 'light';
}
