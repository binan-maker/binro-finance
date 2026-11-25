import type { CategoryType, PaymentMethod } from '@/types/models';

export interface DefaultCategorySeed {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'Cash',
  'UPI',
  'Card',
  'Bank transfer',
  'Other',
] as const;

export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultCategorySeed[] = [
  { id: 'cat-exp-food', name: 'Food and Dining', type: 'expense', icon: 'utensils', color: '#E65100' },
  { id: 'cat-exp-transport', name: 'Transportation', type: 'expense', icon: 'car', color: '#1565C0' },
  { id: 'cat-exp-shopping', name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#AD1457' },
  { id: 'cat-exp-entertainment', name: 'Entertainment', type: 'expense', icon: 'film', color: '#6A1B9A' },
  { id: 'cat-exp-bills', name: 'Bills and Utilities', type: 'expense', icon: 'zap', color: '#00838F' },
  { id: 'cat-exp-health', name: 'Health', type: 'expense', icon: 'heart-pulse', color: '#C62828' },
  { id: 'cat-exp-education', name: 'Education', type: 'expense', icon: 'book-open', color: '#283593' },
  { id: 'cat-exp-travel', name: 'Travel', type: 'expense', icon: 'plane', color: '#0277BD' },
  { id: 'cat-exp-rent', name: 'Rent', type: 'expense', icon: 'home', color: '#4E342E' },
  { id: 'cat-exp-personal', name: 'Personal Care', type: 'expense', icon: 'sparkles', color: '#8E24AA' },
  { id: 'cat-exp-other', name: 'Other', type: 'expense', icon: 'tag', color: '#546E7A' },
] as const;

export const DEFAULT_INCOME_CATEGORIES: readonly DefaultCategorySeed[] = [
  { id: 'cat-inc-salary', name: 'Salary', type: 'income', icon: 'briefcase', color: '#2E7D32' },
  { id: 'cat-inc-business', name: 'Business', type: 'income', icon: 'building', color: '#00695C' },
  { id: 'cat-inc-freelance', name: 'Freelance', type: 'income', icon: 'laptop', color: '#1976D2' },
  { id: 'cat-inc-gifts', name: 'Gifts', type: 'income', icon: 'gift', color: '#D81B60' },
  { id: 'cat-inc-other', name: 'Other Income', type: 'income', icon: 'wallet', color: '#558B2F' },
] as const;

export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

export const CATEGORY_ICON_OPTIONS: readonly string[] = [
  'utensils',
  'car',
  'shopping-bag',
  'film',
  'zap',
  'heart-pulse',
  'book-open',
  'plane',
  'home',
  'sparkles',
  'tag',
  'briefcase',
  'building',
  'laptop',
  'gift',
  'wallet',
  'coffee',
  'shopping-cart',
  'phone',
  'shield',
] as const;

export const CATEGORY_COLOR_OPTIONS: readonly string[] = [
  '#E65100',
  '#1565C0',
  '#AD1457',
  '#6A1B9A',
  '#00838F',
  '#C62828',
  '#283593',
  '#0277BD',
  '#4E342E',
  '#8E24AA',
  '#2E7D32',
  '#00695C',
  '#546E7A',
  '#D81B60',
  '#558B2F',
  '#EF6C00',
] as const;
