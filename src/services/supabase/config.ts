export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleWebClientId: string;
}

function cleanEnvValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholder(value: string): boolean {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes('your-project-ref') ||
    lower.includes('your_supabase') ||
    lower.includes('your-google') ||
    lower.includes('placeholder')
  );
}

export function getPublicEnvConfig(): PublicSupabaseConfig {
  return {
    supabaseUrl: cleanEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: cleanEnvValue(
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    googleWebClientId: cleanEnvValue(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnvConfig();
  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabasePublishableKey)) {
    return false;
  }
  return supabaseUrl.startsWith('https://');
}

export function isGoogleSignInConfigured(): boolean {
  const { googleWebClientId } = getPublicEnvConfig();
  if (isPlaceholder(googleWebClientId)) {
    return false;
  }
  return googleWebClientId.endsWith('.apps.googleusercontent.com');
}
