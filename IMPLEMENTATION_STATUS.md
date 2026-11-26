# BinRo Finance — Implementation Status

**Package:** `com.binro.finance` (`binrofinance`)  
**Stack:** Expo SDK 58 · React Native 0.88.1 · React 19.3 · Expo Router · Zustand · `expo-sqlite` · Supabase · `@react-native-google-signin/google-signin`

## Core Architecture
- **Local-First Persistence:** SQLite (`expo-sqlite`) remains the local source of truth. All financial tracking, categories, tags, budgets, payment methods, reports, and backups operate offline without requiring an account.
- **Optional Cloud Sync & Auth:** Google Sign-In (`@react-native-google-signin/google-signin`) exchanges an ID token with Supabase (`signInWithIdToken`), links or isolates local workspaces safely per `user_id`, and runs incremental keyset sync + RLS-protected media sync (`binro-media`).

## Recent Release Readiness Updates
1. **Welcome Screen (`src/app/onboarding/index.tsx`)**
   - Streamlined layout: top-left **Skip** button, top-center `assets/images/icon.png` + **BinRo Finance**, centered **Default Currency** selector and **Opening Balance** input (no explanatory/marketing clutter or `"Optional"` labels), primary **Get Started** CTA, and **Continue with Google** button.
   - Safe area + `KeyboardAvoidingView` + scrollable layout prevents overlap/overflow; leaving Opening Balance empty or tapping Skip preserves any pre-existing opening balance.
2. **Returning-User Profile Reconciliation & Adaptive Completion (`src/utils/profile.ts`, `src/app/profile/complete.tsx`, `src/services/sync/syncEngine.ts`)**
   - `evaluateProfileCompletion` inspects `gender` and `dateOfBirth` individually (`Male`, `Female`, `Prefer not to say` only; obsolete values map safely to unset).
   - `Complete Profile` displays only missing fields and redirects directly to `/(tabs)` if both are already saved or previously skipped.
   - `fetchRemoteProfileRow` + `reconcileLocalAndRemoteProfile` hydrate cloud `profiles` data into local SQLite before migration push, preventing fresh installs or sign-out/sign-in cycles from overwriting saved `gender`, `dateOfBirth`, or profile metadata with `null`.
3. **Google Sign-In Reminders & Shared Button (`src/components/common/SignInReminderCard.tsx`, `src/components/common/GoogleSignInButton.tsx`)**
   - Unified official 4-color Google SVG "G" button across Welcome, Home, Transactions, Settings, and Account Management.
   - Home screen reminder (`Sync your data`) and inline Transactions screen reminder (shown once after the 5th transaction only when signed out, not dismissed, and list length `>= 6`) persist dismissal cleanly via `AsyncStorage` without affecting transaction calculations or short lists.
