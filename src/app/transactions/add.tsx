import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppHeader, AppScreen } from '@/components/common';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/forms/TransactionForm';
import { useAppStore } from '@/store/app-store';
import type { TransactionType } from '@/types/models';
import { isValidISODate } from '@/utils/date';

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; date?: string }>();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const createTransaction = useAppStore((s) => s.createTransaction);

  const initialType: TransactionType =
    params.type === 'income' || params.type === 'expense' ? params.type : 'expense';
  const initialDate =
    typeof params.date === 'string' && isValidISODate(params.date)
      ? params.date
      : undefined;

  const handleSubmit = async (values: TransactionFormValues) => {
    await createTransaction(values);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <AppScreen keyboardAvoiding>
      <AppHeader
        title="Add Transaction"
        subtitle="Record income or expense locally"
        showBack
      />
      <TransactionForm
        currencyCode={settings.currencyCode}
        dateFormat={settings.dateFormat}
        categories={categories}
        initialValues={{
          type: initialType,
          transactionDate: initialDate,
        }}
        submitLabel="Save Transaction"
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </AppScreen>
  );
}
