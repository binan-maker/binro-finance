import type { Transaction } from '@/types/models';
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
  currencyCode: string,
): string {
  const header = [
    'Date',
    'Type',
    'Title',
    'Category',
    'Amount',
    'Currency',
    'Payment Method',
    'Note',
    'Transaction ID',
  ].join(',');

  const rows = transactions.map((tx) => {
    const majorAmount = formatMinorToMajorInput(tx.amountMinor, currencyCode);
    return [
      escapeCsvCell(tx.transactionDate),
      escapeCsvCell(tx.type),
      escapeCsvCell(tx.title),
      escapeCsvCell(tx.categoryNameSnapshot),
      escapeCsvCell(majorAmount),
      escapeCsvCell(currencyCode),
      escapeCsvCell(tx.paymentMethod),
      escapeCsvCell(tx.note ?? ''),
      escapeCsvCell(tx.id),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
