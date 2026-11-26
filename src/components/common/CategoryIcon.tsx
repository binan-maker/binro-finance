import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { resolveLocalImageUri } from '@/services/images/localImageStorage';
import { resolveCategoryIconName } from '@/utils/icons';

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string | null | undefined;
  imageUri?: string | null;
  size?: number;
  rounded?: boolean;
}

export function CategoryIcon({
  icon,
  color,
  imageUri,
  size = 40,
  rounded = true,
}: CategoryIconProps) {
  const accent = color || '#059669';
  const glyph = resolveCategoryIconName(icon);
  const resolvedImageUri = resolveLocalImageUri(imageUri);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const borderRadius = rounded ? Math.round(size / 2) : Math.round(size / 3);

  if (resolvedImageUri && failedUri !== resolvedImageUri) {
    return (
      <View
        style={[
          styles.badge,
          styles.imageWrap,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: accent,
          },
        ]}>
        <Image
          source={{ uri: resolvedImageUri }}
          contentFit="cover"
          onError={() => setFailedUri(resolvedImageUri)}
          style={{ width: size, height: size, borderRadius }}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius,
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
  imageWrap: {
    overflow: 'hidden',
  },
});
