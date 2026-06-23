import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import {
  reportService,
  ReportReason,
  ReportTargetType,
  REPORT_REASON_LABELS,
  REPORT_REASON_DESCRIPTIONS,
} from '../../services/reportService';
import { logger } from '../../utils/logger';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string; // Optional name/title for display
}

const REPORT_REASONS: ReportReason[] = [
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE',
  'MISINFORMATION',
  'OTHER',
];

export default function ReportModal({
  visible,
  onClose,
  targetType,
  targetId,
  targetName,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'reason' | 'details'>('reason');

  const resetState = () => {
    setSelectedReason(null);
    setDescription('');
    setStep('reason');
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleReasonSelect = (reason: ReportReason) => {
    setSelectedReason(reason);
    setStep('details');
  };

  const handleBack = () => {
    setStep('reason');
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setLoading(true);
    try {
      await reportService.createReport({
        targetType,
        targetId,
        reason: selectedReason,
        description: description.trim() || undefined,
      });

      Alert.alert(
        'Report Submitted',
        'Thank you for reporting. Our team will review this content.',
        [{ text: 'OK', onPress: handleClose }]
      );
    } catch (error: any) {
      logger.error('Failed to submit report:', error);

      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to submit report. Please try again.';

      if (error.response?.status === 409) {
        Alert.alert('Already Reported', 'You have already reported this content.');
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTargetTypeLabel = () => {
    switch (targetType) {
      case 'POST': return 'post';
      case 'COMMENT': return 'comment';
      case 'USER': return 'user';
      case 'REEL': return 'reel';
      case 'STORY': return 'story';
      default: return 'content';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            {step === 'details' && (
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.title}>Report {getTargetTypeLabel()}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Handle bar indicator */}
          <View style={styles.handleBar} />

          {step === 'reason' ? (
            // Step 1: Select reason
            <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
              <Text style={styles.subtitle}>
                Why are you reporting this {getTargetTypeLabel()}?
              </Text>
              {targetName && (
                <Text style={styles.targetInfo} numberOfLines={1}>
                  {targetName}
                </Text>
              )}
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={styles.reasonItem}
                  onPress={() => handleReasonSelect(reason)}
                >
                  <View style={styles.reasonContent}>
                    <Text style={styles.reasonLabel}>
                      {REPORT_REASON_LABELS[reason]}
                    </Text>
                    <Text style={styles.reasonDescription}>
                      {REPORT_REASON_DESCRIPTIONS[reason]}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{'>'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            // Step 2: Add details and submit
            <View style={styles.detailsContainer}>
              <View style={styles.selectedReasonBadge}>
                <Text style={styles.selectedReasonText}>
                  {selectedReason && REPORT_REASON_LABELS[selectedReason]}
                </Text>
              </View>

              <Text style={styles.detailsLabel}>
                Additional details (optional)
              </Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Please provide any additional information that might help us review this report..."
                placeholderTextColor={Colors.textSecondary}
                multiline
                numberOfLines={4}
                maxLength={500}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/500</Text>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.text} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Report</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                Our moderation team will review your report and take appropriate action if necessary. False reports may result in restrictions on your account.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 34, // Safe area padding
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    padding: 4,
  },
  backButtonText: {
    color: Colors.accent,
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  closeButtonText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  targetInfo: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  reasonList: {
    marginTop: 8,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  reasonContent: {
    flex: 1,
    marginRight: 8,
  },
  reasonLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  reasonDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  detailsContainer: {
    padding: 16,
  },
  selectedReasonBadge: {
    backgroundColor: Colors.hover,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  selectedReasonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  detailsLabel: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
  },
  descriptionInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    minHeight: 100,
    maxHeight: 150,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: Colors.error,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
