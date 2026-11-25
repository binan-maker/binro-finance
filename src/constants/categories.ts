import type { CategoryType } from '@/types/models';

export interface DefaultCategorySeed {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export interface DefaultPaymentMethodSeed {
  id: string;
  name: string;
  icon: string;
}

export const DEFAULT_PAYMENT_METHODS: readonly DefaultPaymentMethodSeed[] = [
  { id: 'pm-cash', name: 'Cash', icon: 'cash' },
  { id: 'pm-upi', name: 'UPI', icon: 'qr-code' },
  { id: 'pm-card', name: 'Card', icon: 'card' },
  { id: 'pm-bank', name: 'Bank Transfer', icon: 'bank' },
] as const;

// Preserved for legacy test/helper references
export const PAYMENT_METHODS: readonly string[] = [
  'Cash',
  'UPI',
  'Card',
  'Bank Transfer',
  'Bank transfer',
  'Other',
] as const;

export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultCategorySeed[] = [
  { id: 'cat-exp-food', name: 'Food & Drink', type: 'expense', icon: 'utensils', color: '#059669' },
  { id: 'cat-exp-shopping', name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#0D9488' },
  { id: 'cat-exp-transport', name: 'Transport', type: 'expense', icon: 'car', color: '#10B981' },
  { id: 'cat-exp-health', name: 'Health', type: 'expense', icon: 'heart-pulse', color: '#047857' },
  { id: 'cat-exp-travel', name: 'Travel', type: 'expense', icon: 'plane', color: '#0891B2' },
  { id: 'cat-exp-bills', name: 'Utilities', type: 'expense', icon: 'zap', color: '#14B8A6' },
  { id: 'cat-exp-rent', name: 'Rent', type: 'expense', icon: 'home', color: '#065F46' },
  { id: 'cat-exp-education', name: 'Education', type: 'expense', icon: 'book-open', color: '#4F46E5' },
  { id: 'cat-exp-entertainment', name: 'Entertainment', type: 'expense', icon: 'film', color: '#7C3AED' },
  { id: 'cat-exp-other', name: 'Other', type: 'expense', icon: 'tag', color: '#475569' },
] as const;

export const DEFAULT_INCOME_CATEGORIES: readonly DefaultCategorySeed[] = [
  { id: 'cat-inc-salary', name: 'Salary', type: 'income', icon: 'briefcase', color: '#059669' },
  { id: 'cat-inc-business', name: 'Business', type: 'income', icon: 'building', color: '#0D9488' },
  { id: 'cat-inc-freelance', name: 'Freelance', type: 'income', icon: 'laptop', color: '#10B981' },
  { id: 'cat-inc-other', name: 'Other', type: 'income', icon: 'wallet', color: '#475569' },
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
  'cash',
  'card',
  'bank',
  'qr-code',
] as const;

// Coordinated green-led brand palette with distinguishable accent tones
export const CATEGORY_COLOR_OPTIONS: readonly string[] = [
  '#059669',
  '#10B981',
  '#047857',
  '#065F46',
  '#0D9488',
  '#14B8A6',
  '#0891B2',
  '#15803D',
  '#65A30D',
  '#D97706',
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#475569',
  '#334155',
] as const;

export const TAG_COLOR_OPTIONS: readonly string[] = [
  '#10B981',
  '#0D9488',
  '#0891B2',
  '#65A30D',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#475569',
] as const;
