import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheetModal } from '@/components/common/BottomSheetModal';
import { FALLBACK_CURRENCIES, type CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CurrencyPickerModalProps {
  visible: boolean;
  currencies?: readonly CurrencyConfig[];
  selectedCode: string;
  onSelect: (currency: CurrencyConfig) => void;
  onClose: () => void;
}

export function CurrencyPickerModal({
  visible,
  currencies = FALLBACK_CURRENCIES,
  selectedCode,
  onSelect,
  onClose,
}: CurrencyPickerModalProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = currencies.length > 0 ? currencies : FALLBACK_CURRENCIES;
    if (!term) {
      return [...list].sort((a, b) => {
        if (a.code === selectedCode) return -1;
        if (b.code === selectedCode) return 1;
        const idxA = FALLBACK_CURRENCIES.findIndex((f) => f.code === a.code);
        const idxB = FALLBACK_CURRENCIES.findIndex((f) => f.code === b.code);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.code.localeCompare(b.code);
      });
    }
    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.symbol.toLowerCase().includes(term),
    );
  }, [currencies, search, selectedCode]);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      containerStyle={styles.sheetContainer}>
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          Select Currency
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close currency selector">
          <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
        ]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search currency"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={6}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No matching currencies found.
          </Text>
        }
        renderItem={({ item }) => {
          const selected = item.code.toUpperCase() === selectedCode.toUpperCase();
          return (
            <Pressable
              onPress={() => {
                onSelect(item);
                setSearch('');
                onClose();
              }}
              style={[
                styles.row,
                {
                  backgroundColor: selected ? theme.primarySoft : 'transparent',
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <View
                style={[
                  styles.symbolBadge,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceElevated,
                  },
                ]}>
                <Text
                  style={[
                    styles.symbolText,
                    { color: selected ? theme.primaryText : theme.text },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {item.symbol}
                </Text>
              </View>

              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                  {item.code} · {item.minorUnits} {item.minorUnits === 1 ? 'decimal' : 'decimals'}
                </Text>
              </View>

              {selected ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    maxHeight: '82%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  symbolBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  symbolText: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
    fontSize: 14,
  },
});
