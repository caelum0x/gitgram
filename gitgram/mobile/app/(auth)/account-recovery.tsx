import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import { authService } from '../../services/authService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AccountRecoveryScreen() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState<'email' | 'username'>('email');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (recoveryMethod === 'email' && !email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (recoveryMethod === 'username' && !username) {
      Alert.alert('Error', 'Please enter your username');
      return;
    }

    setLoading(true);
    try {
      await authService.recoverAccount({
        email: recoveryMethod === 'email' ? email : undefined,
        username: recoveryMethod === 'username' ? username : undefined,
      });
      Alert.alert(
        'Recovery Instructions Sent',
        'Please check your email for account recovery instructions',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      logger.error('Account recovery error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to send recovery instructions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Header title="Account Recovery" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Icon name="lock-reset" size={64} color={Colors.accent} style={styles.icon} />
          <Text style={styles.title}>Recover Your Account</Text>
          <Text style={styles.description}>
            Choose a recovery method to regain access to your account.
          </Text>

          <View style={styles.methodContainer}>
            <TouchableOpacity
              style={[
                styles.methodButton,
                recoveryMethod === 'email' && styles.methodButtonActive,
              ]}
              onPress={() => setRecoveryMethod('email')}
            >
              <Icon
                name="email"
                size={24}
                color={recoveryMethod === 'email' ? Colors.accent : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodText,
                  recoveryMethod === 'email' && styles.methodTextActive,
                ]}
              >
                Email
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.methodButton,
                recoveryMethod === 'username' && styles.methodButtonActive,
              ]}
              onPress={() => setRecoveryMethod('username')}
            >
              <Icon
                name="account-circle"
                size={24}
                color={recoveryMethod === 'username' ? Colors.accent : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodText,
                  recoveryMethod === 'username' && styles.methodTextActive,
                ]}
              >
                Username
              </Text>
            </TouchableOpacity>
          </View>

          {recoveryMethod === 'email' ? (
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={Colors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoComplete="username"
            />
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Sending...' : 'Send Recovery Instructions'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
            <Text style={styles.linkText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  icon: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  methodContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  methodButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  methodText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  methodTextActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    color: Colors.text,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});

