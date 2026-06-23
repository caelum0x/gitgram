import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';
import { logger } from '../../utils/logger';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function GitHubCallbackScreen() {
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const router = useRouter();
  const { login } = useAuthStore();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    handleCallback();
  }, [code]);

  const handleCallback = async () => {
    if (error) {
      logger.error('GitHub OAuth error:', error);
      setStatus('error');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
      return;
    }

    if (!code) {
      setStatus('error');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
      return;
    }

    try {
      const response = await authService.githubAuth(code);
      await login(response.user, response.accessToken, response.refreshToken);
      setStatus('success');
      setTimeout(() => {
        router.replace('/(tabs)/home');
      }, 1000);
    } catch (error: any) {
      logger.error('GitHub auth error:', error);
      setStatus('error');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    }
  };

  return (
    <View style={styles.container}>
      {status === 'processing' && (
        <>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.text}>Completing GitHub login...</Text>
        </>
      )}
      {status === 'success' && (
        <>
          <Text style={styles.successText}>✓</Text>
          <Text style={styles.text}>Login successful!</Text>
        </>
      )}
      {status === 'error' && (
        <>
          <Text style={styles.errorText}>✗</Text>
          <Text style={styles.text}>Login failed. Redirecting...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
  },
  successText: {
    fontSize: 64,
    color: Colors.accent,
  },
  errorText: {
    fontSize: 64,
    color: Colors.error || '#ff4444',
  },
});

