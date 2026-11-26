import type { SQLiteSyncRepository } from '@/database/repositories/syncRepository';
import {
  computeLocalFileSha256,
  deleteStoredImage,
  isAllowedMediaFolder,
  isLocalRelativeImagePath,
  MAX_LOCAL_IMAGE_BYTES,
  readLocalImageBytes,
  resolveLocalImageUri,
  saveDownloadedMediaToDisk,
  type LocalImageFolder,
} from '@/services/images/localImageStorage';
import { getSupabaseClient } from '@/services/supabase/client';

export const BINRO_MEDIA_BUCKET = 'binro-media';

function folderForEntityType(
  entityType: 'profile' | 'category' | 'payment_method',
): LocalImageFolder {
  switch (entityType) {
    case 'profile':
      return 'profile';
    case 'category':
      return 'categories';
    case 'payment_method':
      return 'payment_methods';
  }
}

export function sanitizeRemoteMediaPath(
  userId: string,
  remotePath: string | null | undefined,
): string | null {
  if (!remotePath) return null;
  const trimmed = remotePath.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return null;
  }
  const expectedPrefix = `${userId}/`;
  if (!trimmed.startsWith(expectedPrefix)) {
    return null;
  }
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;
  const [, folder, fileName] = parts;
  if (!isAllowedMediaFolder(folder)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return null;
  return trimmed;
}

export async function resolveRemotePathForLocalImage(
  localPath: string | null | undefined,
  syncRepo: SQLiteSyncRepository,
): Promise<string | null> {
  if (!localPath || !isLocalRelativeImagePath(localPath)) {
    return null;
  }
  const entry = await syncRepo.getMediaMapByLocalPath(localPath);
  return entry?.remote_path ?? null;
}

export async function syncPendingMediaForUser(
  userId: string,
  syncRepo: SQLiteSyncRepository,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  // 1. Process uploads
  const pendingUploads = await syncRepo.getMediaMapEntriesByState('pending_upload');
  const syncedEntries = await syncRepo.getMediaMapEntriesByState('synced');

  for (const item of pendingUploads) {
    if (!isLocalRelativeImagePath(item.local_path)) {
      await syncRepo.deleteMediaMapEntry(item.local_path);
      continue;
    }

    const loaded = await readLocalImageBytes(item.local_path);
    const sha256 = await computeLocalFileSha256(item.local_path);
    if (!loaded || !sha256) {
      // File no longer exists locally; skip safely
      continue;
    }

    // Deduplicate: reuse already-uploaded object if identical SHA-256 exists for this user
    const existingDuplicate = syncedEntries.find(
      (e) => e.user_id === userId && e.content_hash === sha256 && e.remote_path,
    );

    let remotePath = existingDuplicate?.remote_path ?? null;
    if (!remotePath) {
      const folder = folderForEntityType(item.entity_type);
      const safeEntityId = item.entity_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'item';
      remotePath = `${userId}/${folder}/${safeEntityId}_${sha256.slice(0, 12)}.${loaded.ext}`;

      const { error } = await supabase.storage
        .from(BINRO_MEDIA_BUCKET)
        .upload(remotePath, loaded.bytes, {
          contentType: loaded.mimeType,
          upsert: true,
        });

      if (error) {
        throw new Error(`Media upload failed: ${error.message}`);
      }
    }

    const now = new Date().toISOString();
    const updatedRow = {
      ...item,
      user_id: userId,
      remote_path: remotePath,
      content_hash: sha256,
      sync_state: 'synced' as const,
      updated_at: now,
    };
    await syncRepo.upsertMediaMap(updatedRow);
    syncedEntries.push(updatedRow);
  }

  // 2. Process remote deletes (only remove storage object when no other synced entry uses it)
  const pendingDeletes = await syncRepo.getMediaMapEntriesByState('pending_delete');
  const activeAfterUploads = await syncRepo.getMediaMapEntriesByState('synced');

  for (const item of pendingDeletes) {
    const safeRemote = sanitizeRemoteMediaPath(userId, item.remote_path);
    if (safeRemote) {
      const stillReferenced = activeAfterUploads.some(
        (s) => s.local_path !== item.local_path && s.remote_path === safeRemote,
      );
      if (!stillReferenced) {
        await supabase.storage.from(BINRO_MEDIA_BUCKET).remove([safeRemote]);
      }
    }
    deleteStoredImage(item.local_path);
    await syncRepo.deleteMediaMapEntry(item.local_path);
  }
}

export async function ensureLocalMediaForRemotePath(params: {
  userId: string;
  remotePath: string | null | undefined;
  entityType: 'profile' | 'category' | 'payment_method';
  entityId: string;
  syncRepo: SQLiteSyncRepository;
}): Promise<string | null> {
  const safeRemote = sanitizeRemoteMediaPath(params.userId, params.remotePath);
  if (!safeRemote) {
    return null;
  }

  const existing = await params.syncRepo.getMediaMapByRemotePath(safeRemote);
  if (existing && resolveLocalImageUri(existing.local_path)) {
    return existing.local_path;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(BINRO_MEDIA_BUCKET)
    .download(safeRemote);

  if (error || !data) {
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOCAL_IMAGE_BYTES) {
    return null;
  }

  const folder = folderForEntityType(params.entityType);
  const mimeType = data.type && data.type.startsWith('image/') ? data.type : 'image/jpeg';
  const fileNamePart = safeRemote.split('/').pop()?.split('.')[0] ?? params.entityId;
  const savedLocalPath = saveDownloadedMediaToDisk(folder, mimeType, bytes, fileNamePart);
  if (!savedLocalPath) {
    return null;
  }

  const hash = await computeLocalFileSha256(savedLocalPath);
  await params.syncRepo.upsertMediaMap({
    local_path: savedLocalPath,
    entity_type: params.entityType,
    entity_id: params.entityId,
    remote_path: safeRemote,
    user_id: params.userId,
    content_hash: hash,
    sync_state: 'synced',
    updated_at: new Date().toISOString(),
  });

  return savedLocalPath;
}
