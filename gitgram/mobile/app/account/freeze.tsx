import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuthStore } from '../../store/authStore';
import { logger } from '../../utils/logger';
import { settingsService } from '../../services/settingsService';

export default function FreezeAccountScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const reasons = [
    'Taking a break',
    'Privacy concerns',
    'Too much time on app',
    'Other',
  ];

  const handleFreeze = () => {
    if (!reason) {
      Alert.alert('Error', 'Please select a reason');
      return;
    }

    Alert.alert(
      'Freeze Account',
      'Your account will be temporarily frozen. You can unfreeze it anytime by logging back in. Your data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Freeze Account',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await settingsService.freezeAccount();
              await logout();
              Alert.alert('Account Frozen', 'Your account has been frozen. Log in anytime to reactivate it.');
              router.replace('/(auth)/login');
            } catch (error) {
              logger.error('Freeze account error:', error);
              Alert.alert('Error', 'Failed to freeze account. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Freeze Account" />
      <View style={styles.content}>
        <Text style={styles.warning}>
          ⏸️ Temporarily Freeze Your Account
        </Text>
        <Text style={styles.description}>
          Freezing your account will hide your profile and content from others, but your data will be preserved. You can unfreeze anytime by logging back in.
        </Text>

        <Text style={styles.label}>Reason (optional)</Text>
        {reasons.map((r) => (
          <TouchableOpacity
            key={r}
            style={[
              styles.reasonButton,
              reason === r && styles.selectedReason,
            ]}
            onPress={() => setReason(r)}
          >
            <Text
              style={[
                styles.reasonText,
                reason === r && styles.selectedReasonText,
              ]}
            >
              {r}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.freezeButton, loading && styles.buttonDisabled]}
          onPress={handleFreeze}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.freezeButtonText}>Freeze My Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  warning: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 24,
    lineHeight: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  reasonButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedReason: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentBackground || Colors.surface,
  },
  reasonText: {
    fontSize: 16,
    color: Colors.text,
  },
  selectedReasonText: {
    fontWeight: '600',
    color: Colors.accent,
  },
  freezeButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  freezeButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

