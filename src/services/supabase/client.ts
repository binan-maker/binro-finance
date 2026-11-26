import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { getPublicEnvConfig, isSupabaseConfigured } from './config';

const SECURE_AES_KEY_STORAGE_NAME = 'binro_supabase_aes_key_v1';
const CIPHER_PREFIX = 'v1:';

function bytesToHex(bytes: Uint8Array): string {
  return aesjs.utils.hex.fromBytes(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  return aesjs.utils.hex.toBytes(hex);
}

async function getOrCreateAesKeyBytes(): Promise<Uint8Array> {
  const existingHex = await SecureStore.getItemAsync(SECURE_AES_KEY_STORAGE_NAME);
  if (existingHex && /^[0-9a-fA-F]{64}$/.test(existingHex)) {
    return hexToBytes(existingHex);
  }
  const freshKey = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(SECURE_AES_KEY_STORAGE_NAME, bytesToHex(freshKey));
  return freshKey;
}

/**
 * Encrypts Supabase session payloads with AES-256-CTR + random per-write 16-byte IV
 * stored in AsyncStorage, while keeping the 256-bit key in hardware-backed SecureStore.
 * This cleanly bypasses SecureStore's 2048-byte limit without storing plaintext tokens.
 */
export class LargeSecureStore {
  private async encrypt(value: string): Promise<string> {
    const key = await getOrCreateAesKeyBytes();
    const iv = Crypto.getRandomBytes(16);
    const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const plainBytes = aesjs.utils.utf8.toBytes(value);
    const encryptedBytes = ctr.encrypt(plainBytes);
    return `${CIPHER_PREFIX}${bytesToHex(iv)}:${bytesToHex(encryptedBytes)}`;
  }

  private async decrypt(stored: string): Promise<string | null> {
    if (!stored.startsWith(CIPHER_PREFIX)) {
      return null;
    }
    const body = stored.slice(CIPHER_PREFIX.length);
    const separatorIndex = body.indexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }
    const ivHex = body.slice(0, separatorIndex);
    const cipherHex = body.slice(separatorIndex + 1);
    if (!/^[0-9a-fA-F]{32}$/.test(ivHex) || cipherHex.length === 0) {
      return null;
    }

    const keyHex = await SecureStore.getItemAsync(SECURE_AES_KEY_STORAGE_NAME);
    if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      return null;
    }

    const key = hexToBytes(keyHex);
    const iv = hexToBytes(ivHex);
    const encryptedBytes = hexToBytes(cipherHex);
    const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const decryptedBytes = ctr.decrypt(encryptedBytes);
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;
      return await this.decrypt(stored);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

let cachedClient: SupabaseClient | null = null;
const encryptedSessionStorage = new LargeSecureStore();

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (cachedClient) {
    return cachedClient;
  }

  const { supabaseUrl, supabasePublishableKey } = getPublicEnvConfig();
  cachedClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: encryptedSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}

export function registerSupabaseAppStateRefresh(): () => void {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  if (AppState.currentState === 'active') {
    void client.auth.startAutoRefresh();
  }

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });

  return () => {
    sub.remove();
  };
}
