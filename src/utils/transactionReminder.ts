import type { Transaction } from '@/types/models';

export const MIN_TRANSACTIONS_FOR_INLINE_REMINDER = 6;
export const INLINE_REMINDER_AFTER_COUNT = 5;

export interface TransactionsDailyNet {
  currencyCode: string;
  netMinor: number;
}

export interface TransactionsSectionSource {
  title: string;
  date: string;
  dailyNets: TransactionsDailyNet[];
  data: Transaction[];
}

export type TransactionsListItem =
  | { kind: 'tx'; id: string; transaction: Transaction }
  | { kind: 'signin_reminder'; id: '__transactions_signin_reminder__' };

export interface TransactionsSectionWithReminder {
  title: string;
  date: string;
  dailyNets: TransactionsDailyNet[];
  data: TransactionsListItem[];
}

/**
 * Places a single inline Google sign-in reminder inside long transaction lists
 * (after the 5th transaction when total transactions >= 6) so items appear
 * both above and below without altering daily net calculations or short lists.
 */
export function injectTransactionsSignInReminder(
  sections: readonly TransactionsSectionSource[],
  shouldShowReminder: boolean,
): TransactionsSectionWithReminder[] {
  const totalCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const canInject =
    shouldShowReminder && totalCount >= MIN_TRANSACTIONS_FOR_INLINE_REMINDER;

  if (!canInject) {
    return sections.map((section) => ({
      ...section,
      data: section.data.map((tx) => ({
        kind: 'tx' as const,
        id: tx.id,
        transaction: tx,
      })),
    }));
  }

  let seenTransactions = 0;
  let reminderInserted = false;

  return sections.map((section) => {
    const items: TransactionsListItem[] = [];
    for (const tx of section.data) {
      items.push({
        kind: 'tx',
        id: tx.id,
        transaction: tx,
      });
      seenTransactions += 1;
      if (!reminderInserted && seenTransactions === INLINE_REMINDER_AFTER_COUNT) {
        items.push({
          kind: 'signin_reminder',
          id: '__transactions_signin_reminder__',
        });
        reminderInserted = true;
      }
    }
    return {
      ...section,
      data: items,
    };
  });
}
