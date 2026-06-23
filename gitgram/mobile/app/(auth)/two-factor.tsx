import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { logger } from '../../utils/logger';

export default function TwoFactorScreen() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; accessToken?: string; refreshToken?: string }>();
  const { login } = useAuthStore();

  // Auto-focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleCodeChange = (value: string, index: number) => {
    // Only allow digits
    const sanitizedValue = value.replace(/[^0-9]/g, '');

    const newCode = [...code];
    newCode[index] = sanitizedValue;
    setCode(newCode);

    // Auto-focus next input
    if (sanitizedValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (sanitizedValue && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleSubmit(fullCode);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (submittedCode?: string) => {
    const verificationCode = submittedCode || code.join('');
    if (verificationCode.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    try {
      // Check if this is a login flow (userId passed as param) or authenticated verification
      if (params.userId) {
        // Login 2FA verification (no auth required)
        const response = await authService.verifyTwoFactorLogin({
          userId: params.userId,
          token: verificationCode,
        });

        if (response.verified) {
          // If we have tokens from the login response, complete the login
          if (params.accessToken && params.refreshToken) {
            // Fetch user data to complete login
            const meResponse = await authService.getMe();
            await login(meResponse.user, params.accessToken, params.refreshToken);
          }
          router.replace('/(tabs)/home');
        } else {
          throw new Error('Verification failed');
        }
      } else {
        // Authenticated 2FA verification
        const response = await authService.verifyTwoFactor({ code: verificationCode });

        // Show warning if backup code was used
        if (response.warning) {
          Alert.alert('Notice', response.warning, [
            { text: 'OK', onPress: () => router.replace('/(tabs)/home') }
          ]);
        } else {
          router.replace('/(tabs)/home');
        }
      }
    } catch (error: any) {
      logger.error('2FA verification error:', error);
      const errorMessage = error.response?.data?.error
        || error.response?.data?.message
        || error.message
        || 'Invalid verification code';
      Alert.alert('Verification Failed', errorMessage);
      // Clear code and refocus first input
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const response = await authService.resendTwoFactor();
      // Show the guidance message from the server
      Alert.alert(
        'Verification Code',
        response.message || 'Open your authenticator app to get the current code',
        response.note ? [
          { text: 'OK' },
          { text: 'Need Help?', onPress: () => Alert.alert('Support', response.support || 'Contact support for assistance') }
        ] : [{ text: 'OK' }]
      );
    } catch (error: any) {
      logger.error('Resend 2FA error:', error);
      const errorMessage = error.response?.data?.message
        || error.response?.data?.error
        || 'Failed to process request';
      Alert.alert('Error', errorMessage);
    } finally {
      setResending(false);
    }
  };

  const handlePaste = (text: string) => {
    // Handle pasted codes
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    if (digits.length > 0) {
      const newCode = [...code];
      for (let i = 0; i < digits.length; i++) {
        newCode[i] = digits[i];
      }
      setCode(newCode);

      // Focus the next empty input or the last one
      const nextIndex = Math.min(digits.length, 5);
      inputRefs.current[nextIndex]?.focus();

      // Auto-submit if 6 digits pasted
      if (digits.length === 6) {
        handleSubmit(digits);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Header title="Two-Factor Authentication" showBack />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔐</Text>
        </View>
        <Text style={styles.title}>Enter Verification Code</Text>
        <Text style={styles.description}>
          Enter the 6-digit code from your authenticator app to verify your identity.
        </Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.codeInput,
                digit ? styles.codeInputFilled : null,
                loading ? styles.codeInputDisabled : null,
              ]}
              value={digit}
              onChangeText={(value) => {
                // Handle paste of full code
                if (value.length > 1) {
                  handlePaste(value);
                } else {
                  handleCodeChange(value, index);
                }
              }}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={6}
              selectTextOnFocus
              editable={!loading}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => handleSubmit()}
          disabled={loading || code.join('').length !== 6}
        >
          {loading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color={Colors.text} />
              <Text style={styles.buttonText}>Verifying...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Verify Code</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.linkButton, resending && styles.linkButtonDisabled]}
          onPress={handleResend}
          disabled={resending || loading}
        >
          {resending ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={styles.linkText}>Need help with your code?</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.helperText}>
          Codes refresh every 30 seconds. Make sure to enter the most recent code.
        </Text>
      </View>
    </KeyboardAvoidingView>
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
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 32,
    paddingHorizontal: 10,
    gap: 8,
  },
  codeInput: {
    flex: 1,
    height: 56,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  codeInputFilled: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}10`,
  },
  codeInputDisabled: {
    opacity: 0.7,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 16,
    minHeight: 56,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 8,
    padding: 12,
  },
  linkButtonDisabled: {
    opacity: 0.5,
  },
  linkText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});

