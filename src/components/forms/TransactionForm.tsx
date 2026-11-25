import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
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
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { getCurrencyConfig, type CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type TransactionDraft, useAppStore } from '@/store/app-store';
import type {
  Category,
  DateFormatPreference,
  PaymentMethodRecord,
  Tag,
  TransactionType,
} from '@/types/models';
import { getTodayISODate, isValidISODate } from '@/utils/date';
import { formatMinorToMajorInput, parseMajorToMinor } from '@/utils/money';
import { validateTagName, validateTransactionInput } from '@/utils/validation';

import { CategoryPickerModal } from './CategoryPickerModal';
import { DatePickerField } from './DatePickerField';

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
  transactionId?: string;
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
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel?: () => void;
}

export function TransactionForm({
  transactionId,
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
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const theme = useTheme();
  const router = useRouter();
  const submittingRef = useRef(false);

  const transactionDraft = useAppStore((s) => s.transactionDraft);
  const setTransactionDraft = useAppStore((s) => s.setTransactionDraft);
  const patchTransactionDraft = useAppStore((s) => s.patchTransactionDraft);

  const activeDraft =
    transactionDraft &&
    ((!isEditing && transactionDraft.mode === 'create') ||
      (isEditing &&
        transactionDraft.mode === 'edit' &&
        transactionDraft.transactionId === transactionId))
      ? transactionDraft
      : null;

  const initialCurrencyCode =
    activeDraft?.currencyCode ?? initialValues?.currencyCode ?? defaultCurrencyCode;

  const [step, setStep] = useState<1 | 2>(activeDraft?.step ?? 1);
  const [type, setType] = useState<TransactionType>(
    activeDraft?.type ?? initialValues?.type ?? 'expense',
  );
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode);
  const [amountText, setAmountText] = useState(
    activeDraft?.amountText ??
      (initialValues?.amountMinor
        ? formatMinorToMajorInput(initialValues.amountMinor, initialCurrencyCode, currencies)
        : ''),
  );
  const [title, setTitle] = useState(activeDraft?.title ?? initialValues?.title ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    activeDraft?.categoryId ?? initialValues?.categoryId ?? null,
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    activeDraft?.tagIds ?? initialValues?.tagIds ?? [],
  );

  const defaultPm =
    paymentMethods.find((pm) => !pm.isArchived && pm.name.toLowerCase() === 'upi') ??
    paymentMethods.find((pm) => !pm.isArchived);

  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    activeDraft
      ? activeDraft.paymentMethodId
      : initialValues?.paymentMethodId !== undefined
        ? initialValues.paymentMethodId
        : (defaultPm?.id ?? null),
  );
  const [paymentMethodName, setPaymentMethodName] = useState<string>(
    activeDraft?.paymentMethod ?? initialValues?.paymentMethod ?? defaultPm?.name ?? 'Cash',
  );
  const [transactionDate, setTransactionDate] = useState(
    activeDraft?.transactionDate ??
      (initialValues?.transactionDate && isValidISODate(initialValues.transactionDate)
        ? initialValues.transactionDate
        : getTodayISODate()),
  );
  const [note, setNote] = useState(activeDraft?.note ?? initialValues?.note ?? '');

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Inline tag creation state (hidden until user explicitly taps "+ Add Tag")
  const [showInlineTagCreate, setShowInlineTagCreate] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [tagCreateError, setTagCreateError] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);

  // Reflect draft mutations from dedicated full-screen pickers (/currency & /payment-methods/select)
  const effectiveCurrencyCode =
    !isEditing && activeDraft?.currencyCode ? activeDraft.currencyCode : currencyCode;
  const effectivePaymentMethodId = activeDraft
    ? activeDraft.paymentMethodId
    : paymentMethodId;
  const effectivePaymentMethodName = activeDraft
    ? activeDraft.paymentMethod
    : paymentMethodName;

  const currency = useMemo(
    () => getCurrencyConfig(effectiveCurrencyCode, currencies),
    [effectiveCurrencyCode, currencies],
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

  const displayTags = useMemo(
    () => tags.filter((t) => !t.isArchived || selectedTagIds.includes(t.id)),
    [tags, selectedTagIds],
  );

  const buildDraftSnapshot = (
    overrides?: Partial<TransactionDraft>,
  ): TransactionDraft => ({
    mode: isEditing ? 'edit' : 'create',
    transactionId,
    step,
    type,
    amountText,
    currencyCode: effectiveCurrencyCode,
    title,
    categoryId: effectiveCategory?.id ?? categoryId,
    tagIds: selectedTagIds,
    transactionDate,
    paymentMethodId: effectivePaymentMethodId,
    paymentMethod: effectivePaymentMethodName,
    note,
    ...overrides,
  });

  const syncDraftPatch = (patch: Partial<TransactionDraft>) => {
    if (activeDraft) {
      patchTransactionDraft(patch);
    }
  };

  const openCurrencyPage = () => {
    if (isEditing) return;
    setStepError(null);
    setCurrencyCode(effectiveCurrencyCode);
    setTransactionDraft(buildDraftSnapshot());
    router.push('/currency?mode=draft');
  };

  const openPaymentMethodPage = () => {
    setPaymentMethodId(effectivePaymentMethodId);
    setPaymentMethodName(effectivePaymentMethodName);
    setTransactionDraft(buildDraftSnapshot());
    router.push('/payment-methods/select');
  };

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    const firstForType = categories.find(
      (c) => c.type === nextType && !c.isArchived,
    );
    const nextCatId = firstForType?.id ?? null;
    setCategoryId(nextCatId);
    setStepError(null);
    syncDraftPatch({ type: nextType, categoryId: nextCatId });
  };

  const handleToggleTag = (tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    syncDraftPatch({ tagIds: next });
  };

  const handleCreateInlineTag = async () => {
    if (creatingTag) return;
    setTagCreateError(null);
    const validation = validateTagName(newTagName);
    if (!validation.valid || !validation.value) {
      setTagCreateError(validation.error ?? 'Invalid tag name.');
      return;
    }

    setCreatingTag(true);
    try {
      const created = await onCreateTag({
        name: validation.value,
        color: newTagColor,
      });
      const nextIds = selectedTagIds.includes(created.id)
        ? selectedTagIds
        : [...selectedTagIds, created.id];
      setSelectedTagIds(nextIds);
      syncDraftPatch({ tagIds: nextIds });
      setNewTagName('');
      setNewTagColor(TAG_COLOR_OPTIONS[0]);
      setShowInlineTagCreate(false);
    } catch (error) {
      setTagCreateError(
        error instanceof Error ? error.message : 'Unable to create tag.',
      );
    } finally {
      setCreatingTag(false);
    }
  };

  const handleNext = () => {
    setStepError(null);
    const parsedMinor = parseMajorToMinor(
      amountText,
      effectiveCurrencyCode,
      currencies,
    );
    if (parsedMinor === null || parsedMinor <= 0) {
      setStepError(`Enter a valid positive amount in ${currency.code}.`);
      return;
    }
    setStep(2);
    syncDraftPatch({ step: 2 });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setStepError(null);

    const validation = validateTransactionInput({
      type,
      title,
      rawAmount: amountText,
      currencyCode: effectiveCurrencyCode,
      categoryId: effectiveCategory?.id ?? null,
      transactionDate,
      paymentMethod: effectivePaymentMethodName,
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
        paymentMethodId: effectivePaymentMethodId,
        paymentMethod: effectivePaymentMethodName,
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
          <View style={styles.stepOneTopBar}>
            <SegmentedControl
              options={typeOptions}
              value={type}
              onChange={handleTypeChange}
            />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.stepOneScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.amountCenter}>
              <Pressable
                onPress={openCurrencyPage}
                disabled={isEditing}
                accessibilityRole="button"
                accessibilityLabel="Select currency"
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
                    syncDraftPatch({ amountText: text });
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
              onPress={() => {
                setStep(1);
                syncDraftPatch({ step: 1 });
              }}
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
                  syncDraftPatch({ title: text });
                  if (stepError) setStepError(null);
                }}
                placeholder="Transaction name"
                maxLength={100}
              />

              <DatePickerField
                label="Date"
                value={transactionDate}
                dateFormat={dateFormat}
                onChange={(nextDate) => {
                  setTransactionDate(nextDate);
                  syncDraftPatch({ transactionDate: nextDate });
                }}
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
                  <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              {/* Inline Tags selection */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Tags (Optional)
                </Text>

                <View style={styles.inlineTagsWrap}>
                  {displayTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <Pressable
                        key={tag.id}
                        onPress={() => handleToggleTag(tag.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.inlineTagPill,
                          {
                            backgroundColor: selected ? theme.primary : theme.surface,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <View
                          style={[
                            styles.tagDot,
                            {
                              backgroundColor: selected
                                ? theme.primaryText
                                : tag.color,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.inlineTagText,
                            { color: selected ? theme.primaryText : theme.text },
                          ]}>
                          {tag.name}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {!showInlineTagCreate ? (
                    <Pressable
                      onPress={() => {
                        setTagCreateError(null);
                        setShowInlineTagCreate(true);
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.addTagPill,
                        {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons name="add" size={15} color={theme.primary} />
                      <Text style={[styles.addTagText, { color: theme.primary }]}>
                        Add Tag
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {showInlineTagCreate ? (
                  <View
                    style={[
                      styles.inlineCreateCard,
                      {
                        backgroundColor: theme.surfaceElevated,
                        borderColor: theme.border,
                      },
                    ]}>
                    <TextInput
                      value={newTagName}
                      onChangeText={(text) => {
                        setNewTagName(text);
                        if (tagCreateError) setTagCreateError(null);
                      }}
                      placeholder="Tag name"
                      placeholderTextColor={theme.textMuted}
                      maxLength={28}
                      autoFocus
                      style={[
                        styles.inlineTagInput,
                        {
                          color: theme.text,
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    />

                    <View style={styles.swatchRow}>
                      {TAG_COLOR_OPTIONS.map((swatch) => {
                        const selected = newTagColor === swatch;
                        return (
                          <Pressable
                            key={swatch}
                            onPress={() => setNewTagColor(swatch)}
                            style={[
                              styles.colorSwatch,
                              {
                                backgroundColor: swatch,
                                borderWidth: selected ? 2.5 : 0,
                                borderColor: theme.text,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>

                    {tagCreateError ? (
                      <Text style={[styles.tagErrorText, { color: theme.danger }]}>
                        {tagCreateError}
                      </Text>
                    ) : null}

                    <View style={styles.inlineCreateActions}>
                      <View style={styles.flex}>
                        <AppButton
                          label="Cancel"
                          size="sm"
                          variant="outline"
                          onPress={() => {
                            setShowInlineTagCreate(false);
                            setNewTagName('');
                            setTagCreateError(null);
                          }}
                          disabled={creatingTag}
                          fullWidth
                        />
                      </View>
                      <View style={styles.flex}>
                        <AppButton
                          label="Create"
                          size="sm"
                          onPress={() => void handleCreateInlineTag()}
                          loading={creatingTag}
                          fullWidth
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Currency selector */}
              <View style={styles.selectorField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Currency</Text>
                <Pressable
                  onPress={openCurrencyPage}
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
                  onPress={openPaymentMethodPage}
                  accessibilityRole="button"
                  style={[
                    styles.selectorButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <Text style={[styles.selectorValue, { color: theme.text }]}>
                    {effectivePaymentMethodName}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </Pressable>
              </View>

              <AppInput
                label="Note (Optional)"
                value={note}
                onChangeText={(text) => {
                  setNote(text);
                  syncDraftPatch({ note: text });
                }}
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
                  syncDraftPatch({ step: 1 });
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
        onSelect={(cat) => {
          setCategoryId(cat.id);
          syncDraftPatch({ categoryId: cat.id });
        }}
        onClose={() => setCategoryModalVisible(false)}
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
  stepOneTopBar: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  stepOneScroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  amountCenter: {
    flex: 1,
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
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
    paddingHorizontal: Spacing.three - 2,
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
  inlineTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  inlineTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  inlineTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  addTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inlineCreateCard: {
    padding: Spacing.three - 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  inlineTagInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  tagErrorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineCreateActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.78,
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
