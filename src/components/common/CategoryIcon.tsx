import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { resolveCategoryIconName } from '@/utils/icons';

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: number;
}

export function CategoryIcon({ icon, color, size = 38 }: CategoryIconProps) {
  const accent = color || '#546E7A';
  const glyph = resolveCategoryIconName(icon);

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 2.6),
          backgroundColor: `${accent}20`,
        },
      ]}>
      <Ionicons name={glyph} size={Math.round(size * 0.5)} color={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
