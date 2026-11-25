import type { BackupPayload } from '@/types/database';
import { validateBackupPayload } from '@/utils/validation';

export function serializeBackupPayload(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseAndValidateBackupJson(rawText: string): {
  valid: boolean;
  payload?: BackupPayload;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      valid: false,
      error: 'The selected file does not contain valid JSON.',
    };
  }

  const validation = validateBackupPayload(parsed);
  if (!validation.valid || !validation.value) {
    return {
      valid: false,
      error: validation.error ?? 'Backup file format is invalid.',
    };
  }

  return { valid: true, payload: validation.value };
}
