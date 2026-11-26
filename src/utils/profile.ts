export const PROFILE_AVATAR_COLOR = '#10B981';

/**
 * Generates clean avatar initials from a user's display name:
 * - "Ahmed Sameer Binan" -> "AS"
 * - "John David" -> "JD"
 * - "Priya" -> "P"
 * - "" / null -> "BF"
 */
export function getProfileInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'BF';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
