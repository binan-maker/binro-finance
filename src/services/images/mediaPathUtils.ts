export const MAX_LOCAL_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ROOT_IMAGE_FOLDER = 'binro_images';

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export type LocalImageFolder = 'categories' | 'payment_methods' | 'profile';

export function getExtensionFromUriOrMime(
  uri: string,
  mimeType?: string | null,
): string | null {
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

export function mimeTypeFromExtension(ext: string): string {
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

export function isAllowedMediaFolder(folder: string): folder is LocalImageFolder {
  return folder === 'categories' || folder === 'payment_methods' || folder === 'profile';
}

export function isLocalRelativeImagePath(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.includes('\\')) {
    return false;
  }
  const parts = trimmed.split('/');
  if (parts.length !== 3) return false;
  const [root, folder, fileName] = parts;
  if (root !== ROOT_IMAGE_FOLDER || !isAllowedMediaFolder(folder)) {
    return false;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return false;
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
}
