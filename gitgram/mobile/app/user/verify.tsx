import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { verificationService } from '../../services/verificationService';
import { userService } from '../../services/userService';

export default function VerifyAccountScreen() {
  const [verificationType, setVerificationType] = useState<'standard' | 'golden'>('standard');
  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<'none' | 'pending' | 'verified' | 'golden'>('none');

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      const response = await verificationService.getVerificationStatus();
      const status = response.status || response;
      if (status === 'golden' || status.isGoldenVerified) {
        setCurrentStatus('golden');
      } else if (status === 'verified' || status.isVerified) {
        setCurrentStatus('verified');
      } else if (status === 'pending' || status.pendingRequest) {
        setCurrentStatus('pending');
      } else {
        setCurrentStatus('none');
      }
    } catch (error) {
      logger.error('Load verification status error:', error);
    }
  };

  const handleRequestVerification = async () => {
    setLoading(true);
    try {
      await verificationService.requestVerification({
        type: verificationType,
        reason: `Requesting ${verificationType} verification`,
      });
      Alert.alert(
        'Verification Requested',
        'Your verification request has been submitted. We will review your account and notify you of the decision.',
        [{ text: 'OK' }]
      );
      setCurrentStatus('pending');
    } catch (error) {
      logger.error('Request verification error:', error);
      Alert.alert('Error', 'Failed to submit verification request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Account Verification" />
      <View style={styles.content}>
        {currentStatus === 'verified' && (
          <View style={styles.verifiedBadge}>
            <Icon name="verified" size={32} color={Colors.accent} />
            <Text style={styles.verifiedText}>Your account is verified</Text>
          </View>
        )}

        {currentStatus === 'golden' && (
          <View style={styles.goldenBadge}>
            <Icon name="workspace-premium" size={32} color="#FFD700" />
            <Text style={styles.goldenText}>Your account is golden verified</Text>
          </View>
        )}

        {currentStatus === 'pending' && (
          <View style={styles.pendingBadge}>
            <Icon name="schedule" size={32} color={Colors.accent} />
            <Text style={styles.pendingText}>Verification request pending review</Text>
          </View>
        )}

        {currentStatus === 'none' && (
          <>
            <Text style={styles.title}>Get Verified</Text>
            <Text style={styles.description}>
              Verified accounts help establish authenticity and credibility. Choose the verification type that best fits your account.
            </Text>

            <View style={styles.verificationTypes}>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  verificationType === 'standard' && styles.selectedType,
                ]}
                onPress={() => setVerificationType('standard')}
              >
                <Icon name="verified" size={40} color={Colors.accent} />
                <Text style={styles.typeTitle}>Standard Verification</Text>
                <Text style={styles.typeDescription}>
                  Blue checkmark badge. For notable accounts, public figures, and established projects.
                </Text>
                <View style={styles.requirements}>
                  <Text style={styles.requirementsTitle}>Requirements:</Text>
                  <Text style={styles.requirement}>• Authentic account</Text>
                  <Text style={styles.requirement}>• Notable presence</Text>
                  <Text style={styles.requirement}>• Active account</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeCard,
                  verificationType === 'golden' && styles.selectedType,
                ]}
                onPress={() => setVerificationType('golden')}
              >
                <Icon name="workspace-premium" size={40} color="#FFD700" />
                <Text style={styles.typeTitle}>Golden Verification</Text>
                <Text style={styles.typeDescription}>
                  Golden checkmark badge. For premium accounts, top projects, and industry leaders.
                </Text>
                <View style={styles.requirements}>
                  <Text style={styles.requirementsTitle}>Requirements:</Text>
                  <Text style={styles.requirement}>• All standard requirements</Text>
                  <Text style={styles.requirement}>• 10k+ followers</Text>
                  <Text style={styles.requirement}>• Premium subscription</Text>
                  <Text style={styles.requirement}>• Exceptional content quality</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRequestVerification}
              disabled={loading}
            >
              {loading ? (
                <LoadingSpinner />
              ) : (
                <Text style={styles.buttonText}>
                  Request {verificationType === 'golden' ? 'Golden' : ''} Verification
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
  verifiedBadge: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 24,
  },
  verifiedText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
  },
  goldenBadge: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  goldenText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
  },
  pendingBadge: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 24,
  },
  pendingText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
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
    marginBottom: 32,
    lineHeight: 24,
  },
  verificationTypes: {
    gap: 20,
    marginBottom: 32,
  },
  typeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  selectedType: {
    borderColor: Colors.accent,
  },
  typeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  typeDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  requirements: {
    width: '100%',
    marginTop: 12,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  requirement: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
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

