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
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { feedbackService } from '../../services/feedbackService';

export default function CreateFeedbackScreen() {
  const router = useRouter();
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const categories = [
    'Bug Report',
    'Feature Request',
    'UI/UX Feedback',
    'Performance Issue',
    'Other',
  ];

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!subject.trim()) {
      Alert.alert('Error', 'Please enter a subject');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter your feedback');
      return;
    }

    setLoading(true);
    try {
      const typeMap: Record<string, 'bug' | 'feature' | 'other'> = {
        'Bug Report': 'bug',
        'Feature Request': 'feature',
        'UI/UX Feedback': 'other',
        'Performance Issue': 'bug',
        'Other': 'other',
      };
      
      await feedbackService.createFeedback({
        type: typeMap[category] || 'other',
        title: subject,
        content: message,
      });
      Alert.alert(
        'Thank You!',
        'Your feedback has been submitted. We appreciate your input!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      logger.error('Submit feedback error:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Header title="Send Feedback" />
      <View style={styles.content}>
        <Text style={styles.label}>Category</Text>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryButton,
              category === cat && styles.selectedCategory,
            ]}
            onPress={() => setCategory(cat)}
          >
            <Text
              style={[
                styles.categoryText,
                category === cat && styles.selectedCategoryText,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief description of your feedback"
          placeholderTextColor={Colors.textSecondary}
          maxLength={100}
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="Please provide detailed feedback..."
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={8}
          maxLength={1000}
        />

        <Text style={styles.hint}>
          {message.length}/1000 characters
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.buttonText}>Submit Feedback</Text>
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
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  categoryButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCategory: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentBackground || Colors.surface,
  },
  categoryText: {
    fontSize: 16,
    color: Colors.text,
  },
  selectedCategoryText: {
    fontWeight: '600',
    color: Colors.accent,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: 'right',
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

