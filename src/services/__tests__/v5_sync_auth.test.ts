import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import { runMigrations } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/factory';
import { isLocalRelativeImagePath } from '@/services/images/mediaPathUtils';
import { getPublicEnvConfig, isGoogleSignInConfigured, isSupabaseConfigured } from '@/services/supabase/config';
import type { AppSettings, UserEntitlement } from '@/types/models';
import { validateBackupPayload } from '@/utils/validation';

// Mock Expo / React Native modules so pure service logic runs cleanly in bun test
const mockSecureStoreMap = new Map<string, string>();
const mockAsyncStorageMap = new Map<string, string>();

mock.module('react-native-get-random-values', () => ({}));

mock.module('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
}));

mock.module('expo-constants', () => ({
  default: { expoConfig: { version: '5.0.0' } },
}));

mock.module('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSecureStoreMap.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
  },
}));

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => mockAsyncStorageMap.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockAsyncStorageMap.set(key, value);
    },
    removeItem: async (key: string) => {
      mockAsyncStorageMap.delete(key);
    },
  },
}));

mock.module('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  getRandomBytes: (length: number) => {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  },
  randomUUID: () => crypto.randomUUID(),
  digestStringAsync: async (_alg: string, value: string) => {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
  digest: async (_alg: string, buf: ArrayBuffer) => crypto.subtle.digest('SHA-256', buf),
}));

mock.module('expo-network', () => ({
  getNetworkStateAsync: async () => ({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

mock.module('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { document: '/tmp' },
}));

mock.module('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

mock.module('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: () => {},
    checkPlayServices: async () => true,
    signIn: async () => ({ type: 'cancelled', data: null }),
    createAccount: async () => ({ type: 'cancelled', data: null }),
    presentExplicitSignIn: async () => ({ type: 'cancelled', data: null }),
    signOut: async () => {},
  },
  isCancelledResponse: () => true,
  isErrorWithCode: () => false,
  isNoSavedCredentialFoundResponse: () => false,
  isSuccessResponse: () => false,
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    IN_PROGRESS: 'IN_PROGRESS',
  },
}));

const { sanitizeAnalyticsMetadata } = await import('@/services/analytics/analyticsService');
const { isProEntitlementActive } = await import('@/services/entitlements/entitlementService');
const { buildGoogleFallbackProfilePatch } = await import('@/services/auth/googleAuthService');
const { LargeSecureStore } = await import('@/services/supabase/client');
const { sanitizeRemoteMediaPath } = await import('@/services/sync/mediaSyncService');

function createBunSqliteAdapter(): SqlDatabaseAdapter {
  const raw = new Database(':memory:');
  return {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      const res = stmt.run(...params);
      return {
        changes: res.changes,
        lastInsertRowId: Number(res.lastInsertRowid),
      };
    },
    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      return (stmt.get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      return stmt.all(...params) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describe('Phase 8: V5 Sync, Security, Privacy Analytics, Entitlements & Validation', () => {
  beforeEach(() => {
    mockSecureStoreMap.clear();
    mockAsyncStorageMap.clear();
  });

  test('LargeSecureStore encrypts session payloads with AES-256-CTR and random per-write IVs', async () => {
    const store = new LargeSecureStore();
    const secretPayload = JSON.stringify({
      access_token: 'secret-jwt-access-token',
      refresh_token: 'secret-refresh-token',
      user: { id: 'user-123' },
    });

    await store.setItem('sb-session', secretPayload);
    const cipherOne = mockAsyncStorageMap.get('sb-session') ?? '';
    expect(cipherOne.startsWith('v1:')).toBe(true);
    expect(cipherOne.includes('secret-jwt-access-token')).toBe(false);
    expect(mockSecureStoreMap.get('binro_supabase_aes_key_v1')?.length).toBe(64);

    // Re-writing same plaintext produces a different ciphertext due to fresh random IV
    await store.setItem('sb-session', secretPayload);
    const cipherTwo = mockAsyncStorageMap.get('sb-session') ?? '';
    expect(cipherTwo).not.toBe(cipherOne);

    const decrypted = await store.getItem('sb-session');
    expect(decrypted).toBe(secretPayload);

    await store.removeItem('sb-session');
    expect(await store.getItem('sb-session')).toBeNull();
  });

  test('Supabase & Google config helpers reject placeholders and validate format', () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    try {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://your-project-ref.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_your_key';
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'your-google-web-client-id.apps.googleusercontent.com';

      expect(isSupabaseConfigured()).toBe(false);
      expect(isGoogleSignInConfigured()).toBe(false);

      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

      expect(isSupabaseConfigured()).toBe(true);
      expect(isGoogleSignInConfigured()).toBe(true);
      expect(getPublicEnvConfig().supabaseUrl).toBe('https://abcxyz.supabase.co');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('buildGoogleFallbackProfilePatch sets fallback fields without overwriting custom local profileName', () => {
    const baseSettings: AppSettings = {
      id: 1,
      currencyCode: 'INR',
      openingBalanceMinor: 0,
      openingBalanceCurrencyCode: 'INR',
      theme: 'system',
      dateFormat: 'DD MMM YYYY',
      onboardingCompleted: true,
      profileName: 'Custom BinRo Name',
      profileBio: null,
      profileAvatar: 'binro_images/profile/custom.jpg',
      currencyInitialized: true,
      showHomeBudgetShortcut: false,
      gender: null,
      dateOfBirth: null,
      googleName: null,
      googleEmail: null,
      googleAvatarUrl: null,
      profileCompletedAt: null,
      updatedAt: '2026-11-25T00:00:00.000Z',
    };

    const patchWithExistingName = buildGoogleFallbackProfilePatch(baseSettings, {
      userId: 'u1',
      email: 'user@example.com',
      googleName: 'Google Display',
      googleAvatarUrl: 'https://example.com/photo.jpg',
    });
    expect(patchWithExistingName.profileName).toBeUndefined();
    expect(patchWithExistingName.googleEmail).toBe('user@example.com');
    expect(patchWithExistingName.googleAvatarUrl).toBe('https://example.com/photo.jpg');

    const patchWhenEmpty = buildGoogleFallbackProfilePatch(
      { ...baseSettings, profileName: null },
      {
        userId: 'u1',
        email: 'user@example.com',
        googleName: 'Google Display',
        googleAvatarUrl: null,
      },
    );
    expect(patchWhenEmpty.profileName).toBe('Google Display');
  });

  test('media path validation strictly allows scoped folder paths and rejects traversal', () => {
    expect(isLocalRelativeImagePath('binro_images/payment_methods/card1.png')).toBe(true);
    expect(isLocalRelativeImagePath('binro_images/categories/cat1.webp')).toBe(true);
    expect(isLocalRelativeImagePath('binro_images/profile/avatar.jpg')).toBe(true);
    expect(isLocalRelativeImagePath('../secret.jpg')).toBe(false);
    expect(isLocalRelativeImagePath('binro_images/unknown/file.jpg')).toBe(false);
    expect(isLocalRelativeImagePath('/abs/binro_images/profile/a.jpg')).toBe(false);

    expect(sanitizeRemoteMediaPath('user-1', 'user-1/payment_methods/pm_abc.png')).toBe(
      'user-1/payment_methods/pm_abc.png',
    );
    expect(sanitizeRemoteMediaPath('user-1', 'user-2/payment_methods/pm_abc.png')).toBeNull();
    expect(sanitizeRemoteMediaPath('user-1', 'user-1/../etc/passwd.png')).toBeNull();
    expect(sanitizeRemoteMediaPath('user-1', 'https://evil.test/a.jpg')).toBeNull();
  });

  test('sanitizeAnalyticsMetadata strips all financial and PII keys while retaining safe counters', () => {
    const sanitized = sanitizeAnalyticsMetadata({
      amount: 5000,
      amountMinor: 5000,
      opening_balance_minor: 10000,
      balance: 99999,
      title: 'Secret Restaurant',
      note: 'Lunch with client',
      email: 'person@example.com',
      name: 'John',
      date_of_birth: '1995-01-01',
      pushed_count: 12,
      pulled_count: 4,
      mode: 'merge',
    });

    expect(sanitized).toEqual({
      pushed_count: 12,
      pulled_count: 4,
      mode: 'merge',
    });
  });

  test('entitlement helpers unlock pro only when active/grace and unexpired', () => {
    const base: UserEntitlement = {
      userId: 'u1',
      tier: 'free',
      status: 'active',
      expiresAt: null,
      source: 'default',
      updatedAt: null,
    };
    expect(isProEntitlementActive(base)).toBe(false);
    expect(
      isProEntitlementActive({
        ...base,
        tier: 'pro',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      isProEntitlementActive({
        ...base,
        tier: 'pro',
        status: 'grace_period',
      }),
    ).toBe(true);
    expect(
      isProEntitlementActive({
        ...base,
        tier: 'pro',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);
    expect(
      isProEntitlementActive({
        ...base,
        tier: 'pro',
        status: 'canceled',
      }),
    ).toBe(false);
  });

  test('V5 backup validation accepts PM images & profile fields and rejects invalid values', () => {
    const validV5 = validateBackupPayload({
      schemaVersion: 5,
      exportedAt: '2026-11-25T10:00:00.000Z',
      appVersion: '5.0.0',
      settings: {
        id: 1,
        currencyCode: 'INR',
        openingBalanceMinor: 0,
        openingBalanceCurrencyCode: 'INR',
        theme: 'dark',
        dateFormat: 'DD MMM YYYY',
        onboardingCompleted: true,
        profileName: 'Tester',
        profileBio: null,
        profileAvatar: 'binro_images/profile/p1.jpg',
        gender: 'female',
        dateOfBirth: '1998-06-20',
      },
      categories: [],
      tags: [],
      paymentMethods: [
        {
          id: 'pm-1',
          name: 'Custom Card',
          icon: 'card',
          imageUri: 'binro_images/payment_methods/c1.jpg',
          isBuiltin: false,
          isArchived: false,
          createdAt: '2026-11-25T10:00:00.000Z',
          updatedAt: '2026-11-25T10:00:00.000Z',
        },
      ],
      budgets: [],
      transactions: [],
    });
    expect(validV5.valid).toBe(true);

    const invalidV5 = validateBackupPayload({
      schemaVersion: 5,
      exportedAt: '2026-11-25T10:00:00.000Z',
      appVersion: '5.0.0',
      settings: {
        id: 1,
        currencyCode: 'INR',
        openingBalanceMinor: 0,
        openingBalanceCurrencyCode: 'INR',
        theme: 'dark',
        dateFormat: 'DD MMM YYYY',
        onboardingCompleted: true,
        gender: 'invalid_gender',
      },
      categories: [],
      tags: [],
      paymentMethods: [],
      budgets: [],
      transactions: [],
    });
    expect(invalidV5.valid).toBe(false);
  });

  test('SQLite sync repository isolates User A vs User B accounts cleanly and converges remote bundles', async () => {
    const db = createBunSqliteAdapter();
    await runMigrations(db);
    const repos = createRepositories(async () => db);

    // 1. Offline local workspace created before Google sign-in
    const tag = await repos.tags.create({ name: 'Home', color: '#10B981' });
    const pm = await repos.paymentMethods.create({
      name: 'Metal Card',
      icon: 'card',
      imageUri: 'binro_images/payment_methods/metal.png',
    });
    const tx = await repos.transactions.create({
      type: 'expense',
      title: 'Groceries',
      amountMinor: 2500,
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food & Drink',
      paymentMethodId: pm.id,
      paymentMethod: pm.name,
      tagIds: [tag.id],
      transactionDate: '2026-11-25',
    });

    // Link workspace to User A & enqueue full migration
    await repos.sync.updateSyncState({
      linkedUserId: 'user-A',
      linkedUserEmail: 'a@example.com',
      syncStatus: 'idle',
    });
    await repos.sync.enqueueFullWorkspaceForMigration('user-A');
    const outboxA = await repos.sync.getPendingOutbox('user-A', 200);
    expect(outboxA.some((item) => item.entity_type === 'transaction' && item.entity_id === tx.id)).toBe(true);
    expect(outboxA.some((item) => item.entity_type === 'payment_method' && item.entity_id === pm.id)).toBe(true);

    // 2. Switching to User B resets User A local data cleanly with zero leakage
    await repos.sync.resetWorkspaceForAccountSwitch({
      userId: 'user-B',
      email: 'b@example.com',
    });

    const syncStateB = await repos.sync.getSyncState();
    expect(syncStateB.linkedUserId).toBe('user-B');
    expect(syncStateB.linkedUserEmail).toBe('b@example.com');
    expect(await repos.transactions.getAll()).toEqual([]);
    expect(await repos.tags.getAll()).toEqual([]);
    expect(await repos.sync.getPendingOutboxCount('user-A')).toBe(0);

    // 3. Apply remote bundle for User B including PM image and tombstones
    await repos.sync.applyRemoteBundle({
      categories: [],
      paymentMethods: [
        {
          id: 'pm-remote-b',
          name: 'User B Wallet',
          icon: 'wallet',
          imageUri: 'binro_images/payment_methods/b_wallet.jpg',
          isBuiltin: false,
          isArchived: false,
          deletedAt: null,
          createdAt: '2026-11-25T11:00:00.000Z',
          updatedAt: '2026-11-25T11:00:00.000Z',
        },
      ],
      tags: [],
      budgets: [],
      transactions: [
        {
          id: 'tx-remote-b',
          type: 'income',
          title: 'User B Bonus',
          amountMinor: 90000,
          currencyCode: 'USD',
          categoryId: 'cat-inc-salary',
          categoryNameSnapshot: 'Salary',
          paymentMethodId: 'pm-remote-b',
          paymentMethod: 'User B Wallet',
          transactionDate: '2026-11-25',
          note: null,
          deletedAt: null,
          createdAt: '2026-11-25T11:05:00.000Z',
          updatedAt: '2026-11-25T11:05:00.000Z',
        },
      ],
      transactionTags: [],
    });

    const txsB = await repos.transactions.getAll();
    expect(txsB.map((t) => t.id)).toEqual(['tx-remote-b']);
    const pmB = await repos.paymentMethods.getById('pm-remote-b');
    expect(pmB?.imageUri).toBe('binro_images/payment_methods/b_wallet.jpg');

    // Clearing remote image sets local image_uri to null on pull convergence
    await repos.sync.applyRemoteBundle({
      categories: [],
      paymentMethods: [
        {
          ...pmB!,
          imageUri: null,
          updatedAt: '2026-11-25T12:00:00.000Z',
        },
      ],
      tags: [],
      budgets: [],
      transactions: [],
      transactionTags: [],
    });
    expect((await repos.paymentMethods.getById('pm-remote-b'))?.imageUri).toBeNull();
  });

  test('Static security audit: no service_role keys, auth.users queries, or secrets in app src/', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text.includes('service_role')).toBe(false);
      expect(text.includes('SUPABASE_DB_PASSWORD')).toBe(false);
      expect(text.includes("from('auth.users')")).toBe(false);
      expect(text.includes('getPublicUrl')).toBe(false);
    }

    const rlsSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/002_rls_and_storage.sql'),
      'utf8',
    );
    expect(rlsSql.includes('ENABLE ROW LEVEL SECURITY')).toBe(true);
    expect(rlsSql.includes("'binro-media'")).toBe(true);
  });
});
