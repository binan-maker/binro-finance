import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { CurrencyConfig } from '@/constants/currencies';
import { repositories } from '@/database/repositories';
import { buildTransactionsCsv } from '@/services/export/csvExport';
import {
  isLocalRelativeImagePath,
  readStoredImageAsset,
  restoreMediaAssetToDisk,
} from '@/services/images/localImageStorage';
import type { BackupMediaAsset, BackupPayload } from '@/types/database';
import type { Tag, Transaction } from '@/types/models';
import { getTodayISODate } from '@/utils/date';

import {
  parseAndValidateBackupJson,
  serializeBackupPayload,
} from './backupPayload';

export { parseAndValidateBackupJson, serializeBackupPayload };

async function writeAndShareTextFile(params: {
  filename: string;
  content: string;
  mimeType: string;
  dialogTitle: string;
}): Promise<{ fileUri: string; shared: boolean }> {
  const file = new File(Paths.cache, params.filename);
  file.create({ overwrite: true });
  await file.write(params.content);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: params.mimeType,
      dialogTitle: params.dialogTitle,
    });
    return { fileUri: file.uri, shared: true };
  }

  return { fileUri: file.uri, shared: false };
}

export async function exportTransactionsCsvFile(params: {
  transactions: readonly Transaction[];
  currencyCode: string;
  tags?: readonly Tag[];
  currencies?: readonly CurrencyConfig[];
}): Promise<{ count: number; fileUri: string; shared: boolean }> {
  const csv = buildTransactionsCsv(
    params.transactions,
    params.currencyCode,
    params.tags,
    params.currencies,
  );
  const stamp = getTodayISODate();
  const res = await writeAndShareTextFile({
    filename: `binro-finance-transactions-${stamp}.csv`,
    content: csv,
    mimeType: 'text/csv',
    dialogTitle: 'Export Transactions CSV',
  });
  return { count: params.transactions.length, ...res };
}

export async function exportJsonBackupFile(appVersion: string): Promise<{
  payload: BackupPayload;
  fileUri: string;
  shared: boolean;
}> {
  const payload = await repositories.backup.exportAll(appVersion);
  const mediaAssets: Record<string, BackupMediaAsset> = {};

  for (const cat of payload.categories) {
    if (cat.imageUri && isLocalRelativeImagePath(cat.imageUri)) {
      const asset = await readStoredImageAsset(cat.imageUri);
      if (asset) {
        mediaAssets[cat.imageUri] = asset;
      }
    }
  }

  if (payload.settings.profileAvatar && isLocalRelativeImagePath(payload.settings.profileAvatar)) {
    const asset = await readStoredImageAsset(payload.settings.profileAvatar);
    if (asset) {
      mediaAssets[payload.settings.profileAvatar] = asset;
    }
  }

  const enrichedPayload: BackupPayload =
    Object.keys(mediaAssets).length > 0 ? { ...payload, mediaAssets } : payload;

  const json = serializeBackupPayload(enrichedPayload);
  const stamp = getTodayISODate();
  const res = await writeAndShareTextFile({
    filename: `binro-finance-backup-${stamp}.json`,
    content: json,
    mimeType: 'application/json',
    dialogTitle: 'Export Complete JSON Backup',
  });
  return { payload: enrichedPayload, ...res };
}

export function materializeBackupMediaAssets(payload: BackupPayload): BackupPayload {
  const assets = payload.mediaAssets ?? {};
  const restoredKeys = new Set<string>();

  for (const [key, asset] of Object.entries(assets)) {
    const restoredPath = restoreMediaAssetToDisk(key, asset);
    if (restoredPath) {
      restoredKeys.add(restoredPath);
    }
  }

  const categories = payload.categories.map((cat) => {
    if (!cat.imageUri) return cat;
    if (isLocalRelativeImagePath(cat.imageUri) && restoredKeys.has(cat.imageUri)) {
      return cat;
    }
    return { ...cat, imageUri: null };
  });

  const profileAvatar =
    payload.settings.profileAvatar &&
    isLocalRelativeImagePath(payload.settings.profileAvatar)
      ? restoredKeys.has(payload.settings.profileAvatar)
        ? payload.settings.profileAvatar
        : null
      : payload.settings.profileAvatar;

  return {
    ...payload,
    settings: {
      ...payload.settings,
      profileAvatar,
    },
    categories,
  };
}

export async function pickAndValidateJsonBackupFile(): Promise<{
  canceled: boolean;
  fileName?: string;
  payload?: BackupPayload;
  error?: string;
}> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  try {
    const file = new File(asset.uri);
    const text = await file.text();
    const parsed = parseAndValidateBackupJson(text);
    if (!parsed.valid || !parsed.payload) {
      return {
        canceled: false,
        fileName: asset.name,
        error: parsed.error ?? 'Invalid backup file.',
      };
    }

    return {
      canceled: false,
      fileName: asset.name,
      payload: parsed.payload,
    };
  } catch {
    return {
      canceled: false,
      fileName: asset.name,
      error: 'Unable to read the selected backup file.',
    };
  }
}
