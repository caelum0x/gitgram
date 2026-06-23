import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import { authService } from '../../services/authService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (token) {
      verifyEmail();
    }
  }, [token]);

  const verifyEmail = async () => {
    if (!token) return;

    setLoading(true);
    try {
      await authService.verifyEmail({ token });
      setVerified(true);
      Alert.alert(
        'Email Verified',
        'Your email has been verified successfully',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/home'),
          },
        ]
      );
    } catch (error: any) {
      logger.error('Verify email error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to verify email');
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setLoading(true);
    try {
      await authService.resendVerification();
      Alert.alert('Success', 'Verification email has been sent');
    } catch (error: any) {
      logger.error('Resend verification error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to resend verification email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Verify Email" />
      <View style={styles.content}>
        {verified ? (
          <View style={styles.successContainer}>
            <Icon name="check-circle" size={80} color={Colors.accent} />
            <Text style={styles.successText}>Email Verified!</Text>
            <Text style={styles.successSubtext}>
              Your email has been verified successfully.
            </Text>
          </View>
        ) : (
          <View style={styles.verificationContainer}>
            <Icon name="email" size={80} color={Colors.textSecondary} />
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.description}>
              {token
                ? 'Verifying your email...'
                : 'Please check your email and click the verification link.'}
            </Text>

            {!token && (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={resendVerification}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Sending...' : 'Resend Verification Email'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.linkText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationContainer: {
    alignItems: 'center',
    width: '100%',
  },
  successContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  successText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.accent,
    marginTop: 24,
    marginBottom: 12,
  },
  successSubtext: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
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
    marginTop: 16,
  },
  linkText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});

