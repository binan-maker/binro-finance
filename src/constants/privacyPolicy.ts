export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export const PRIVACY_POLICY_TITLE = 'BinRo Finance Privacy Policy';
export const PRIVACY_POLICY_LAST_UPDATED = 'Last updated: November 2026';

export const PRIVACY_POLICY_INTRO =
  'BinRo Finance is built with a local-first architecture. Your day-to-day financial records remain on your device, and cloud features are optional.';

export const PRIVACY_POLICY_SECTIONS: readonly PrivacyPolicySection[] = [
  {
    id: 'local-storage',
    title: '1. Data Stored Locally on Your Device',
    paragraphs: [
      'When you use BinRo Finance, your financial workspace is stored locally in an on-device SQLite database and private app file storage.',
    ],
    bullets: [
      'Transactions (income and expense entries, titles, amounts, dates, notes, categories, payment methods, and tags).',
      'Budgets (monthly, biweekly, or yearly spending limits), opening balance, default currency, theme, and date format preferences.',
      'Optional profile details you choose to enter: Display Name, Bio / Note, Date of Birth, Gender, and custom profile, category, or payment-method images.',
      'In-app notifications stored locally in your workspace (such as budget alerts, backup summaries, and account sign-in notices).',
    ],
  },
  {
    id: 'google-signin-sync',
    title: '2. Optional Google Sign-In & Cloud Sync',
    paragraphs: [
      'Google Sign-In is optional. You can use BinRo Finance completely offline without creating or linking a cloud account.',
      'If you choose to sign in with Google, BinRo Finance uses Google Sign-In and Supabase Authentication solely to authenticate your session and sync your private workspace across sessions.',
    ],
    bullets: [
      'Account details received from Google: your Google user identifier, email address, display name, and Google profile photo URL (used as a default avatar unless replaced or removed).',
      'Synced workspace data: your profile, settings, categories, payment methods, tags, budgets, transactions, and any custom images uploaded to the private binro-media storage bucket.',
      'Data isolation: cloud tables and storage folders are scoped per authenticated user ID via database Row Level Security (RLS) policies.',
    ],
  },
  {
    id: 'privacy-analytics',
    title: '3. Privacy-Preserving App Analytics',
    paragraphs: [
      'BinRo Finance sends minimal app health and lifecycle events using a randomly generated anonymous installation identifier so app reliability can be measured.',
    ],
    bullets: [
      'Lifecycle events include app opens, onboarding completion, transaction count events, backup completion, sync status, and sign-in completion.',
      'Transaction amounts, account balances, titles, notes, category names, tag names, email addresses, names, and dates of birth are strictly excluded and stripped before sending.',
    ],
  },
  {
    id: 'currency-metadata',
    title: '4. Currency Metadata Lookups',
    paragraphs: [
      'On startup, the app may fetch public ISO currency names and symbols (metadata only) to populate the currency list. No personal or financial data is sent in this request, and the app falls back to its built-in currency list when offline.',
    ],
  },
  {
    id: 'user-controls',
    title: '5. Your Controls, Export & Data Deletion',
    paragraphs: [
      'You remain in control of your data at all times from within the app:',
    ],
    bullets: [
      'Export & Restore: export your transactions and workspace as CSV or JSON files from Backup & Export anytime.',
      'Profile & Photos: edit or clear optional profile fields and replace or remove uploaded photos from Profile.',
      'Sign Out: signing out of Google keeps your financial records safely on your device.',
      'Clear Local Data: permanently erase local device records from Account Management.',
      'Delete Account: if signed in with Google, you can permanently delete your cloud account, synced cloud records, private cloud images, and local device workspace from Account Management.',
    ],
  },
  {
    id: 'third-party-services',
    title: '6. Service Providers & No Ad Tracking',
    paragraphs: [
      'BinRo Finance does not display third-party advertisements, does not sell personal or financial data, and does not include payment gateways or subscription billing.',
      'Cloud authentication, database sync, and private media storage (when enabled by signing in) are provided using Google Sign-In and Supabase.',
    ],
  },
];
