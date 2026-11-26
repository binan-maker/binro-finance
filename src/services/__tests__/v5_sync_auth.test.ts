import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import { runMigrations } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/factory';
import { isLocalRelativeImagePath } from '@/services/images/mediaPathUtils';
import type { AppSettings, Category, Transaction, UserEntitlement } from '@/types/models';
import {
  buildCategoryPickerItems,
  computeModalCardMaxHeight,
} from '@/utils/modalPickerLayout';
import {
  evaluateProfileCompletion,
  reconcileLocalAndRemoteProfile,
  shouldPromptProfileCompletion,
} from '@/utils/profile';
import { injectTransactionsSignInReminder } from '@/utils/transactionReminder';
import { validateBackupPayload } from '@/utils/validation';

// Define __DEV__ before Expo packages load dynamically inside Bun
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const mockSecureStoreMap = new Map<string, string>();
const mockAsyncStorageMap = new Map<string, string>();
const mockFiles = new Map<string, Uint8Array>();

let mockNetOnline = true;
let mockGoogleConfigCalls: Record<string, unknown>[] = [];
let mockGoogleSignInBehavior: () => Promise<unknown> = async () => ({
  type: 'cancelled',
  data: null,
});
let mockGoogleHasPlayServices: (opts?: Record<string, unknown>) => Promise<boolean> = async () =>
  true;
let mockGoogleSignOutCount = 0;

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

let activeTestDb: SqlDatabaseAdapter | null = null;

// In-memory Supabase remote state for end-to-end sync, media, auth, & analytics tests
interface MockRemoteState {
  tables: Record<string, Record<string, unknown>[]>;
  storage: Map<string, { bytes: Uint8Array; contentType: string }>;
  removedPaths: string[];
  uploadCount: number;
  analyticsInserts: Record<string, unknown>[];
  nextUpsertErrorTable: string | null;
  simulateMissingDeleteRpc: boolean;
  deleteRpcCalls: number;
  sessionUser: {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null;
  simulateSessionPersistFailure: boolean;
  signInWithIdTokenHandler: (params: {
    provider: string;
    token: string;
    nonce?: string;
  }) => Promise<{
    data: {
      user: {
        id: string;
        email?: string | null;
        created_at?: string | null;
        last_sign_in_at?: string | null;
        user_metadata?: Record<string, unknown>;
      } | null;
      session?: {
        access_token: string;
        user: {
          id: string;
          email?: string | null;
          created_at?: string | null;
          last_sign_in_at?: string | null;
          user_metadata?: Record<string, unknown>;
        };
      } | null;
    };
    error: { message: string } | null;
  }>;
}

const remoteState: MockRemoteState = {
  tables: {
    profiles: [],
    user_settings: [],
    categories: [],
    payment_methods: [],
    tags: [],
    budgets: [],
    transactions: [],
    transaction_tags: [],
    analytics_events: [],
    user_entitlements: [],
  },
  storage: new Map(),
  removedPaths: [],
  uploadCount: 0,
  analyticsInserts: [],
  nextUpsertErrorTable: null,
  simulateMissingDeleteRpc: false,
  deleteRpcCalls: 0,
  sessionUser: null,
  simulateSessionPersistFailure: false,
  signInWithIdTokenHandler: async () => ({
    data: { user: null, session: null },
    error: { message: 'Not configured' },
  }),
};

function resetRemoteState() {
  for (const key of Object.keys(remoteState.tables)) {
    remoteState.tables[key] = [];
  }
  remoteState.storage.clear();
  remoteState.removedPaths = [];
  remoteState.uploadCount = 0;
  remoteState.analyticsInserts = [];
  remoteState.nextUpsertErrorTable = null;
  remoteState.simulateMissingDeleteRpc = false;
  remoteState.deleteRpcCalls = 0;
  remoteState.sessionUser = null;
  remoteState.simulateSessionPersistFailure = false;
}

function getConflictKeys(table: string): string[] {
  switch (table) {
    case 'profiles':
    case 'user_settings':
    case 'user_entitlements':
      return ['user_id'];
    case 'transaction_tags':
      return ['user_id', 'transaction_id', 'tag_id'];
    default:
      return ['user_id', 'id'];
  }
}

function createMockSupabaseClient() {
  return {
    auth: {
      startAutoRefresh: async () => {},
      stopAutoRefresh: async () => {},
      getSession: async () => ({
        data: {
          session: remoteState.sessionUser
            ? { access_token: 'mock-session-access', user: remoteState.sessionUser }
            : null,
        },
        error: null,
      }),
      signInWithIdToken: async (params: { provider: string; token: string; nonce?: string }) => {
        const res = await remoteState.signInWithIdTokenHandler(params);
        if (!res.error && res.data.user && res.data.session && !remoteState.simulateSessionPersistFailure) {
          remoteState.sessionUser = res.data.user;
        }
        return res;
      },
      signOut: async () => {
        remoteState.sessionUser = null;
        return { error: null };
      },
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (
          remotePath: string,
          bytes: Uint8Array,
          opts?: { contentType?: string },
        ) => {
          remoteState.uploadCount += 1;
          remoteState.storage.set(remotePath, {
            bytes: new Uint8Array(bytes),
            contentType: opts?.contentType ?? 'image/jpeg',
          });
          return { data: { path: remotePath }, error: null };
        },
        download: async (remotePath: string) => {
          const entry = remoteState.storage.get(remotePath);
          if (!entry) {
            return { data: null, error: { message: 'Object not found' } };
          }
          return {
            data: {
              type: entry.contentType,
              arrayBuffer: async () => {
                const buf = new ArrayBuffer(entry.bytes.byteLength);
                new Uint8Array(buf).set(entry.bytes);
                return buf;
              },
            },
            error: null,
          };
        },
        list: async (prefix = '') => {
          const items: { name: string }[] = [];
          const normalizedPrefix = prefix ? `${prefix}/` : '';
          for (const key of remoteState.storage.keys()) {
            if (key.startsWith(normalizedPrefix)) {
              const name = key.slice(normalizedPrefix.length);
              if (name && !name.includes('/')) {
                items.push({ name });
              }
            }
          }
          return { data: items, error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) {
            remoteState.removedPaths.push(p);
            remoteState.storage.delete(p);
          }
          return { data: paths, error: null };
        },
      }),
    },
    rpc: async (fnName: string) => {
      if (fnName === 'delete_own_account') {
        remoteState.deleteRpcCalls += 1;
        if (remoteState.simulateMissingDeleteRpc) {
          return {
            data: null,
            error: {
              code: 'PGRST202',
              message: 'Could not find the function public.delete_own_account() in the schema cache',
            },
          };
        }
        const uid = remoteState.sessionUser?.id;
        if (!uid) {
          return { data: null, error: { message: 'Not authenticated' } };
        }
        for (const table of Object.keys(remoteState.tables)) {
          if (table === 'analytics_events') {
            remoteState.tables[table] = remoteState.tables[table].map((r) =>
              r.user_id === uid ? { ...r, user_id: null } : r,
            );
          } else {
            remoteState.tables[table] = remoteState.tables[table].filter((r) => r.user_id !== uid);
          }
        }
        remoteState.sessionUser = null;
        return { data: null, error: null };
      }
      return { data: null, error: { message: `Unknown rpc ${fnName}` } };
    },
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const orderBys: { col: string; ascending: boolean }[] = [];
      let limitVal: number | null = null;
      let mode: 'select' | 'delete' = 'select';

      const builder = {
        select: (_cols?: string) => {
          mode = 'select';
          return builder;
        },
        delete: () => {
          mode = 'delete';
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters.push((row) => row[col] === val);
          return builder;
        },
        gt: (col: string, val: unknown) => {
          filters.push((row) => String(row[col] ?? '') > String(val ?? ''));
          return builder;
        },
        gte: (col: string, val: unknown) => {
          filters.push((row) => String(row[col] ?? '') >= String(val ?? ''));
          return builder;
        },
        or: (expr: string) => {
          filters.push((row) => {
            // Supports keyset expressions like:
            // "server_updated_at.gt.X,and(server_updated_at.eq.X,id.gt.Y)"
            // or 3-tuple "server_updated_at.gt.X,and(server_updated_at.eq.X,transaction_id.gt.T),and(server_updated_at.eq.X,transaction_id.eq.T,tag_id.gt.G)"
            const parts: string[] = [];
            let depth = 0;
            let start = 0;
            for (let i = 0; i < expr.length; i += 1) {
              if (expr[i] === '(') depth += 1;
              else if (expr[i] === ')') depth -= 1;
              else if (expr[i] === ',' && depth === 0) {
                parts.push(expr.slice(start, i));
                start = i + 1;
              }
            }
            parts.push(expr.slice(start));

            const evalAtom = (atom: string): boolean => {
              const firstDot = atom.indexOf('.');
              const secondDot = atom.indexOf('.', firstDot + 1);
              const col = atom.slice(0, firstDot);
              const op = atom.slice(firstDot + 1, secondDot);
              const val = atom.slice(secondDot + 1);
              const rowVal = String(row[col] ?? '');
              if (op === 'gt') return rowVal > val;
              if (op === 'eq') return rowVal === val;
              return false;
            };

            return parts.some((part) => {
              if (part.startsWith('and(') && part.endsWith(')')) {
                const inner = part.slice(4, -1).split(',');
                return inner.every(evalAtom);
              }
              return evalAtom(part);
            });
          });
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderBys.push({ col, ascending: opts?.ascending !== false });
          return builder;
        },
        limit: (n: number) => {
          limitVal = n;
          return builder;
        },
        insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          const items = Array.isArray(payload) ? payload : [payload];
          if (table === 'analytics_events') {
            remoteState.analyticsInserts.push(...items);
          }
          remoteState.tables[table] = remoteState.tables[table] ?? [];
          remoteState.tables[table].push(...items);
          return { data: items, error: null };
        },
        upsert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          if (remoteState.nextUpsertErrorTable === table) {
            return { data: null, error: { message: `Simulated upsert error on ${table}` } };
          }
          const items = Array.isArray(payload) ? payload : [payload];
          const tableRows = (remoteState.tables[table] = remoteState.tables[table] ?? []);
          const conflictKeys = getConflictKeys(table);
          const serverStamp = new Date().toISOString();

          for (const item of items) {
            const idx = tableRows.findIndex((existing) =>
              conflictKeys.every((k) => existing[k] === item[k]),
            );
            const stored = { ...item, server_updated_at: serverStamp };
            if (idx >= 0) {
              tableRows[idx] = stored;
            } else {
              tableRows.push(stored);
            }
          }
          return { data: items, error: null };
        },
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
        ) => {
          if (mode === 'delete') {
            const existing = remoteState.tables[table] ?? [];
            remoteState.tables[table] = existing.filter(
              (row) => !filters.every((f) => f(row)),
            );
            return Promise.resolve(resolve({ data: [], error: null }));
          }

          let rows = [...(remoteState.tables[table] ?? [])];
          for (const f of filters) {
            rows = rows.filter(f);
          }
          if (orderBys.length > 0) {
            rows.sort((a, b) => {
              for (const o of orderBys) {
                const av = String(a[o.col] ?? '');
                const bv = String(b[o.col] ?? '');
                if (av !== bv) {
                  return o.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
                }
              }
              return 0;
            });
          }
          if (limitVal !== null) {
            rows = rows.slice(0, limitVal);
          }
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };

      return builder;
    },
  };
}

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
    isConnected: mockNetOnline,
    isInternetReachable: mockNetOnline,
  }),
}));

mock.module('expo-file-system', () => {
  class MockDirectory {
    pathParts: string[];
    constructor(...parts: unknown[]) {
      this.pathParts = parts.map((p) => String(p));
    }
    get exists() {
      const prefix = `${this.pathParts.join('/')}/`;
      return Array.from(mockFiles.keys()).some((k) => k.startsWith(prefix));
    }
    create() {}
    delete() {
      const prefix = `${this.pathParts.join('/')}/`;
      for (const k of Array.from(mockFiles.keys())) {
        if (k.startsWith(prefix)) mockFiles.delete(k);
      }
    }
  }

  class MockFile {
    key: string;
    constructor(...parts: unknown[]) {
      this.key = parts
        .map((p) => (p instanceof MockDirectory ? p.pathParts.join('/') : String(p)))
        .join('/');
    }
    get uri() {
      return `file://${this.key}`;
    }
    get exists() {
      return mockFiles.has(this.key);
    }
    get size() {
      return mockFiles.get(this.key)?.byteLength ?? 0;
    }
    create() {}
    write(bytes: Uint8Array) {
      mockFiles.set(this.key, new Uint8Array(bytes));
    }
    delete() {
      mockFiles.delete(this.key);
    }
    copy(dest: MockFile) {
      const src = mockFiles.get(this.key);
      if (src) mockFiles.set(dest.key, new Uint8Array(src));
    }
    async base64() {
      const bytes = mockFiles.get(this.key) ?? new Uint8Array(0);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 1) {
        bin += String.fromCharCode(bytes[i]);
      }
      return btoa(bin);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: '/mockdoc' },
  };
});

mock.module('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

mock.module('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'IN', currencyCode: 'INR' }],
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true }),
}));

mock.module('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));

mock.module('@/database', () => ({
  initializeDatabase: async () => {
    if (!activeTestDb) {
      activeTestDb = createBunSqliteAdapter();
      await runMigrations(activeTestDb);
    }
    return activeTestDb;
  },
  getDatabase: async () => {
    if (!activeTestDb) {
      activeTestDb = createBunSqliteAdapter();
      await runMigrations(activeTestDb);
    }
    return activeTestDb;
  },
}));

mock.module('@supabase/supabase-js', () => ({
  createClient: () => createMockSupabaseClient(),
}));

mock.module('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (params: Record<string, unknown>) => {
      mockGoogleConfigCalls.push(params);
    },
    hasPlayServices: (opts?: Record<string, unknown>) => mockGoogleHasPlayServices(opts),
    signIn: () => mockGoogleSignInBehavior(),
    signOut: async () => {
      mockGoogleSignOutCount += 1;
    },
  },
  isCancelledResponse: (res: { type?: string }) => res?.type === 'cancelled',
  isErrorWithCode: (err: unknown) =>
    Boolean(err && typeof err === 'object' && 'code' in err),
  isSuccessResponse: (res: { type?: string; data?: unknown }) =>
    res?.type === 'success' && Boolean(res?.data),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    IN_PROGRESS: 'IN_PROGRESS',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
    NULL_PRESENTER: 'NULL_PRESENTER',
  },
}));

const { getPublicEnvConfig, isGoogleSignInConfigured, isSupabaseConfigured } =
  await import('@/services/supabase/config');
const { sanitizeAnalyticsMetadata, trackAnalyticsEvent } =
  await import('@/services/analytics/analyticsService');
const { isProEntitlementActive } =
  await import('@/services/entitlements/entitlementService');
const {
  buildGoogleFallbackProfilePatch,
  resetGoogleSignInConfigCacheForTests,
  signInWithGoogleAccount,
  signOutGoogleAndSupabase,
} = await import('@/services/auth/googleAuthService');
const { LargeSecureStore } = await import('@/services/supabase/client');
const { sanitizeRemoteMediaPath, syncPendingMediaForUser } =
  await import('@/services/sync/mediaSyncService');
const {
  inspectAccountLinkState,
  linkLocalWorkspaceToUser,
  runSyncCycle,
  switchWorkspaceAccountAndSync,
} = await import('@/services/sync/syncEngine');
const { repositories } = await import('@/database/repositories');
const { useAppStore } = await import('@/store/app-store');

function createUnsignedTestJwt(payload: Record<string, unknown>): string {
  const encodePart = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return `${encodePart({ alg: 'RS256', typ: 'JWT' })}.${encodePart(payload)}.mock-signature`;
}

describe('Phase 8: V5 Sync, Auth, Media, Security, Privacy Analytics, Entitlements & Validation', () => {
  beforeEach(async () => {
    mockSecureStoreMap.clear();
    mockAsyncStorageMap.clear();
    mockFiles.clear();
    resetRemoteState();
    resetGoogleSignInConfigCacheForTests();
    mockNetOnline = true;
    mockGoogleConfigCalls = [];
    mockGoogleSignOutCount = 0;
    mockGoogleHasPlayServices = async () => true;
    mockGoogleSignInBehavior = async () => ({ type: 'cancelled', data: null });

    activeTestDb = createBunSqliteAdapter();
    await runMigrations(activeTestDb);
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
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
        'your-google-web-client-id.apps.googleusercontent.com';

      expect(isSupabaseConfigured()).toBe(false);
      expect(isGoogleSignInConfigured()).toBe(false);

      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
        '123456-abc.apps.googleusercontent.com';

      expect(isSupabaseConfigured()).toBe(true);
      expect(isGoogleSignInConfigured()).toBe(true);
      expect(getPublicEnvConfig().supabaseUrl).toBe('https://abcxyz.supabase.co');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('googleAuthService exchanges valid Google ID token with Supabase, verifies persisted session, and handles cancel/offline/Play Services/developer errors', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

    try {
      // 1. Offline guard
      mockNetOnline = false;
      const offlineRes = await signInWithGoogleAccount();
      expect(offlineRes.status).toBe('error');
      mockNetOnline = true;

      // 2. Cancelled response & SIGN_IN_CANCELLED error code
      mockGoogleSignInBehavior = async () => ({ type: 'cancelled', data: null });
      const cancelledRes = await signInWithGoogleAccount();
      expect(cancelledRes.status).toBe('cancelled');

      mockGoogleSignInBehavior = async () => {
        throw { code: 'SIGN_IN_CANCELLED', message: 'User cancelled' };
      };
      const cancelledErrRes = await signInWithGoogleAccount();
      expect(cancelledErrRes.status).toBe('cancelled');

      // 3. Play Services unavailable & DEVELOPER_ERROR (code 10)
      mockGoogleHasPlayServices = async () => {
        throw { code: 'PLAY_SERVICES_NOT_AVAILABLE', message: 'Missing Play Services' };
      };
      const playErr = await signInWithGoogleAccount();
      expect(playErr.status).toBe('error');
      mockGoogleHasPlayServices = async () => true;

      mockGoogleSignInBehavior = async () => {
        throw { code: '10', message: 'DEVELOPER_ERROR' };
      };
      const devErr = await signInWithGoogleAccount();
      expect(devErr.status).toBe('error');
      if (devErr.status === 'error') {
        expect(devErr.message).toContain('DEVELOPER_ERROR');
      }

      // 4. Missing ID token, malformed JWT, and unexpected nonce claim
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: { idToken: null, user: { email: 'user@example.com' } },
      });
      const noTokenRes = await signInWithGoogleAccount();
      expect(noTokenRes.status).toBe('error');

      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: { idToken: 'not-a-jwt', user: { email: 'user@example.com' } },
      });
      const malformedRes = await signInWithGoogleAccount();
      expect(malformedRes.status).toBe('error');

      const nonceToken = createUnsignedTestJwt({
        sub: 'google-sub-1',
        nonce: 'unexpected-nonce',
      });
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: { idToken: nonceToken, user: { email: 'user@example.com' } },
      });
      const unexpectedNonceRes = await signInWithGoogleAccount();
      expect(unexpectedNonceRes.status).toBe('error');

      // 5. Session persistence failure returns explicit error
      const validIdToken = createUnsignedTestJwt({
        sub: 'google-sub-1',
        email: 'alice@example.com',
        aud: '123456-abc.apps.googleusercontent.com',
      });
      remoteState.signInWithIdTokenHandler = async ({ provider, token }) => {
        expect(provider).toBe('google');
        expect(token).toBe(validIdToken);
        const user = {
          id: 'user-auth-1',
          email: 'alice@example.com',
          user_metadata: {
            full_name: 'Alice BinRo',
            avatar_url: 'https://example.com/alice.png',
          },
        };
        return {
          data: {
            user,
            session: { access_token: 'mock-session-access', user },
          },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: validIdToken,
          user: {
            email: 'alice@example.com',
            name: 'Alice BinRo',
            photo: 'https://example.com/alice.png',
          },
        },
      });

      remoteState.simulateSessionPersistFailure = true;
      const persistFailRes = await signInWithGoogleAccount();
      expect(persistFailRes.status).toBe('error');
      remoteState.simulateSessionPersistFailure = false;

      // 6. Full success: GoogleSignin configured with webClientId, session verified & persisted
      const successRes = await signInWithGoogleAccount();
      expect(successRes.status).toBe('success');
      if (successRes.status === 'success') {
        expect(successRes.profile.userId).toBe('user-auth-1');
        expect(successRes.profile.email).toBe('alice@example.com');
      }

      const lastConfig = mockGoogleConfigCalls[mockGoogleConfigCalls.length - 1];
      expect(lastConfig?.webClientId).toBe('123456-abc.apps.googleusercontent.com');
      expect(lastConfig?.offlineAccess).toBe(false);
      expect(remoteState.sessionUser?.id).toBe('user-auth-1');

      // 7. Sign-out calls both GoogleSignin.signOut and Supabase local signOut
      await signOutGoogleAndSupabase();
      expect(mockGoogleSignOutCount).toBe(1);
      expect(remoteState.sessionUser).toBeNull();
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

  test('media path validation & mediaSyncService deduplicate uploads and handle deletes', async () => {
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

    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';

    try {
      const sampleBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
      mockFiles.set('/mockdoc/binro_images/payment_methods/img1.png', sampleBytes);
      mockFiles.set('/mockdoc/binro_images/categories/img2.png', sampleBytes);

      const pm = await repositories.paymentMethods.create({
        name: 'Gold Card',
        icon: 'card',
        imageUri: 'binro_images/payment_methods/img1.png',
      });
      const cat = await repositories.categories.create({
        name: 'CustomCat',
        type: 'expense',
        icon: 'pricetag',
        color: '#059669',
        imageUri: 'binro_images/categories/img2.png',
      });

      await syncPendingMediaForUser('user-media-1', repositories.sync);

      // Identical SHA-256 content only uploads ONCE and deduplicates remote_path
      expect(remoteState.uploadCount).toBe(1);
      const pmMap = await repositories.sync.getMediaMapByLocalPath(pm.imageUri!);
      const catMap = await repositories.sync.getMediaMapByLocalPath(cat.imageUri!);
      expect(pmMap?.sync_state).toBe('synced');
      expect(pmMap?.remote_path).toBeTruthy();
      expect(catMap?.remote_path).toBe(pmMap?.remote_path);

      // Removing PM image keeps remote object while Category still references it
      await repositories.paymentMethods.update(pm.id, { imageUri: null });
      await syncPendingMediaForUser('user-media-1', repositories.sync);
      expect(remoteState.removedPaths.length).toBe(0);

      // Removing Category image finally removes the storage object
      await repositories.categories.update(cat.id, { imageUri: null });
      await syncPendingMediaForUser('user-media-1', repositories.sync);
      expect(remoteState.removedPaths.length).toBe(1);
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
    }
  });

  test('syncEngine links workspace, pushes/pulls, retries outbox with backoff, and isolates A -> B -> A accounts', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';

    try {
      // 1. Offline local workspace created before signing in as User A
      const pmA = await repositories.paymentMethods.create({
        name: 'Alice Card',
        icon: 'card',
      });
      const tagA = await repositories.tags.create({ name: 'Travel', color: '#10B981' });
      const txA = await repositories.transactions.create({
        type: 'expense',
        title: 'Flight',
        amountMinor: 45000,
        currencyCode: 'INR',
        categoryId: 'cat-exp-food',
        categoryNameSnapshot: 'Food & Drink',
        paymentMethodId: pmA.id,
        paymentMethod: pmA.name,
        tagIds: [tagA.id],
        transactionDate: '2026-11-25',
      });

      const linkRes = await linkLocalWorkspaceToUser({
        userId: 'user-A',
        email: 'a@example.com',
      });
      expect(linkRes.status).toBe('synced');
      expect(linkRes.pushedCount).toBeGreaterThan(0);

      const syncStateA = await repositories.sync.getSyncState();
      expect(syncStateA.linkedUserId).toBe('user-A');
      expect(syncStateA.migrationCompletedAt).toBeTruthy();
      expect(await repositories.sync.getPendingOutboxCount('user-A')).toBe(0);
      expect(
        remoteState.tables.transactions.some((r) => r.user_id === 'user-A' && r.id === txA.id),
      ).toBe(true);

      // 2. Simulate User B remote cloud data + account mismatch check + account switch
      const bStamp = '2026-11-25T15:00:00.000Z';
      remoteState.tables.transactions.push({
        user_id: 'user-B',
        id: 'tx-cloud-B',
        type: 'income',
        title: 'Bob Salary',
        amount_minor: 80000,
        currency_code: 'USD',
        category_id: 'cat-inc-salary',
        category_name_snapshot: 'Salary',
        payment_method_id: 'pm-upi',
        payment_method: 'UPI',
        transaction_date: '2026-11-25',
        note: null,
        deleted_at: null,
        created_at: bStamp,
        updated_at: bStamp,
        server_updated_at: bStamp,
      });

      const mismatchCheck = await inspectAccountLinkState('user-B');
      expect(mismatchCheck.status).toBe('account_mismatch');

      const switchToB = await switchWorkspaceAccountAndSync({
        userId: 'user-B',
        email: 'b@example.com',
      });
      expect(switchToB.status).toBe('synced');
      const localAfterSwitchToB = await repositories.transactions.getAll();
      expect(localAfterSwitchToB.map((t) => t.id)).toEqual(['tx-cloud-B']);
      expect(await repositories.sync.getPendingOutboxCount('user-A')).toBe(0);

      // 3. Switch back to User A -> User B data cleared, User A cloud data restored cleanly
      const switchBackToA = await switchWorkspaceAccountAndSync({
        userId: 'user-A',
        email: 'a@example.com',
      });
      expect(switchBackToA.status).toBe('synced');
      const localAfterBackToA = await repositories.transactions.getAll();
      expect(localAfterBackToA.some((t) => t.id === txA.id)).toBe(true);
      expect(localAfterBackToA.some((t) => t.id === 'tx-cloud-B')).toBe(false);

      // 4. Outbox failure applies exponential backoff without blocking local transactions
      await repositories.transactions.create({
        type: 'expense',
        title: 'Offline Coffee',
        amountMinor: 350,
        currencyCode: 'INR',
        categoryId: 'cat-exp-food',
        categoryNameSnapshot: 'Food & Drink',
        paymentMethodId: 'pm-upi',
        paymentMethod: 'UPI',
        transactionDate: '2026-11-26',
      });
      remoteState.nextUpsertErrorTable = 'transactions';
      const failedSync = await runSyncCycle('user-A');
      expect(failedSync.status).toBe('error');
      remoteState.nextUpsertErrorTable = null;

      const failedRow = await activeTestDb?.getFirstAsync<{
        status: string;
        retry_count: number;
        next_retry_at: string | null;
      }>("SELECT status, retry_count, next_retry_at FROM sync_outbox WHERE entity_type = 'transaction' LIMIT 1");
      expect(failedRow?.status).toBe('failed');
      expect(failedRow?.retry_count).toBe(1);
      expect(failedRow?.next_retry_at).toBeTruthy();
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
    }
  });

  test('sanitizeAnalyticsMetadata and trackAnalyticsEvent never emit private finance fields or PII', async () => {
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

    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';

    try {
      await trackAnalyticsEvent('transaction_created', {
        tx_type: 'expense',
        currency_code: 'INR',
        amountMinor: 9999,
        title: 'Private Coffee',
      });
      expect(remoteState.analyticsInserts.length).toBe(1);
      const inserted = remoteState.analyticsInserts[0];
      expect(inserted.event_name).toBe('transaction_created');
      expect(typeof inserted.anonymous_install_id).toBe('string');
      expect(inserted.metadata).toEqual({ tx_type: 'expense', currency_code: 'INR' });
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
    }
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
        status: 'inactive',
      }),
    ).toBe(false);
  });

  test('V5 backup validation accepts PM images, profile fields, and valid mediaAssets while rejecting traversal/invalid values', () => {
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
      mediaAssets: {
        'binro_images/payment_methods/c1.jpg': {
          mimeType: 'image/jpeg',
          base64: 'AQIDBA==',
        },
      },
    });
    expect(validV5.valid).toBe(true);

    const badAssetPath = validateBackupPayload({
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
      },
      categories: [],
      tags: [],
      paymentMethods: [],
      budgets: [],
      transactions: [],
      mediaAssets: {
        '../evil/path.jpg': {
          mimeType: 'image/jpeg',
          base64: 'AQIDBA==',
        },
      },
    });
    expect(badAssetPath.valid).toBe(false);

    const invalidGender = validateBackupPayload({
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
    expect(invalidGender.valid).toBe(false);
  });

  test('SQLite sync repository isolates User A vs User B accounts cleanly and converges remote bundles', async () => {
    const db = createBunSqliteAdapter();
    await runMigrations(db);
    const repos = createRepositories(async () => db);

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

    await repos.sync.updateSyncState({
      linkedUserId: 'user-A',
      linkedUserEmail: 'a@example.com',
      syncStatus: 'idle',
    });
    await repos.sync.enqueueFullWorkspaceForMigration('user-A');
    const outboxA = await repos.sync.getPendingOutbox('user-A', 200);
    expect(
      outboxA.some((item) => item.entity_type === 'transaction' && item.entity_id === tx.id),
    ).toBe(true);
    expect(
      outboxA.some((item) => item.entity_type === 'payment_method' && item.entity_id === pm.id),
    ).toBe(true);

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

    await repos.sync.applyRemoteBundle({
      categories: [],
      paymentMethods: [
        {
          ...pmB!,
          imageUri: null,
          deletedAt: null,
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

  test('Static security audit & Supabase SQL RLS/Storage/Schema verification', () => {
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

    const schemaSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/001_initial_schema.sql'),
      'utf8',
    );
    const rlsSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/002_rls_and_storage.sql'),
      'utf8',
    );
    const analyticsSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/003_analytics_and_entitlements.sql'),
      'utf8',
    );

    const syncedTables = [
      'profiles',
      'user_settings',
      'categories',
      'payment_methods',
      'tags',
      'transactions',
      'transaction_tags',
      'budgets',
    ];
    for (const table of syncedTables) {
      expect(schemaSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(rlsSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(rlsSql).toContain(`ON public.${table}`);
      expect(rlsSql).toContain('FOR SELECT TO authenticated');
      expect(rlsSql).toContain('FOR INSERT TO authenticated');
      expect(rlsSql).toContain('FOR UPDATE TO authenticated');
      expect(rlsSql).toContain('FOR DELETE TO authenticated');
    }
    expect(schemaSql).not.toContain('CREATE TABLE IF NOT EXISTS public.accounts');
    expect(rlsSql).toContain("'binro-media'");
    expect(rlsSql).toContain('FALSE');
    expect(rlsSql).toContain('(storage.foldername(name))[1] = (SELECT auth.uid())::text');

    expect(analyticsSql).toContain('CREATE TABLE IF NOT EXISTS public.analytics_events');
    expect(analyticsSql).toContain('REVOKE ALL ON public.analytics_events FROM anon, authenticated');
    expect(analyticsSql).toContain('GRANT INSERT ON public.analytics_events TO anon, authenticated');
    expect(analyticsSql).toContain('REVOKE ALL ON SCHEMA internal_analytics FROM PUBLIC, anon, authenticated');
    expect(analyticsSql).toContain('CREATE TABLE IF NOT EXISTS public.user_entitlements');
    expect(analyticsSql).toContain('GRANT SELECT ON public.user_entitlements TO authenticated');
  });

  test('Android R8 config, Welcome screen copy, and AppButton non-darkening loading checks', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'app.json'), 'utf8'),
    ) as {
      expo: {
        android?: { package?: string };
        plugins?: (string | [string, Record<string, unknown>])[];
      };
    };

    expect(appJson.expo.android?.package).toBe('com.binro.finance');
    const pluginNames = (appJson.expo.plugins ?? []).map((p) =>
      Array.isArray(p) ? p[0] : p,
    );
    expect(pluginNames).toContain('@react-native-google-signin/google-signin');
    expect(pluginNames).not.toContain('react-native-nitro-google-signin');

    const buildPropsEntry = (appJson.expo.plugins ?? []).find(
      (p): p is [string, { android?: Record<string, unknown> }] =>
        Array.isArray(p) && p[0] === 'expo-build-properties',
    );
    expect(buildPropsEntry).toBeDefined();
    expect(buildPropsEntry?.[1]?.android?.enableMinifyInReleaseBuilds).toBe(true);
    expect(buildPropsEntry?.[1]?.android?.enableShrinkResourcesInReleaseBuilds).toBe(true);
    const proguard = String(buildPropsEntry?.[1]?.android?.extraProguardRules ?? '');
    expect(proguard).toContain('com.reactnativegooglesignin.**');
    expect(proguard).not.toContain('-keep class ** { *; }');

    const pkgJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkgJson.dependencies['@react-native-google-signin/google-signin']).toBeDefined();
    expect(pkgJson.dependencies['react-native-nitro-google-signin']).toBeUndefined();
    expect(pkgJson.dependencies['react-native-nitro-modules']).toBeUndefined();

    const onboardingSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/onboarding/index.tsx'),
      'utf8',
    );
    expect(onboardingSource).not.toContain(
      'You can add an opening balance or pick any currency per transaction anytime in Settings.',
    );
    expect(onboardingSource).toContain('Get Started');
    expect(onboardingSource).toContain('Continue with Google');
    expect(onboardingSource).toContain('/currency?mode=onboarding');
    expect(onboardingSource).toContain('preserveAppearanceWhenDisabled');

    const appButtonSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/AppButton.tsx'),
      'utf8',
    );
    expect(appButtonSource).toContain('shouldDimForDisabled = disabled && !loading && !preserveAppearanceWhenDisabled');
    expect(appButtonSource).toContain('{loading ? <ActivityIndicator size="small" color={palette.text} /> : icon}');
  });

  test('useAppStore.signInWithGoogle updates authUser, links workspace, completes safely, and recovers from errors without leaving authBusy stuck', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      authUser: null,
      authBusy: false,
      accountSwitchConflict: null,
    });

    try {
      await useAppStore.getState().initializeApp();
      expect(useAppStore.getState().isInitialized).toBe(true);

      // 1. Store error handling resets authBusy cleanly and returns structured error
      mockGoogleSignInBehavior = async () => {
        throw { code: '7', message: 'NETWORK_ERROR' };
      };
      const failRes = await useAppStore.getState().signInWithGoogle();
      expect(failRes.status).toBe('error');
      expect(useAppStore.getState().authBusy).toBe(false);
      expect(useAppStore.getState().authUser).toBeNull();

      // 2. Concurrent invocation while authBusy=true is ignored safely
      useAppStore.setState({ authBusy: true });
      const busyRes = await useAppStore.getState().signInWithGoogle();
      expect(busyRes.status).toBe('error');
      useAppStore.setState({ authBusy: false });

      // 3. Successful store sign-in updates authUser, syncState, and allows onboarding completion
      const validJwt = createUnsignedTestJwt({
        sub: 'google-store-1',
        email: 'storeuser@example.com',
      });
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-store-1',
          email: 'storeuser@example.com',
          user_metadata: { full_name: 'Store User' },
        };
        return {
          data: { user, session: { access_token: 'store-access', user } },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: validJwt,
          user: { email: 'storeuser@example.com', name: 'Store User', photo: null },
        },
      });

      const okRes = await useAppStore.getState().signInWithGoogle();
      expect(okRes.status).toBe('success');
      expect(useAppStore.getState().authBusy).toBe(false);
      expect(useAppStore.getState().authUser?.userId).toBe('user-store-1');
      expect(useAppStore.getState().syncState.linkedUserId).toBe('user-store-1');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('Sign-in notifications: new account welcomes once, session restore stays silent, and returning sign-in emits signed-in notice', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      authUser: null,
      authBusy: false,
      accountSwitchConflict: null,
    });

    try {
      await useAppStore.getState().initializeApp();

      const validJwt = createUnsignedTestJwt({
        sub: 'google-notif-1',
        email: 'fresh@example.com',
      });
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-notif-1',
          email: 'fresh@example.com',
          created_at: '2026-11-26T10:00:00.000Z',
          last_sign_in_at: '2026-11-26T10:00:01.000Z',
          user_metadata: { full_name: 'Fresh User' },
        };
        return {
          data: { user, session: { access_token: 'tok-1', user } },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: validJwt,
          user: { email: 'fresh@example.com', name: 'Fresh User', photo: null },
        },
      });

      // 1. First sign-in of brand-new account -> exactly 1 Welcome notification
      const firstSignIn = await useAppStore.getState().signInWithGoogle();
      expect(firstSignIn.status).toBe('success');
      let notifs = useAppStore.getState().notifications;
      expect(notifs.filter((n) => n.title === 'Welcome to BinRo Finance').length).toBe(1);
      expect(notifs[0].body).toBe('Your account is ready. Start managing your money with clarity.');
      expect(notifs[0].metadataJson).toBe('account_welcome:user-notif-1');

      // 2. Automatic session restore / token refresh must NOT emit any notification
      await useAppStore.getState().applySignedInSession(
        {
          userId: 'user-notif-1',
          email: 'fresh@example.com',
          googleName: 'Fresh User',
          googleAvatarUrl: null,
        },
        { source: 'session_restore' },
      );
      expect(useAppStore.getState().notifications.length).toBe(1);

      // 3. Sign out + explicit sign back in -> emits "Signed in successfully", never duplicates Welcome
      await useAppStore.getState().signOutCloud();
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-notif-1',
          email: 'fresh@example.com',
          created_at: '2026-11-26T10:00:00.000Z',
          last_sign_in_at: '2026-11-26T12:00:00.000Z',
          user_metadata: { full_name: 'Fresh User' },
        };
        return {
          data: { user, session: { access_token: 'tok-2', user } },
          error: null,
        };
      };
      const secondSignIn = await useAppStore.getState().signInWithGoogle();
      expect(secondSignIn.status).toBe('success');
      notifs = useAppStore.getState().notifications;
      expect(notifs.filter((n) => n.title === 'Welcome to BinRo Finance').length).toBe(1);
      expect(notifs.filter((n) => n.title === 'Signed in successfully').length).toBe(1);
      expect(notifs[0].title).toBe('Signed in successfully');
      expect(notifs[0].body).toBe("You're back in BinRo Finance.");

      // 4. Switching to another existing account: canceled switch emits nothing; confirmed switch emits Signed in successfully
      remoteState.tables.profiles.push({
        user_id: 'user-existing-2',
        display_name: 'Existing Two',
        updated_at: '2026-11-20T00:00:00.000Z',
        server_updated_at: '2026-11-20T00:00:00.000Z',
      });
      const existingJwt = createUnsignedTestJwt({
        sub: 'google-existing-2',
        email: 'existing2@example.com',
      });
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-existing-2',
          email: 'existing2@example.com',
          created_at: '2026-11-01T00:00:00.000Z',
          last_sign_in_at: '2026-11-26T12:05:00.000Z',
          user_metadata: { full_name: 'Existing Two' },
        };
        return {
          data: { user, session: { access_token: 'tok-3', user } },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: existingJwt,
          user: { email: 'existing2@example.com', name: 'Existing Two', photo: null },
        },
      });

      await useAppStore.getState().signInWithGoogle();
      expect(useAppStore.getState().accountSwitchConflict?.newProfile.userId).toBe('user-existing-2');
      // Still no notification emitted for user-existing-2 before confirmation
      expect(useAppStore.getState().notifications.length).toBe(2);

      await useAppStore.getState().cancelAccountSwitch();
      expect(useAppStore.getState().notifications.length).toBe(2);

      await useAppStore.getState().signInWithGoogle();
      expect(useAppStore.getState().accountSwitchConflict?.newProfile.userId).toBe('user-existing-2');
      await useAppStore.getState().confirmAccountSwitchReplace();
      const postSwitchNotifs = useAppStore.getState().notifications;
      expect(postSwitchNotifs.length).toBe(1);
      expect(postSwitchNotifs[0].title).toBe('Signed in successfully');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('deleteAccountAndData deletes remote storage/account via RPC and RLS fallback, plus wipes local workspace', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      authUser: null,
      authBusy: false,
      accountSwitchConflict: null,
    });

    try {
      await useAppStore.getState().initializeApp();
      const validJwt = createUnsignedTestJwt({
        sub: 'google-del-1',
        email: 'delete@example.com',
      });
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-del-1',
          email: 'delete@example.com',
          user_metadata: { full_name: 'Delete User' },
        };
        return {
          data: { user, session: { access_token: 'tok-del', user } },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: validJwt,
          user: { email: 'delete@example.com', name: 'Delete User', photo: null },
        },
      });

      await useAppStore.getState().signInWithGoogle();
      remoteState.storage.set('user-del-1/profile/avatar.jpg', {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
      });
      await useAppStore.getState().updateSettings({
        profileName: 'To Delete',
        gender: 'non_binary',
      });
      // Omitting gender preserves existing stored gender cleanly
      await useAppStore.getState().updateSettings({
        profileName: 'Still Preserved',
      });
      expect(useAppStore.getState().settings.gender).toBe('non_binary');

      // Delete via RPC
      await useAppStore.getState().deleteAccountAndData();
      expect(remoteState.deleteRpcCalls).toBe(1);
      expect(remoteState.storage.has('user-del-1/profile/avatar.jpg')).toBe(false);
      expect(remoteState.tables.profiles.some((r) => r.user_id === 'user-del-1')).toBe(false);
      expect(useAppStore.getState().authUser).toBeNull();
      expect(useAppStore.getState().syncState.linkedUserId).toBeNull();
      expect(useAppStore.getState().settings.profileName).toBeNull();
      expect(useAppStore.getState().notifications.length).toBe(0);

      // Re-sign in and verify RLS fallback when delete_own_account RPC is not deployed yet
      remoteState.simulateMissingDeleteRpc = true;
      await useAppStore.getState().signInWithGoogle();
      expect(remoteState.tables.profiles.some((r) => r.user_id === 'user-del-1')).toBe(true);
      await useAppStore.getState().deleteAccountAndData();
      expect(remoteState.tables.profiles.some((r) => r.user_id === 'user-del-1')).toBe(false);
      expect(remoteState.tables.user_settings.some((r) => r.user_id === 'user-del-1')).toBe(false);
      expect(useAppStore.getState().authUser).toBeNull();
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('Profile, DOB picker, Privacy Policy, About, and Account Deletion screens satisfy structural refinements', () => {
    const completeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/profile/complete.tsx'),
      'utf8',
    );
    expect(completeSource).not.toContain('(Optional)');
    expect(completeSource).not.toContain('Non-binary');
    expect(completeSource).not.toContain("'other'");
    expect(completeSource).toContain('SELECTABLE_GENDER_OPTIONS');
    expect(completeSource).toContain('DobPickerField');

    const profileSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/profile/index.tsx'),
      'utf8',
    );
    expect(profileSource).not.toContain('Using your Google photo by default');
    expect(profileSource).not.toContain('GENDER_OPTIONS');
    expect(profileSource).toContain('Add a note');
    expect(profileSource).toContain('isEditingBio');
    expect(profileSource).toContain('DobPickerField');

    const settingsSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(tabs)/settings.tsx'),
      'utf8',
    );
    expect(settingsSource).not.toContain('privacyModalVisible');
    expect(settingsSource).not.toContain('BinRo Finance Version');
    expect(settingsSource).toContain("router.push('/privacy-policy')");
    expect(settingsSource).toContain("router.push('/about')");

    const layoutSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/_layout.tsx'),
      'utf8',
    );
    expect(layoutSource).toContain('privacy-policy/index');
    expect(layoutSource).toContain('about/index');
    expect(layoutSource).toContain("source: 'session_restore'");

    const deletionSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/004_account_deletion.sql'),
      'utf8',
    );
    expect(deletionSql).toContain('CREATE OR REPLACE FUNCTION public.delete_own_account()');
    expect(deletionSql).toContain('GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated');
  });

  test('Category picker helper includes all active categories without truncation and modal maxHeight adapts to screen and keyboard', () => {
    const now = '2026-11-26T00:00:00.000Z';
    const categories: Category[] = [];
    for (let i = 1; i <= 25; i++) {
      const parentId = `cat-p-${String(i).padStart(2, '0')}`;
      categories.push({
        id: parentId,
        name: `Parent ${String(i).padStart(2, '0')}`,
        type: 'expense',
        color: '#10B981',
        icon: 'pricetag',
        imageUri: null,
        parentId: null,
        isDefault: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
      categories.push({
        id: `cat-c-${String(i).padStart(2, '0')}`,
        name: `Child ${String(i).padStart(2, '0')}`,
        type: 'expense',
        color: '#10B981',
        icon: 'pricetag',
        imageUri: null,
        parentId,
        isDefault: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    categories.push({
      id: 'cat-archived-selected',
      name: 'Archived Selected',
      type: 'expense',
      color: '#64748B',
      icon: 'archive',
      imageUri: null,
      parentId: null,
      isDefault: false,
      isArchived: true,
      createdAt: now,
      updatedAt: now,
    });
    categories.push({
      id: 'cat-archived-hidden',
      name: 'Archived Hidden',
      type: 'expense',
      color: '#64748B',
      icon: 'archive',
      imageUri: null,
      parentId: null,
      isDefault: false,
      isArchived: true,
      createdAt: now,
      updatedAt: now,
    });
    categories.push({
      id: 'cat-income-1',
      name: 'Salary',
      type: 'income',
      color: '#16A34A',
      icon: 'cash',
      imageUri: null,
      parentId: null,
      isDefault: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    const allExpenseItems = buildCategoryPickerItems({
      categories,
      type: 'expense',
      selectedId: 'cat-archived-selected',
      search: '',
    });
    expect(allExpenseItems.length).toBe(51);
    expect(allExpenseItems[0]?.category.name).toBe('Archived Selected');
    expect(allExpenseItems[1]?.category.name).toBe('Parent 01');
    expect(allExpenseItems[2]?.category.name).toBe('Child 01');
    expect(allExpenseItems[2]?.parentName).toBe('Parent 01');
    expect(allExpenseItems[allExpenseItems.length - 1]?.category.name).toBe('Child 25');
    expect(allExpenseItems.some((item) => item.category.id === 'cat-archived-hidden')).toBe(
      false,
    );

    const searchByParent = buildCategoryPickerItems({
      categories,
      type: 'expense',
      selectedId: null,
      search: 'Parent 25',
    });
    expect(searchByParent.map((i) => i.category.id)).toEqual(['cat-p-25', 'cat-c-25']);

    const smallScreen = computeModalCardMaxHeight({
      windowHeight: 560,
      topInset: 24,
      keyboardHeight: 0,
      variant: 'sheet',
    });
    const smallWithKeyboard = computeModalCardMaxHeight({
      windowHeight: 560,
      topInset: 24,
      keyboardHeight: 280,
      variant: 'sheet',
    });
    const normalScreen = computeModalCardMaxHeight({
      windowHeight: 820,
      topInset: 36,
      keyboardHeight: 0,
      variant: 'sheet',
    });
    expect(smallScreen < 560).toBe(true);
    expect(smallWithKeyboard < smallScreen).toBe(true);
    expect(smallWithKeyboard >= 200).toBe(true);
    expect(normalScreen < 820).toBe(true);
  });

  test('Final UX pass: Google G SVG branding, scrollable modals, Welcome/Home/Settings/Account/Danger Zone integrity', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const sourceFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          sourceFiles.push(full);
        }
      }
    };
    walk(srcRoot);

    for (const file of sourceFiles) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text.includes('logo-google')).toBe(false);
    }

    const googleBtnSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/GoogleSignInButton.tsx'),
      'utf8',
    );
    expect(googleBtnSrc).toContain('#4285F4');
    expect(googleBtnSrc).toContain('#34A853');
    expect(googleBtnSrc).toContain('#FBBC05');
    expect(googleBtnSrc).toContain('#EA4335');

    const bottomSheetSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/BottomSheetModal.tsx'),
      'utf8',
    );
    expect(bottomSheetSrc).toContain("overflow: 'hidden'");
    expect(bottomSheetSrc).toContain('flexShrink: 1');
    expect(bottomSheetSrc).not.toContain('innerPressable');

    const categoryModalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/forms/CategoryPickerModal.tsx'),
      'utf8',
    );
    expect(categoryModalSrc).toContain('nestedScrollEnabled');
    expect(categoryModalSrc).toContain('flexShrink: 1');

    const onboardingSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/onboarding/index.tsx'),
      'utf8',
    );
    expect(onboardingSrc).toContain('Skip');
    expect(onboardingSrc).toContain("@/assets/images/icon.png");
    expect(onboardingSrc).toContain('BinRo Finance');
    expect(onboardingSrc).toContain('Default Currency');
    expect(onboardingSrc).toContain('Opening Balance');
    expect(onboardingSrc).toContain('Get Started');
    expect(onboardingSrc).toContain('GoogleSignInButton');
    expect(onboardingSrc).toContain('keyboardAvoiding');
    expect(onboardingSrc).not.toContain('Optional');
    expect(onboardingSrc).not.toContain('Welcome 👋');
    expect(onboardingSrc).not.toContain('ABSTRACT_BAR_GROUPS');
    expect(onboardingSrc).not.toContain('FEATURE_HIGHLIGHTS');
    expect(onboardingSrc).not.toContain('Private offline-first ledger');
    expect(onboardingSrc).not.toContain('Works offline immediately without an account.');

    const homeSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(tabs)/index.tsx'),
      'utf8',
    );
    expect(homeSrc).toContain('SignInReminderCard');
    expect(homeSrc).toContain('!authUser && !homeSignInReminderDismissed');

    const transactionsSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(tabs)/transactions.tsx'),
      'utf8',
    );
    expect(transactionsSrc).toContain('SignInReminderCard');
    expect(transactionsSrc).toContain('injectTransactionsSignInReminder');
    expect(transactionsSrc).toContain('!authUser && !transactionsSignInReminderDismissed');

    const reminderCardSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/SignInReminderCard.tsx'),
      'utf8',
    );
    expect(reminderCardSrc).toContain('Sync your data');
    expect(reminderCardSrc).toContain('Sign in with Google to connect your account.');
    expect(reminderCardSrc).toContain('GoogleSignInButton');

    const settingsSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(tabs)/settings.tsx'),
      'utf8',
    );
    expect(settingsSrc).toContain('Sign in with Google');
    expect(settingsSrc).toContain('GoogleSignInButton');
    expect(settingsSrc).toContain('Google account connected');

    const accountSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/account/index.tsx'),
      'utf8',
    );
    expect(accountSrc).toContain('On-device data');
    expect(accountSrc).toContain('useState(false)');
    expect(accountSrc).toContain("router.push('/account/danger-zone')");
    expect(accountSrc).toContain('GoogleSignInButton');
    expect(accountSrc).not.toContain('Stored locally on this device in SQLite');
    expect(accountSrc).not.toContain('Clear All Local Data');
    expect(accountSrc).not.toContain('Delete Account');

    const completeProfileSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/profile/complete.tsx'),
      'utf8',
    );
    expect(completeProfileSrc).toContain('evaluateProfileCompletion');
    expect(completeProfileSrc).toContain('completion.missingGender');
    expect(completeProfileSrc).toContain('completion.missingDateOfBirth');
    expect(completeProfileSrc).not.toContain('Optional');

    const dangerZoneSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/account/danger-zone.tsx'),
      'utf8',
    );
    expect(dangerZoneSrc).toContain('Clear All Local Data');
    expect(dangerZoneSrc).toContain('Delete Account');
    expect(dangerZoneSrc).toContain("DELETE_CONFIRM_KEYWORD = 'DELETE'");
    expect(dangerZoneSrc).toContain('clearAllLocalData');
    expect(dangerZoneSrc).toContain('deleteAccountAndData');

    const layoutSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/_layout.tsx'),
      'utf8',
    );
    expect(layoutSrc).toContain('account/danger-zone');
    expect(layoutSrc).toContain('shouldPromptProfileCompletion');
  });

  test('evaluateProfileCompletion & reconcileLocalAndRemoteProfile handle all returning-user cases without overwriting saved data', () => {
    const baseSettings: AppSettings = {
      id: 1,
      currencyCode: 'INR',
      openingBalanceMinor: 0,
      openingBalanceCurrencyCode: 'INR',
      theme: 'system',
      dateFormat: 'DD MMM YYYY',
      onboardingCompleted: true,
      profileName: null,
      profileBio: null,
      profileAvatar: null,
      currencyInitialized: true,
      showHomeBudgetShortcut: false,
      gender: null,
      dateOfBirth: null,
      googleName: null,
      googleEmail: null,
      googleAvatarUrl: null,
      profileCompletedAt: null,
      updatedAt: '2026-11-26T00:00:00.000Z',
    };

    // Case A: Both gender and DOB already saved -> never prompt again even if profileCompletedAt is null
    const caseA = evaluateProfileCompletion({
      gender: 'female',
      dateOfBirth: '1997-04-12',
      profileCompletedAt: null,
    });
    expect(caseA.missingGender).toBe(false);
    expect(caseA.missingDateOfBirth).toBe(false);
    expect(caseA.needsPrompt).toBe(false);
    expect(
      shouldPromptProfileCompletion({
        gender: 'female',
        dateOfBirth: '1997-04-12',
        profileCompletedAt: null,
      }),
    ).toBe(false);

    // Case B: Gender saved, DOB missing -> ask ONLY for DOB
    const caseB = evaluateProfileCompletion({
      gender: 'male',
      dateOfBirth: null,
      profileCompletedAt: null,
    });
    expect(caseB.missingGender).toBe(false);
    expect(caseB.missingDateOfBirth).toBe(true);
    expect(caseB.needsPrompt).toBe(true);

    // Case C: DOB saved, Gender missing (or obsolete 'other' mapped safely to unset) -> ask ONLY for Gender
    const caseC = evaluateProfileCompletion({
      gender: 'other',
      dateOfBirth: '1995-08-19',
      profileCompletedAt: null,
    });
    expect(caseC.missingGender).toBe(true);
    expect(caseC.missingDateOfBirth).toBe(false);
    expect(caseC.needsPrompt).toBe(true);

    // Case D: Neither saved & never skipped -> show both
    const caseD = evaluateProfileCompletion({
      gender: null,
      dateOfBirth: null,
      profileCompletedAt: null,
    });
    expect(caseD.missingGender).toBe(true);
    expect(caseD.missingDateOfBirth).toBe(true);
    expect(caseD.needsPrompt).toBe(true);

    // Case E: Previously skipped -> do not prompt again
    const caseE = evaluateProfileCompletion({
      gender: null,
      dateOfBirth: null,
      profileCompletedAt: '2026-11-20T09:00:00.000Z',
    });
    expect(caseE.needsPrompt).toBe(false);

    // Reconciliation restores remote saved fields into empty local settings,
    // and never lets blank Google metadata erase existing saved profile fields
    const hydratedPatch = reconcileLocalAndRemoteProfile({
      localSettings: baseSettings,
      remoteProfile: {
        profileName: 'Saved Cloud Name',
        profileBio: 'Budgeting daily',
        gender: 'prefer_not_to_say',
        dateOfBirth: '1993-11-05T00:00:00.000Z',
        googleName: 'Cloud Google Name',
        googleEmail: 'returning@example.com',
        googleAvatarUrl: 'https://example.com/a.jpg',
        profileCompletedAt: '2026-11-21T00:00:00.000Z',
      },
      authProfile: {
        email: 'returning@example.com',
        googleName: null,
        googleAvatarUrl: null,
      },
    });
    expect(hydratedPatch.profileName).toBe('Saved Cloud Name');
    expect(hydratedPatch.profileBio).toBe('Budgeting daily');
    expect(hydratedPatch.gender).toBe('prefer_not_to_say');
    expect(hydratedPatch.dateOfBirth).toBe('1993-11-05');
    expect(hydratedPatch.googleName).toBe('Cloud Google Name');
    expect(hydratedPatch.googleAvatarUrl).toBe('https://example.com/a.jpg');
    expect(hydratedPatch.profileCompletedAt).toBe('2026-11-21T00:00:00.000Z');

    const nonClobberPatch = reconcileLocalAndRemoteProfile({
      localSettings: {
        ...baseSettings,
        profileName: 'Local Custom',
        gender: 'male',
        dateOfBirth: '1990-01-15',
        googleName: 'Existing Google Name',
        googleAvatarUrl: 'https://example.com/existing.jpg',
      },
      remoteProfile: {
        profileName: null,
        profileBio: null,
        gender: null,
        dateOfBirth: null,
        googleName: null,
        googleEmail: null,
        googleAvatarUrl: null,
        profileCompletedAt: null,
      },
      authProfile: {
        email: '',
        googleName: null,
        googleAvatarUrl: null,
      },
    });
    expect(Object.keys(nonClobberPatch).length).toBe(0);
  });

  test('Returning user sign-in after fresh local reset restores cloud gender & DOB before pushing and does not re-prompt', async () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const prevGoogle = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcxyz.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_real_12345';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = '123456-abc.apps.googleusercontent.com';

    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      authUser: null,
      authBusy: false,
      accountSwitchConflict: null,
    });

    try {
      await useAppStore.getState().initializeApp();

      // Seed existing remote Supabase profile for returning user-ret-1
      remoteState.tables.profiles.push({
        user_id: 'user-ret-1',
        display_name: 'Returning User',
        bio: 'Saving steadily',
        avatar_remote_path: null,
        google_name: 'Returning Google',
        google_email: 'returning@example.com',
        google_avatar_url: 'https://example.com/ret.jpg',
        gender: 'female',
        date_of_birth: '1994-07-22',
        profile_completed_at: null,
        updated_at: '2026-11-20T10:00:00.000Z',
        server_updated_at: '2026-11-20T10:00:00.000Z',
      });

      const retJwt = createUnsignedTestJwt({
        sub: 'google-ret-1',
        email: 'returning@example.com',
      });
      remoteState.signInWithIdTokenHandler = async () => {
        const user = {
          id: 'user-ret-1',
          email: 'returning@example.com',
          created_at: '2026-11-01T00:00:00.000Z',
          last_sign_in_at: '2026-11-26T09:00:00.000Z',
          user_metadata: { full_name: 'Returning Google' },
        };
        return {
          data: { user, session: { access_token: 'ret-tok', user } },
          error: null,
        };
      };
      mockGoogleSignInBehavior = async () => ({
        type: 'success',
        data: {
          idToken: retJwt,
          user: { email: 'returning@example.com', name: null, photo: null },
        },
      });

      const res = await useAppStore.getState().signInWithGoogle();
      expect(res.status).toBe('success');

      const settings = useAppStore.getState().settings;
      expect(settings.gender).toBe('female');
      expect(settings.dateOfBirth).toBe('1994-07-22');
      expect(settings.googleAvatarUrl).toBe('https://example.com/ret.jpg');
      expect(shouldPromptProfileCompletion(settings)).toBe(false);

      // Verify remote Supabase row was NOT overwritten with nulls during initial link push
      const remoteRow = remoteState.tables.profiles.find((r) => r.user_id === 'user-ret-1');
      expect(remoteRow?.gender).toBe('female');
      expect(remoteRow?.date_of_birth).toBe('1994-07-22');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevKey;
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = prevGoogle;
    }
  });

  test('completeOnboarding saves explicit minor-unit opening balance and Skip/omitted preserves existing opening balance', async () => {
    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      authUser: null,
      authBusy: false,
      accountSwitchConflict: null,
    });
    await useAppStore.getState().initializeApp();

    // 1. Fresh install enters explicit opening balance
    await useAppStore.getState().completeOnboarding({
      currencyCode: 'INR',
      openingBalanceMinor: 25050,
    });
    let st = useAppStore.getState().settings;
    expect(st.onboardingCompleted).toBe(true);
    expect(st.currencyCode).toBe('INR');
    expect(st.openingBalanceMinor).toBe(25050);
    expect(st.openingBalanceCurrencyCode).toBe('INR');

    // 2. Skipping or omitting openingBalanceMinor preserves existing balance & currency
    await useAppStore.getState().completeOnboarding({
      currencyCode: 'EUR',
    });
    st = useAppStore.getState().settings;
    expect(st.currencyCode).toBe('EUR');
    expect(st.openingBalanceMinor).toBe(25050);
    expect(st.openingBalanceCurrencyCode).toBe('INR');
  });

  test('Transactions inline sign-in reminder respects threshold (>= 6), placement after 5th tx, sign-in hiding, and dismissal persistence', async () => {
    const makeTx = (index: number, date = '2026-11-26'): Transaction => ({
      id: `tx-${index}`,
      type: 'expense',
      title: `Tx ${index}`,
      amountMinor: 1000,
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food & Drink',
      paymentMethodId: 'pm-upi',
      paymentMethod: 'UPI',
      tagIds: [],
      transactionDate: date,
      note: null,
      createdAt: `2026-11-26T10:${String(index).padStart(2, '0')}:00.000Z`,
      updatedAt: `2026-11-26T10:${String(index).padStart(2, '0')}:00.000Z`,
    });

    // 1. Short list (5 transactions) -> NO reminder
    const shortSections = injectTransactionsSignInReminder(
      [
        {
          title: 'Today',
          date: '2026-11-26',
          dailyNets: [{ currencyCode: 'INR', netMinor: -5000 }],
          data: [makeTx(1), makeTx(2), makeTx(3), makeTx(4), makeTx(5)],
        },
      ],
      true,
    );
    expect(shortSections[0]?.data.some((item) => item.kind === 'signin_reminder')).toBe(false);

    // 2. Long list (7 transactions across 2 sections) -> 1 reminder after 5th tx
    const longSections = injectTransactionsSignInReminder(
      [
        {
          title: 'Today',
          date: '2026-11-26',
          dailyNets: [{ currencyCode: 'INR', netMinor: -3000 }],
          data: [makeTx(1), makeTx(2), makeTx(3)],
        },
        {
          title: 'Yesterday',
          date: '2026-11-25',
          dailyNets: [{ currencyCode: 'INR', netMinor: -4000 }],
          data: [
            makeTx(4, '2026-11-25'),
            makeTx(5, '2026-11-25'),
            makeTx(6, '2026-11-25'),
            makeTx(7, '2026-11-25'),
          ],
        },
      ],
      true,
    );
    expect(longSections[0]?.dailyNets[0]?.netMinor).toBe(-3000);
    expect(longSections[1]?.dailyNets[0]?.netMinor).toBe(-4000);
    expect(longSections[0]?.data.every((item) => item.kind === 'tx')).toBe(true);
    expect(longSections[1]?.data.map((item) => item.kind)).toEqual([
      'tx',
      'tx',
      'signin_reminder',
      'tx',
      'tx',
    ]);

    // 3. Signed in / dismissed -> NO reminder even for long list
    const hiddenSections = injectTransactionsSignInReminder(
      [
        {
          title: 'Today',
          date: '2026-11-26',
          dailyNets: [{ currencyCode: 'INR', netMinor: -6000 }],
          data: [makeTx(1), makeTx(2), makeTx(3), makeTx(4), makeTx(5), makeTx(6)],
        },
      ],
      false,
    );
    expect(hiddenSections.flatMap((s) => s.data).some((i) => i.kind === 'signin_reminder')).toBe(false);

    // 4. Dismissal flags persist across store re-initialization and reset on clearAllLocalData
    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      homeSignInReminderDismissed: false,
      transactionsSignInReminderDismissed: false,
    });
    await useAppStore.getState().initializeApp();
    expect(useAppStore.getState().homeSignInReminderDismissed).toBe(false);
    expect(useAppStore.getState().transactionsSignInReminderDismissed).toBe(false);

    await useAppStore.getState().dismissHomeSignInReminder();
    await useAppStore.getState().dismissTransactionsSignInReminder();
    expect(useAppStore.getState().homeSignInReminderDismissed).toBe(true);
    expect(useAppStore.getState().transactionsSignInReminderDismissed).toBe(true);

    // Simulate app restart
    useAppStore.setState({
      isInitialized: false,
      isLoading: false,
      homeSignInReminderDismissed: false,
      transactionsSignInReminderDismissed: false,
    });
    await useAppStore.getState().initializeApp();
    expect(useAppStore.getState().homeSignInReminderDismissed).toBe(true);
    expect(useAppStore.getState().transactionsSignInReminderDismissed).toBe(true);

    // Clear all local data resets dismissal flags cleanly
    await useAppStore.getState().clearAllLocalData();
    expect(useAppStore.getState().homeSignInReminderDismissed).toBe(false);
    expect(useAppStore.getState().transactionsSignInReminderDismissed).toBe(false);
  });
});




