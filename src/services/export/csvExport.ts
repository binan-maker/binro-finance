import type { CurrencyConfig } from '@/constants/currencies';
import type { Tag, Transaction } from '@/types/models';
import { formatMinorToMajorInput } from '@/utils/money';

function escapeCsvCell(value: string): string {
  const needsFormulaPrefix = /^[=+\-@\t\r]/.test(value);
  const safeValue = needsFormulaPrefix ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

export function buildTransactionsCsv(
  transactions: readonly Transaction[],
  fallbackCurrencyCode: string,
  tags: readonly Tag[] = [],
  catalog?: readonly CurrencyConfig[],
): string {
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));

  const header = [
    'Date',
    'Type',
    'Title',
    'Category',
    'Tags',
    'Amount',
    'Currency',
    'Payment Method',
    'Note',
    'Transaction ID',
  ].join(',');

  const rows = transactions.map((tx) => {
    const txCurrency = tx.currencyCode || fallbackCurrencyCode;
    const majorAmount = formatMinorToMajorInput(tx.amountMinor, txCurrency, catalog);
    const tagNames = (tx.tagIds ?? [])
      .map((id) => tagMap.get(id))
      .filter((name): name is string => Boolean(name))
      .join(', ');

    return [
      escapeCsvCell(tx.transactionDate),
      escapeCsvCell(tx.type),
      escapeCsvCell(tx.title),
      escapeCsvCell(tx.categoryNameSnapshot),
      escapeCsvCell(tagNames),
      escapeCsvCell(majorAmount),
      escapeCsvCell(txCurrency),
      escapeCsvCell(tx.paymentMethod),
      escapeCsvCell(tx.note ?? ''),
      escapeCsvCell(tx.id),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
