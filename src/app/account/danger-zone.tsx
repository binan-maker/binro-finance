import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  BottomSheetModal,
  ConfirmDialog,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const DELETE_CONFIRM_KEYWORD = 'DELETE';

export default function DangerZoneScreen() {
  const theme = useTheme();
  const router = useRouter();

  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const clearAllLocalData = useAppStore((s) => s.clearAllLocalData);
  const deleteAccountAndData = useAppStore((s) => s.deleteAccountAndData);

  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [deleteStepOneVisible, setDeleteStepOneVisible] = useState(false);
  const [deleteStepTwoVisible, setDeleteStepTwoVisible] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const deleteKeywordMatches =
    deleteInput.trim().toUpperCase() === DELETE_CONFIRM_KEYWORD;

  const handleClearAll = async () => {
    if (clearing || deletingAccount) return;
    setClearing(true);
    setErrorMsg(null);
    try {
      await clearAllLocalData();
      setClearConfirmVisible(false);
      router.replace('/onboarding');
    } catch {
      setClearConfirmVisible(false);
      setErrorMsg('Unable to clear local data. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  const openDeleteStepTwo = () => {
    setDeleteStepOneVisible(false);
    setDeleteInput('');
    setErrorMsg(null);
    setDeleteStepTwoVisible(true);
  };

  const closeDeleteStepTwo = () => {
    if (deletingAccount) return;
    setDeleteStepTwoVisible(false);
    setDeleteInput('');
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount || clearing || !deleteKeywordMatches) return;
    setDeletingAccount(true);
    setErrorMsg(null);
    try {
      await deleteAccountAndData();
      setDeleteStepTwoVisible(false);
      setDeleteInput('');
      router.replace('/onboarding');
    } catch (err) {
      setDeleteStepTwoVisible(false);
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Unable to delete account right now. Please try again.';
      setErrorMsg(message);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Danger Zone" showBack />

      <View
        style={[
          styles.warningBanner,
          {
            backgroundColor: theme.dangerSoft,
            borderColor: theme.danger,
          },
        ]}>
        <Ionicons name="warning-outline" size={20} color={theme.danger} />
        <Text style={[styles.warningText, { color: theme.danger }]}>
          Actions on this screen permanently remove data and cannot be undone.
        </Text>
      </View>

      <AppCard>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Clear All Local Data
        </Text>
        <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
          Permanently erase all transactions, categories, tags, payment methods, budgets, and preferences stored on this device.
        </Text>
        <AppButton
          label="Clear All Local Data"
          variant="danger"
          onPress={() => {
            setErrorMsg(null);
            setClearConfirmVisible(true);
          }}
          disabled={deletingAccount || authBusy}
          loading={clearing}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          Delete Account
        </Text>
        {authUser ? (
          <>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              Permanently delete your Google-linked cloud account ({authUser.email ?? 'signed in'}), synced records, uploaded images, and local workspace.
            </Text>
            <AppButton
              label="Delete Account"
              variant="danger"
              onPress={() => {
                setErrorMsg(null);
                setDeleteStepOneVisible(true);
              }}
              disabled={clearing || authBusy}
              loading={deletingAccount}
            />
          </>
        ) : (
          <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
            Sign in with Google in Account Management to permanently delete a cloud account and its synced data.
          </Text>
        )}
      </AppCard>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}

      <ConfirmDialog
        visible={clearConfirmVisible}
        title="Clear All Local Data?"
        message="All local data on this device will be permanently deleted. This action cannot be undone."
        confirmLabel="Clear All Data"
        cancelLabel="Cancel"
        destructive
        loading={clearing}
        onConfirm={() => void handleClearAll()}
        onCancel={() => setClearConfirmVisible(false)}
      />

      <ConfirmDialog
        visible={deleteStepOneVisible}
        title="Delete Account?"
        message="This will permanently delete your cloud account, synced records, uploaded images, and local device workspace. You will be asked to confirm one more time."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        destructive
        onConfirm={openDeleteStepTwo}
        onCancel={() => setDeleteStepOneVisible(false)}
      />

      <BottomSheetModal
        visible={deleteStepTwoVisible}
        onClose={closeDeleteStepTwo}
        variant="center"
        keyboardAvoiding>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.danger }]}>
            Final Confirmation
          </Text>
          <Pressable
            onPress={closeDeleteStepTwo}
            disabled={deletingAccount}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close final account deletion confirmation">
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.modalBody, { color: theme.textSecondary }]}>
          Type <Text style={{ color: theme.text, fontWeight: '700' }}>{DELETE_CONFIRM_KEYWORD}</Text> below to permanently delete{' '}
          {authUser?.email ? authUser.email : 'your account'} and all synced data.
        </Text>

        <AppInput
          label={`Type ${DELETE_CONFIRM_KEYWORD} to confirm`}
          value={deleteInput}
          onChangeText={setDeleteInput}
          placeholder={DELETE_CONFIRM_KEYWORD}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deletingAccount}
        />

        <View style={styles.modalActions}>
          <View style={styles.flex1}>
            <AppButton
              label="Cancel"
              variant="outline"
              onPress={closeDeleteStepTwo}
              disabled={deletingAccount}
              fullWidth
            />
          </View>
          <View style={styles.flex1}>
            <AppButton
              label="Permanently Delete Account"
              variant="danger"
              onPress={() => void handleDeleteAccount()}
              disabled={!deleteKeywordMatches}
              loading={deletingAccount}
              fullWidth
            />
          </View>
        </View>
      </BottomSheetModal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
