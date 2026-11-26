import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { BackupMediaAsset } from '@/types/database';
import { generateUUID } from '@/utils/uuid';

export const MAX_LOCAL_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const ROOT_IMAGE_FOLDER = 'binro_images';
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export interface PickImageResult {
  canceled: boolean;
  relativePath?: string;
  previewUri?: string;
  error?: string;
}

function getExtensionFromUriOrMime(uri: string, mimeType?: string | null): string | null {
  const normalizedMime = mimeType?.trim().toLowerCase();
  if (normalizedMime === 'image/png') return 'png';
  if (normalizedMime === 'image/webp') return 'webp';
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') return 'jpg';

  const cleanUri = uri.split('?')[0]?.split('#')[0] ?? '';
  const match = /\.([a-z0-9]+)$/i.exec(cleanUri);
  const ext = match?.[1]?.toLowerCase() ?? '';
  if (ALLOWED_EXTENSIONS.has(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return null;
}

function mimeTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

export function isLocalRelativeImagePath(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith(`${ROOT_IMAGE_FOLDER}/`) &&
    !trimmed.includes('..') &&
    ALLOWED_EXTENSIONS.has((trimmed.split('.').pop() ?? '').toLowerCase())
  );
}

export function resolveLocalImageUri(storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  const trimmed = storedValue.trim();
  if (!trimmed || trimmed.startsWith('initials:')) {
    return null;
  }
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith(`${ROOT_IMAGE_FOLDER}/`)) {
    try {
      const file = new File(Paths.document, ...trimmed.split('/'));
      return file.exists ? file.uri : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function deleteStoredImage(storedValue: string | null | undefined): void {
  if (!isLocalRelativeImagePath(storedValue)) return;
  try {
    const file = new File(Paths.document, ...storedValue.split('/'));
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore cleanup errors silently
  }
}

export async function pickAndSaveSquareImage(
  folder: 'categories' | 'profile',
): Promise<PickImageResult> {
  const existingPerm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!existingPerm.granted) {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!requested.granted) {
      return {
        canceled: false,
        error: 'Photo library permission is needed to choose an image.',
      };
    }
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.75,
    exif: false,
  });

  if (picked.canceled || !picked.assets || picked.assets.length === 0) {
    return { canceled: true };
  }

  const asset = picked.assets[0];
  if (!asset.uri) {
    return { canceled: false, error: 'Selected image could not be loaded.' };
  }

  if (asset.mimeType && !ALLOWED_MIME_TYPES.has(asset.mimeType.trim().toLowerCase())) {
    return {
      canceled: false,
      error: 'Unsupported image format. Please choose a JPG, PNG, or WebP image.',
    };
  }

  const ext = getExtensionFromUriOrMime(asset.uri, asset.mimeType);
  if (!ext) {
    return {
      canceled: false,
      error: 'Unsupported image format. Please choose a JPG, PNG, or WebP image.',
    };
  }

  try {
    const sourceFile = new File(asset.uri);
    const sizeBytes = asset.fileSize ?? sourceFile.size ?? 0;
    if (sizeBytes > MAX_LOCAL_IMAGE_BYTES) {
      return {
        canceled: false,
        error: 'Image size must be 2 MB or smaller.',
      };
    }

    const targetDir = new Directory(Paths.document, ROOT_IMAGE_FOLDER, folder);
    targetDir.create({ intermediates: true, idempotent: true });

    const fileName = `${generateUUID()}.${ext}`;
    const destFile = new File(targetDir, fileName);
    sourceFile.copy(destFile);

    if (destFile.size > MAX_LOCAL_IMAGE_BYTES) {
      destFile.delete();
      return {
        canceled: false,
        error: 'Image size must be 2 MB or smaller.',
      };
    }

    const relativePath = `${ROOT_IMAGE_FOLDER}/${folder}/${fileName}`;
    return {
      canceled: false,
      relativePath,
      previewUri: destFile.uri,
    };
  } catch {
    return {
      canceled: false,
      error: 'Unable to save selected image locally. Please try again.',
    };
  }
}

export async function readStoredImageAsset(
  storedValue: string | null | undefined,
): Promise<BackupMediaAsset | null> {
  if (!isLocalRelativeImagePath(storedValue)) return null;
  try {
    const file = new File(Paths.document, ...storedValue.split('/'));
    if (!file.exists || file.size > MAX_LOCAL_IMAGE_BYTES) {
      return null;
    }
    const base64 = await file.base64();
    const ext = storedValue.split('.').pop() ?? 'jpg';
    return {
      mimeType: mimeTypeFromExtension(ext),
      base64,
    };
  } catch {
    return null;
  }
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Base64 decoder unavailable.');
}

export function restoreMediaAssetToDisk(
  relativePath: string,
  asset: BackupMediaAsset,
): string | null {
  if (!isLocalRelativeImagePath(relativePath)) return null;
  if (!ALLOWED_MIME_TYPES.has(asset.mimeType.trim().toLowerCase())) return null;

  try {
    const bytes = decodeBase64ToBytes(asset.base64);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOCAL_IMAGE_BYTES) {
      return null;
    }
    const parts = relativePath.split('/');
    if (parts.length !== 3) return null;
    const [, folder, fileName] = parts;
    if (folder !== 'categories' && folder !== 'profile') return null;

    const dir = new Directory(Paths.document, ROOT_IMAGE_FOLDER, folder);
    dir.create({ intermediates: true, idempotent: true });

    const dest = new File(dir, fileName);
    dest.create({ overwrite: true });
    dest.write(bytes);
    return relativePath;
  } catch {
    return null;
  }
}

export function clearAllStoredImages(): void {
  try {
    const dir = new Directory(Paths.document, ROOT_IMAGE_FOLDER);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Ignore cleanup errors silently
  }
}
