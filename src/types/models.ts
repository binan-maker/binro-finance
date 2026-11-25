export type TransactionType = 'income' | 'expense';

export type CategoryType = 'income' | 'expense';

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank transfer' | 'Other';

export type ThemePreference = 'system' | 'light' | 'dark';

export type DateFormatPreference =
  | 'YYYY-MM-DD'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD MMM YYYY';

export type BudgetPeriod = 'monthly';

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amountMinor: number;
  categoryId: string | null;
  categoryNameSnapshot: string;
  paymentMethod: PaymentMethod;
  transactionDate: string; // YYYY-MM-DD
  note: string | null;
  createdAt: string; // ISO-8601 UTC timestamp
  updatedAt: string; // ISO-8601 UTC timestamp
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  amountMinor: number;
  period: BudgetPeriod;
  month: number; // 1-12
  year: number;
  categoryId: string | null; // null = monthly overall budget
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: number;
  currencyCode: string;
  openingBalanceMinor: number;
  theme: ThemePreference;
  dateFormat: DateFormatPreference;
  onboardingCompleted: boolean;
}
