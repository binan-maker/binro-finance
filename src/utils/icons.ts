import type Ionicons from '@expo/vector-icons/Ionicons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

const ICON_MAP: Record<string, IoniconName> = {
  utensils: 'restaurant',
  car: 'car',
  'shopping-bag': 'bag-handle',
  film: 'film',
  zap: 'flash',
  'heart-pulse': 'heart',
  'book-open': 'book',
  plane: 'airplane',
  home: 'home',
  sparkles: 'sparkles',
  tag: 'pricetag',
  briefcase: 'briefcase',
  building: 'business',
  laptop: 'laptop',
  gift: 'gift',
  wallet: 'wallet',
  coffee: 'cafe',
  'shopping-cart': 'cart',
  phone: 'call',
  shield: 'shield-checkmark',
  cash: 'cash',
  card: 'card',
  bank: 'business',
  'qr-code': 'qr-code',
};

export function resolveCategoryIconName(iconKey: string | null | undefined): IoniconName {
  if (!iconKey) {
    return 'pricetag';
  }
  return ICON_MAP[iconKey] ?? 'pricetag';
}
