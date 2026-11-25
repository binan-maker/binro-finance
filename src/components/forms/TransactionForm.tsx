import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppCard,
  AppInput,
  CategoryIcon,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { getCurrencyConfig, type CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type {
  Category,
  DateFormatPreference,
  PaymentMethodRecord,
  Tag,
  TransactionType,
} from '@/types/models';
import { getTodayISODate, isValidISODate } from '@/utils/date';
import { formatMinorToMajorInput, parseMajorToMinor } from '@/utils/money';
import { validateTransactionInput } from '@/utils/validation';

import { CategoryPickerModal } from './CategoryPickerModal';
import { CurrencyPickerModal } from './CurrencyPickerModal';
import { DatePickerField } from './DatePickerField';
import { PaymentMethodPickerModal } from './PaymentMethodPickerModal';
import { TagPickerModal } from './TagPickerModal';

export interface TransactionFormValues {
  type: TransactionType;
  title: string;
  amountMinor: number;
  currencyCode: string;
  categoryId: string;
  categoryNameSnapshot: string;
  paymentMethodId: string | null;
  paymentMethod: string;
  tagIds: string[];
  transactionDate: string;
  note: string | null;
}

interface TransactionFormProps {
  defaultCurrencyCode: string;
  dateFormat: DateFormatPreference;
  categories: readonly Category[];
  tags: readonly Tag[];
  paymentMethods: readonly PaymentMethodRecord[];
  currencies: readonly CurrencyConfig[];
  isEditing?: boolean;
  initialValues?: {
    type?: TransactionType;
    title?: string;
    amountMinor?: number;
    currencyCode?: string;
    categoryId?: string | null;
    paymentMethodId?: string | null;
    paymentMethod?: string;
    tagIds?: string[];
    transactionDate?: string;
    note?: string | null;
  };
  submitLabel: string;
  onCreateTag: (input: { name: string; color: string }) => Promise<Tag>;
  onCreatePaymentMethod: (input: { name: string; icon?: string }) => Promise<PaymentMethodRecord>;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel?: () => void;
}

export function TransactionForm({
  defaultCurrencyCode,
  dateFormat,
  categories,
  tags,
  paymentMethods,
  currencies,
  isEditing = false,
  initialValues,
  submitLabel,
  onCreateTag,
  onCreatePaymentMethod,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const theme = useTheme();
  const submittingRef = useRef(false);

  const initialCurrencyCode = initialValues?.currencyCode ?? defaultCurrencyCode;

  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode);
  const [amountText, setAmountText] = useState(
    initialValues?.amountMinor
      ? formatMinorToMajorInput(initialValues.amountMinor, initialCurrencyCode, currencies)
      : '',
  );
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    initialValues?.categoryId ?? null,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    initialValues?.tagIds ?? [],
  );

  const defaultPm =
    paymentMethods.find((pm) => !pm.isArchived && pm.name.toLowerCase() === 'upi') ??
    paymentMethods.find((pm) => !pm.isArchived);

  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    initialValues?.paymentMethodId !== undefined
      ? initialValues.paymentMethodId
      : (defaultPm?.id ?? null),
  );
  const [paymentMethodName, setPaymentMethodName] = useState<string>(
    initialValues?.paymentMethod ?? defaultPm?.name ?? 'Cash',
  );
  const [transactionDate, setTransactionDate] = useState(
    initialValues?.transactionDate && isValidISODate(initialValues.transactionDate)
      ? initialValues.transactionDate
      : getTodayISODate(),
  );
  const [note, setNote] = useState(initialValues?.note ?? '');

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [pmModalVisible, setPmModalVisible] = useState(false);

  const currency = useMemo(
    () => getCurrencyConfig(currencyCode, currencies),
    [currencyCode, currencies],
  );

  const typeOptions = useMemo<readonly SegmentOption<TransactionType>[]>(
    () => [
      {
        label: 'Expense',
        value: 'expense',
        activeColor: theme.expense,
        activeTextColor: '#FFFFFF',
      },
      {
        label: 'Income',
        value: 'income',
        activeColor: theme.income,
        activeTextColor: '#FFFFFF',
      },
    ],
    [theme.expense, theme.income],
  );

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (cat) =>
          cat.type === type &&
          (!cat.isArchived ||
            cat.id === categoryId ||
            cat.id === initialValues?.categoryId),
      ),
    [categories, type, categoryId, initialValues?.categoryId],
  );

  const effectiveCategory = useMemo(
    () =>
      visibleCategories.find((c) => c.id === categoryId) ??
      visibleCategories[0] ??
      null,
    [visibleCategories, categoryId],
  );

  const selectedTags = useMemo(
    () => tags.filter((t) => selectedTagIds.includes(t.id)),
    [tags, selectedTagIds],
  );

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    const firstForType = categories.find(
      (c) => c.type === nextType && !c.isArchived,
    );
    setCategoryId(firstForType?.id ?? null);
    setStepError(null);
  };

  const handleNext = () => {
    setStepError(null);
    const parsedMinor = parseMajorToMinor(amountText, currencyCode, currencies);
    if (parsedMinor === null || parsedMinor <= 0) {
      setStepError(`Enter a valid positive amount in ${currency.code}.`);
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setStepError(null);

    const validation = validateTransactionInput({
      type,
      title,
      rawAmount: amountText,
      currencyCode,
      categoryId: effectiveCategory?.id ?? null,
      transactionDate,
      paymentMethod: paymentMethodName,
      catalog: currencies,
    });

    if (!validation.valid || !validation.value) {
      setStepError(validation.error ?? 'Please check all required fields.');
      return;
    }

    if (!effectiveCategory) {
      setStepError('Please select a category.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: validation.value.title,
        amountMinor: validation.value.amountMinor,
        currencyCode: currency.code,
        categoryId: effectiveCategory.id,
        categoryNameSnapshot: effectiveCategory.name,
        paymentMethodId,
        paymentMethod: paymentMethodName,
        tagIds: selectedTagIds,
        transactionDate,
        note: note.trim() || null,
      });
    } catch (error) {
      setStepError(
        error instanceof Error ? error.message : 'Could not save transaction.',
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const activeAccent = type === 'income' ? theme.income : theme.expense;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      {step === 1 ? (
        <View style={styles.stepOneContainer}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.stepOneScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <SegmentedControl
              options={typeOptions}
              value={type}
              onChange={handleTypeChange}
            />

            <View style={styles.amountCenter}>
              <Pressable
                onPress={() => {
                  if (!isEditing) setCurrencyModalVisible(true);
                }}
                disabled={isEditing}
                accessibilityRole="button"
                style={[
                  styles.currencyBadge,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}>
                <Text style={[styles.currencyBadgeText, { color: theme.text }]}>
                  {currency.code} ({currency.symbol})
                </Text>
                {!isEditing ? (
                  <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
                ) : (
                  <Ionicons name="lock-closed" size={13} color={theme.textMuted} />
                )}
              </Pressable>

              <View style={styles.amountInputRow}>
                <Text style={[styles.currencySymbolBig, { color: activeAccent }]}>
                  {currency.symbol}
                </Text>
                <TextInput
                  value={amountText}
                  onChangeText={(text) => {
                    setAmountText(text);
                    if (stepError) setStepError(null);
                  }}
                  placeholder={currency.minorUnits === 0 ? '0' : '0.00'}
                  placeholderTextColor={theme.textMuted}
                  keyboardType={
                    currency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'
                  }
                  autoFocus
                  style={[styles.amountInputBig, { color: theme.text }]}
                  maxLength={14}
                />
              </View>

              <Text style={[styles.amountHint, { color: theme.textMuted }]}>
                {isEditing
                  ? 'Currency is locked to protect historical record accuracy.'
                  : `Enter ${type} amount in ${currency.name}`}
              </Text>

              {stepError ? (
                <Text style={[styles.errorText, { color: theme.danger }]}>
                  {stepError}
                </Text>
              ) : null}
            </View>
          </ScrollView>

          <View
            style={[
              styles.footerBar,
              { backgroundColor: theme.background, borderTopColor: theme.border },
            ]}>
            {onCancel ? (
              <View style={styles.footerSmallBtn}>
                <AppButton label="Cancel" variant="outline" onPress={onCancel} fullWidth />
              </View>
            ) : null}
            <View style={styles.footerPrimaryBtn}>
              <AppButton
                label="Next"
                onPress={handleNext}
                style={{ backgroundColor: activeAccent, borderColor: activeAccent }}
                fullWidth
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.stepTwoContainer}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.stepTwoScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* Summary banner for Step 1 */}
            <Pressable
              onPress={() => setStep(1)}
              style={[
                styles.amountSummaryBanner,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  {type === 'income' ? 'Income Amount' : 'Expense Amount'}
                </Text>
                <Text style={[styles.summaryValue, { color: activeAccent }]}>
                  {currency.symbol} {amountText} {currency.code}
                </Text>
              </View>
              <View
                style={[
                  styles.editAmountPill,
                  { backgroundColor: theme.surfaceElevated },
                ]}>
                <Ionicons name="pencil" size={14} color={theme.primary} />
                <Text style={[styles.editAmountText, { color: theme.primary }]}>
                  Edit
                </Text>
              </View>
            </Pressable>

            <AppCard>
              <AppInput
                label="Title"
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  if (stepError) setStepError(null);
                }}
                placeholder={
                  type === 'expense'
                    ? 'e.g. Morning Coffee, Groceries'
                    : 'e.g. Monthly Salary, Client Invoice'
                }
                maxLength={100}
              />

              <DatePickerField
                label="Date"
                value={transactionDate}
                dateFormat={dateFormat}
                onChange={setTransactionDate}
              />

              {/* Category selector */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Category</Text>
                <Pressable
                  onPress={() => setCategoryModalVisible(true)}
                  accessibilityRole="button"
                  style={[
                    styles.selectorButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  {effectiveCategory ? (
                    <View style={styles.selectorLeft}>
                      <CategoryIcon
                        icon={effectiveCategory.icon}
                        color={effectiveCategory.color}
                        size={30}
                      />
                      <Text style={[styles.selectorValue, { color: theme.text }]}>
                        {effectiveCategory.name}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.selectorPlaceholder, { color: theme.textMuted }]}>
                      Select category
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              {/* Tags multi-select */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Tags (Optional)
                </Text>
                <Pressable
                  onPress={() => setTagModalVisible(true)}
                  accessibilityRole="button"
                  style={[
                    styles.selectorButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  {selectedTags.length > 0 ? (
                    <View style={styles.tagsWrap}>
                      {selectedTags.map((tag) => (
                        <View
                          key={tag.id}
                          style={[
                            styles.tagChip,
                            {
                              backgroundColor: `${tag.color}20`,
                              borderColor: tag.color,
                            },
                          ]}>
                          <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                          <Text style={[styles.tagChipText, { color: theme.text }]}>
                            {tag.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.selectorPlaceholder, { color: theme.textMuted }]}>
                      Add optional tags...
                    </Text>
                  )}
                  <Ionicons name="pricetags-outline" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              {/* Currency selector */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Currency</Text>
                <Pressable
                  onPress={() => {
                    if (!isEditing) setCurrencyModalVisible(true);
                  }}
                  disabled={isEditing}
                  accessibilityRole="button"
                  style={[
                    styles.selectorButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <View style={styles.selectorLeft}>
                    <Text style={[styles.selectorValue, { color: theme.text }]}>
                      {currency.code} · {currency.name} ({currency.symbol})
                    </Text>
                  </View>
                  {isEditing ? (
                    <Ionicons name="lock-closed" size={16} color={theme.textMuted} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  )}
                </Pressable>
              </View>

              {/* Payment method selector */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Payment Method
                </Text>
                <Pressable
                  onPress={() => setPmModalVisible(true)}
                  accessibilityRole="button"
                  style={[
                    styles.selectorButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <Text style={[styles.selectorValue, { color: theme.text }]}>
                    {paymentMethodName}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </Pressable>
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

            {stepError ? (
              <Text style={[styles.errorText, { color: theme.danger }]}>
                {stepError}
              </Text>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.footerBar,
              { backgroundColor: theme.background, borderTopColor: theme.border },
            ]}>
            <View style={styles.footerSmallBtn}>
              <AppButton
                label="Back"
                variant="outline"
                onPress={() => {
                  setStepError(null);
                  setStep(1);
                }}
                disabled={submitting}
                fullWidth
              />
            </View>
            <View style={styles.footerPrimaryBtn}>
              <AppButton
                label={submitLabel}
                onPress={() => void handleSubmit()}
                loading={submitting}
                fullWidth
              />
            </View>
          </View>
        </View>
      )}

      <CategoryPickerModal
        visible={categoryModalVisible}
        type={type}
        categories={categories}
        selectedId={effectiveCategory?.id ?? null}
        onSelect={(cat) => setCategoryId(cat.id)}
        onClose={() => setCategoryModalVisible(false)}
      />

      <CurrencyPickerModal
        visible={currencyModalVisible}
        currencies={currencies}
        selectedCode={currencyCode}
        onSelect={(curr) => {
          setCurrencyCode(curr.code);
          if (stepError) setStepError(null);
        }}
        onClose={() => setCurrencyModalVisible(false)}
      />

      <TagPickerModal
        visible={tagModalVisible}
        tags={tags}
        selectedIds={selectedTagIds}
        onChange={setSelectedTagIds}
        onCreateTag={onCreateTag}
        onClose={() => setTagModalVisible(false)}
      />

      <PaymentMethodPickerModal
        visible={pmModalVisible}
        paymentMethods={paymentMethods}
        selectedId={paymentMethodId}
        selectedName={paymentMethodName}
        onSelect={(pm) => {
          setPaymentMethodId(pm.id);
          setPaymentMethodName(pm.name);
        }}
        onCreateMethod={onCreatePaymentMethod}
        onClose={() => setPmModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stepOneContainer: {
    flex: 1,
  },
  stepOneScroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  amountCenter: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  currencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  currencyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    maxWidth: '92%',
  },
  currencySymbolBig: {
    fontSize: 34,
    fontWeight: '700',
  },
  amountInputBig: {
    fontSize: 44,
    fontWeight: '800',
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: Spacing.one,
  },
  amountHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  stepTwoContainer: {
    flex: 1,
  },
  stepTwoScroll: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  amountSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  editAmountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
  },
  editAmountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectorField: {
    gap: Spacing.one + 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectorButton: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  selectorValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  selectorPlaceholder: {
    fontSize: 15,
    flex: 1,
  },
  tagsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerBar: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderTopWidth: 1,
  },
  footerSmallBtn: {
    flex: 1,
  },
  footerPrimaryBtn: {
    flex: 2,
  },
});
