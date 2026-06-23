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

import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { authService } from '../../../services/authService';
import { logger } from '../../../utils/logger';


export default function TwoFactorSetupScreen() {
  const [step, setStep] = useState<'info' | 'scan' | 'verify'>('info');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartSetup = async () => {
    setLoading(true);
    try {
      const response = await authService.setupTwoFactor();
      setQrCode(response.qrCodeUrl || response.otpauthUrl || '');
      setSecret(response.secret || '');
      setStep('scan');
    } catch (error) {
      logger.error('Start 2FA setup error:', error);
      Alert.alert('Error', 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      Alert.alert('Error', 'Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await authService.verifyTwoFactorSetup({
        token: verificationCode,
        secret: secret,
      });
      Alert.alert('Success', 'Two-factor authentication has been enabled', [
        { text: 'OK', onPress: () => {} },
      ]);
    } catch (error) {
      logger.error('Verify 2FA error:', error);
      Alert.alert('Error', 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'info') {
    return (
      <ScrollView style={styles.container}>
        <Header title="Setup 2FA" />
        <View style={styles.content}>
          <Icon name="security" size={64} color={Colors.accent} style={styles.icon} />
          <Text style={styles.title}>Two-Factor Authentication</Text>
          <Text style={styles.description}>
            Add an extra layer of security to your account. You'll need to enter a code from your authenticator app when you log in.
          </Text>

          <View style={styles.steps}>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>1</Text>
              <Text style={styles.stepText}>Scan the QR code with your authenticator app</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepNumber}>2</Text>
              <Text style={styles.stepText}>Enter the 6-digit code to verify</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStartSetup}
            disabled={loading}
          >
            {loading ? (
              <LoadingSpinner />
            ) : (
              <Text style={styles.buttonText}>Get Started</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (step === 'scan') {
    return (
      <ScrollView style={styles.container}>
        <Header title="Scan QR Code" />
        <View style={styles.content}>
          <Text style={styles.instruction}>
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </Text>

          <View style={styles.qrContainer}>
            {qrCode ? (
              <Text style={styles.qrPlaceholder}>[QR Code Image]</Text>
            ) : (
              <LoadingSpinner />
            )}
          </View>

          <Text style={styles.secretLabel}>Or enter this code manually:</Text>
          <Text style={styles.secretCode}>{secret}</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => setStep('verify')}
          >
            <Text style={styles.buttonText}>I've Scanned the Code</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Verify Code" />
      <View style={styles.content}>
        <Text style={styles.instruction}>
          Enter the 6-digit code from your authenticator app to complete setup.
        </Text>

        <TextInput
          style={styles.codeInput}
          value={verificationCode}
          onChangeText={setVerificationCode}
          placeholder="000000"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, (loading || verificationCode.length !== 6) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || verificationCode.length !== 6}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.buttonText}>Verify & Enable</Text>
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
    alignItems: 'center',
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  steps: {
    width: '100%',
    marginBottom: 32,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  instruction: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  qrContainer: {
    width: 200,
    height: 200,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  qrPlaceholder: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  secretLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  secretCode: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: 4,
    marginBottom: 32,
  },
  codeInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
    width: '100%',
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
