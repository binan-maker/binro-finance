import type Ionicons from '@expo/vector-icons/Ionicons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

const ICON_MAP: Record<string, IoniconName> = {
  utensils: 'restaurant-outline',
  car: 'car-outline',
  'shopping-bag': 'bag-handle-outline',
  film: 'film-outline',
  zap: 'flash-outline',
  'heart-pulse': 'heart-outline',
  'book-open': 'book-outline',
  plane: 'airplane-outline',
  home: 'home-outline',
  sparkles: 'sparkles-outline',
  tag: 'pricetag-outline',
  briefcase: 'briefcase-outline',
  building: 'business-outline',
  laptop: 'laptop-outline',
  gift: 'gift-outline',
  wallet: 'wallet-outline',
  coffee: 'cafe-outline',
  'shopping-cart': 'cart-outline',
  phone: 'call-outline',
  shield: 'shield-checkmark-outline',
};

export function resolveCategoryIconName(iconKey: string | null | undefined): IoniconName {
  if (!iconKey) {
    return 'pricetag-outline';
  }
  return ICON_MAP[iconKey] ?? 'pricetag-outline';
}
