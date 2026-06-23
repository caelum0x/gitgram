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
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { userService } from '../../../services/userService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function GoldenVerificationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    Alert.alert(
      'Request Golden Verification',
      'Golden verification requires:\n\n• Standard verification\n• 10,000+ followers\n• Premium subscription\n• Exceptional content quality\n\nDo you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            setLoading(true);
            try {
              await userService.requestVerification('golden', 'Requesting golden verification', undefined);
              Alert.alert(
                'Request Submitted',
                'Your golden verification request has been submitted. We will review your account and notify you of the decision.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              logger.error('Request golden verification error:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to submit request.');
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
      <Header title="Golden Verification" />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Icon name="workspace-premium" size={80} color="#FFD700" />
        </View>

        <Text style={styles.title}>Golden Verification</Text>
        <Text style={styles.description}>
          Upgrade to golden verification and unlock premium features. Golden verified accounts get:
        </Text>

        <View style={styles.benefitsList}>
          <View style={styles.benefitItem}>
            <Icon name="check-circle" size={24} color="#FFD700" />
            <Text style={styles.benefitText}>Golden checkmark badge</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="check-circle" size={24} color="#FFD700" />
            <Text style={styles.benefitText}>Premium features access</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="check-circle" size={24} color="#FFD700" />
            <Text style={styles.benefitText}>Priority support</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="check-circle" size={24} color="#FFD700" />
            <Text style={styles.benefitText}>Enhanced analytics</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="check-circle" size={24} color="#FFD700" />
            <Text style={styles.benefitText}>Exclusive features</Text>
          </View>
        </View>

        <View style={styles.requirementsSection}>
          <Text style={styles.requirementsTitle}>Requirements</Text>
          <View style={styles.requirementItem}>
            <Text style={styles.requirementText}>✓ Standard verification</Text>
          </View>
          <View style={styles.requirementItem}>
            <Text style={styles.requirementText}>✓ 10,000+ followers</Text>
          </View>
          <View style={styles.requirementItem}>
            <Text style={styles.requirementText}>✓ Premium subscription</Text>
          </View>
          <View style={styles.requirementItem}>
            <Text style={styles.requirementText}>✓ Exceptional content quality</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.requestButton, loading && styles.buttonDisabled]}
          onPress={handleRequest}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.requestButtonText}>Request Golden Verification</Text>
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
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
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
  benefitsList: {
    width: '100%',
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  benefitText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  requirementsSection: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  requirementsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  requirementItem: {
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 14,
    color: Colors.text,
  },
  requestButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
});

