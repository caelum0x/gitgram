import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../../utils/logger';
import { postService } from '../../../services/postService';

const reportReasons = [
  { id: 'spam', label: 'Spam' },
  { id: 'inappropriate', label: 'Inappropriate Content' },
  { id: 'harassment', label: 'Harassment or Bullying' },
  { id: 'violence', label: 'Violence or Dangerous Content' },
  { id: 'copyright', label: 'Copyright Violation' },
  { id: 'false-info', label: 'False Information' },
  { id: 'other', label: 'Other' },
];

export default function PostReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for reporting');
      return;
    }

    Alert.alert(
      'Report Post',
      'Are you sure you want to report this post?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Report',
          style: 'destructive',
          onPress: confirmReport,
        },
      ]
    );
  };

  const confirmReport = async () => {
    setLoading(true);
    try {
      await postService.reportPost(id!, { reason: selectedReason! });
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. We will review it shortly.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      logger.error('Report post error:', error);
      Alert.alert('Error', 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Report Post" />
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Help us understand the problem. Why are you reporting this post?
        </Text>

        {reportReasons.map((reason) => (
          <TouchableOpacity
            key={reason.id}
            style={[
              styles.reasonOption,
              selectedReason === reason.id && styles.reasonOptionSelected,
            ]}
            onPress={() => setSelectedReason(reason.id)}
          >
            <Text
              style={[
                styles.reasonLabel,
                selectedReason === reason.id && styles.reasonLabelSelected,
              ]}
            >
              {reason.label}
            </Text>
            {selectedReason === reason.id && (
              <Icon name="check-circle" size={24} color={Colors.accent} />
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading || !selectedReason}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Submitting...' : 'Submit Report'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    padding: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reasonOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  reasonLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  reasonLabelSelected: {
    fontWeight: '600',
    color: Colors.accent,
  },
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

