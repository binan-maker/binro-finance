import type { CreateNotificationInput } from '@/types/database';

export const WELCOME_NOTIFICATION_TITLE = 'Welcome to BinRo Finance';
export const WELCOME_NOTIFICATION_BODY =
  'Your account is ready. Start managing your money with clarity.';

export const SIGNIN_NOTIFICATION_TITLE = 'Signed in successfully';
export const SIGNIN_NOTIFICATION_BODY = "You're back in BinRo Finance.";

export type AuthSessionSource = 'explicit_sign_in' | 'session_restore';

export function buildWelcomeDedupeKey(userId: string): string {
  return `account_welcome:${userId}`;
}

export function isNewlyCreatedAuthAccount(params: {
  createdAt?: string | null;
  lastSignInAt?: string | null;
}): boolean {
  const createdMs = params.createdAt ? Date.parse(params.createdAt) : Number.NaN;
  const lastSignInMs = params.lastSignInAt ? Date.parse(params.lastSignInAt) : Number.NaN;
  if (Number.isNaN(createdMs) || Number.isNaN(lastSignInMs)) {
    return true;
  }
  // Supabase assigns created_at and last_sign_in_at within seconds on initial sign-up.
  // A gap wider than 60s indicates an existing account signing back in.
  return Math.abs(lastSignInMs - createdMs) <= 60_000;
}

export interface AccountSignInDecisionInput {
  source: AuthSessionSource;
  userId: string;
  previousLinkedUserId: string | null;
  alreadyWelcomedLocally: boolean;
  remoteAccountExisted: boolean | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
}

export function decideAccountSignInNotification(
  input: AccountSignInDecisionInput,
): CreateNotificationInput | null {
  if (input.source !== 'explicit_sign_in') {
    return null;
  }

  const dedupeKey = buildWelcomeDedupeKey(input.userId);
  const wasLinkedLocallyBefore = input.previousLinkedUserId === input.userId;
  const createdNow = isNewlyCreatedAuthAccount({
    createdAt: input.createdAt,
    lastSignInAt: input.lastSignInAt,
  });

  const isReturningUser =
    input.alreadyWelcomedLocally ||
    wasLinkedLocallyBefore ||
    input.remoteAccountExisted === true ||
    !createdNow;

  if (isReturningUser) {
    return {
      type: 'system',
      title: SIGNIN_NOTIFICATION_TITLE,
      body: SIGNIN_NOTIFICATION_BODY,
    };
  }

  return {
    type: 'system',
    title: WELCOME_NOTIFICATION_TITLE,
    body: WELCOME_NOTIFICATION_BODY,
    metadataJson: dedupeKey,
  };
}
