import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuthStore } from '../../store/authStore';
import { logger } from '../../utils/logger';
import { complianceService } from '../../services/complianceService';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = () => {
    if (confirmText !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm');
      return;
    }

    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await complianceService.deleteAccount();
              await logout();
              Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
              router.replace('/(auth)/login');
            } catch (error) {
              logger.error('Delete account error:', error);
              Alert.alert('Error', 'Failed to delete account. Please try again.');
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
      <Header title="Delete Account" />
      <View style={styles.content}>
        <Text style={styles.warning}>
          ⚠️ Warning: This action cannot be undone
        </Text>
        <Text style={styles.description}>
          Deleting your account will permanently remove all your data including:
        </Text>
        <View style={styles.list}>
          <Text style={styles.listItem}>• All your posts and reels</Text>
          <Text style={styles.listItem}>• All your comments and likes</Text>
          <Text style={styles.listItem}>• All your messages</Text>
          <Text style={styles.listItem}>• Your profile and account information</Text>
          <Text style={styles.listItem}>• All your saved content</Text>
        </View>

        <Text style={styles.confirmLabel}>
          Type <Text style={styles.confirmWord}>DELETE</Text> to confirm:
        </Text>
        <TextInput
          style={styles.input}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="DELETE"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={[styles.deleteButton, (loading || confirmText !== 'DELETE') && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={loading || confirmText !== 'DELETE'}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
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
    color: Colors.error || '#ff4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 24,
  },
  list: {
    marginBottom: 24,
    paddingLeft: 16,
  },
  listItem: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  confirmLabel: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  confirmWord: {
    fontWeight: 'bold',
    color: Colors.error || '#ff4444',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: Colors.error || '#ff4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

