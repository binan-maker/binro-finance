import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppInput,
  CategoryIcon,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { PAYMENT_METHODS } from '@/constants/categories';
import { getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type {
  Category,
  DateFormatPreference,
  PaymentMethod,
  TransactionType,
} from '@/types/models';
import { getTodayISODate, isValidISODate } from '@/utils/date';
import { formatMinorToMajorInput } from '@/utils/money';
import { validateTransactionInput } from '@/utils/validation';

import { DatePickerField } from './DatePickerField';

const TYPE_OPTIONS: readonly SegmentOption<TransactionType>[] = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
];

export interface TransactionFormValues {
  type: TransactionType;
  title: string;
  amountMinor: number;
  categoryId: string;
  categoryNameSnapshot: string;
  paymentMethod: PaymentMethod;
  transactionDate: string;
  note: string | null;
}

interface TransactionFormProps {
  currencyCode: string;
  dateFormat: DateFormatPreference;
  categories: readonly Category[];
  initialValues?: {
    type?: TransactionType;
    title?: string;
    amountMinor?: number;
    categoryId?: string | null;
    paymentMethod?: PaymentMethod;
    transactionDate?: string;
    note?: string | null;
  };
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel?: () => void;
}

export function TransactionForm({
  currencyCode,
  dateFormat,
  categories,
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const theme = useTheme();
  const currency = getCurrencyConfig(currencyCode);
  const submittingRef = useRef(false);

  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initialValues?.amountMinor
      ? formatMinorToMajorInput(initialValues.amountMinor, currencyCode)
      : '',
  );
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    initialValues?.categoryId ?? null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialValues?.paymentMethod ?? 'UPI',
  );
  const [transactionDate, setTransactionDate] = useState(
    initialValues?.transactionDate && isValidISODate(initialValues.transactionDate)
      ? initialValues.transactionDate
      : getTodayISODate(),
  );
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (cat) => cat.type === type && (!cat.isArchived || cat.id === categoryId),
      ),
    [categories, type, categoryId],
  );

  const effectiveCategoryId = visibleCategories.some((c) => c.id === categoryId)
    ? categoryId
    : (visibleCategories[0]?.id ?? null);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    const firstForType = categories.find(
      (c) => c.type === nextType && !c.isArchived,
    );
    setCategoryId(firstForType?.id ?? null);
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setFormError(null);

    const validation = validateTransactionInput({
      type,
      title,
      rawAmount: amountText,
      currencyCode,
      categoryId: effectiveCategoryId,
      transactionDate,
      paymentMethod,
    });

    if (!validation.valid || !validation.value) {
      setFormError(validation.error ?? 'Please check the entered fields.');
      return;
    }

    const selectedCategory = visibleCategories.find(
      (c) => c.id === effectiveCategoryId,
    );
    if (!selectedCategory) {
      setFormError('Please select a valid category.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: validation.value.title,
        amountMinor: validation.value.amountMinor,
        categoryId: selectedCategory.id,
        categoryNameSnapshot: selectedCategory.name,
        paymentMethod,
        transactionDate,
        note: note.trim() || null,
      });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not save transaction.',
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <AppCard>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Transaction Type</Text>
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={type}
          onChange={handleTypeChange}
        />

        <AppInput
          label="Amount"
          prefix={currency.symbol}
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text);
            if (formError) setFormError(null);
          }}
          keyboardType={currency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'}
          placeholder={currency.minorUnits === 0 ? '0' : '0.00'}
        />

        <AppInput
          label="Title"
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (formError) setFormError(null);
          }}
          placeholder={type === 'expense' ? 'e.g. Groceries, Rent, Coffee' : 'e.g. Monthly Salary'}
          maxLength={100}
        />

        <DatePickerField
          label="Date"
          value={transactionDate}
          dateFormat={dateFormat}
          onChange={setTransactionDate}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Category</Text>
        {visibleCategories.length === 0 ? (
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
            No active {type} categories available. Please add or restore a category first.
          </Text>
        ) : (
          <View style={styles.categoryGrid}>
            {visibleCategories.map((cat) => {
              const selected = cat.id === effectiveCategoryId;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selected
                        ? theme.primarySoft
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={28} />
                  <Text
                    style={[
                      styles.categoryName,
                      {
                        color: selected ? theme.primary : theme.text,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                    numberOfLines={1}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </AppCard>

      <AppCard>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Payment Method</Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((method) => {
            const selected = method === paymentMethod;
            return (
              <Pressable
                key={method}
                onPress={() => setPaymentMethod(method)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.paymentChip,
                  {
                    backgroundColor: selected
                      ? theme.primarySoft
                      : theme.surfaceElevated,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.paymentText,
                    {
                      color: selected ? theme.primary : theme.text,
                      fontWeight: selected ? '700' : '500',
                    },
                  ]}>
                  {method}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AppInput
          label="Note (Optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Add any extra details..."
          multiline
          maxLength={300}
        />
      </AppCard>

      {formError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{formError}</Text>
      ) : null}

      <View style={styles.actions}>
        {onCancel ? (
          <View style={styles.flex1}>
            <AppButton
              label="Cancel"
              variant="outline"
              onPress={onCancel}
              disabled={submitting}
              fullWidth
            />
          </View>
        ) : null}
        <View style={styles.flex1}>
          <AppButton
            label={submitLabel}
            onPress={() => void handleSubmit()}
            loading={submitting}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.three,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    minWidth: '47%',
    flexGrow: 1,
    maxWidth: '49%',
  },
  categoryName: {
    flex: 1,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  paymentChip: {
    paddingVertical: Spacing.one + 3,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  paymentText: {
    fontSize: 13,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
