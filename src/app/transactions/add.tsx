import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/common';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/forms/TransactionForm';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { TransactionType } from '@/types/models';
import { isValidISODate } from '@/utils/date';

export default function AddTransactionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; date?: string }>();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const currencies = useAppStore((s) => s.currencies);
  const createTransaction = useAppStore((s) => s.createTransaction);
  const createTag = useAppStore((s) => s.createTag);
  const createPaymentMethod = useAppStore((s) => s.createPaymentMethod);

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
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.headerWrap}>
        <AppHeader title="New Transaction" showBack />
      </View>

      <TransactionForm
        defaultCurrencyCode={settings.currencyCode}
        dateFormat={settings.dateFormat}
        categories={categories}
        tags={tags}
        paymentMethods={paymentMethods}
        currencies={currencies}
        initialValues={{
          type: initialType,
          transactionDate: initialDate,
        }}
        submitLabel="Save Transaction"
        onCreateTag={createTag}
        onCreatePaymentMethod={createPaymentMethod}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
