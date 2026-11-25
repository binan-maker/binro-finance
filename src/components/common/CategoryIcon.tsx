import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { resolveCategoryIconName } from '@/utils/icons';

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: number;
  rounded?: boolean;
}

export function CategoryIcon({
  icon,
  color,
  size = 40,
  rounded = true,
}: CategoryIconProps) {
  const accent = color || '#059669';
  const glyph = resolveCategoryIconName(icon);

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: rounded ? Math.round(size / 2) : Math.round(size / 3),
          backgroundColor: accent,
        },
      ]}>
      <Ionicons name={glyph} size={Math.round(size * 0.48)} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
