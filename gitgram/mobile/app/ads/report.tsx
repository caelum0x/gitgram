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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { adService } from '../../services/adService';

export default function ReportAdScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const reportReasons = [
    'Misleading or false information',
    'Inappropriate content',
    'Spam or scam',
    'Offensive or hateful content',
    'Violence or dangerous content',
    'Other',
  ];

  const handleReport = async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Error', 'Invalid ad ID.');
      router.back();
      return;
    }
    if (!reason) {
      Alert.alert('Error', 'Please select a reason for reporting.');
      return;
    }

    setLoading(true);
    try {
      await adService.reportAd(id, { reason, details });
      Alert.alert('Report Submitted', 'Thank you for reporting. We will review this ad.');
      router.back();
    } catch (error: any) {
      logger.error('Report ad error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to submit report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Report Ad" />
      <View style={styles.content}>
        <Text style={styles.instruction}>
          Help us keep Gitgram safe by reporting ads that violate our policies.
        </Text>

        <Text style={styles.label}>Why are you reporting this ad?</Text>
        {reportReasons.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.reasonButton, reason === r && styles.selectedReason]}
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

        {reason === 'Other' && (
          <TextInput
            style={styles.detailsInput}
            placeholder="Please provide more details..."
            placeholderTextColor={Colors.textSecondary}
            value={details}
            onChangeText={setDetails}
            multiline
            numberOfLines={4}
          />
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleReport}
          disabled={loading || !reason}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
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
    padding: 16,
  },
  instruction: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  reasonButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
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
  detailsInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 20,
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: Colors.error || '#ff4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

