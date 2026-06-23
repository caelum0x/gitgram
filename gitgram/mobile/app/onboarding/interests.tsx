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
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { userService } from '../../services/userService';

const interests = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'React',
  'Vue',
  'Angular',
  'Node.js',
  'Express',
  'Django',
  'Flask',
  'Spring',
  'Mobile Development',
  'Web Development',
  'Machine Learning',
  'AI',
  'Data Science',
  'DevOps',
  'Cloud Computing',
  'Blockchain',
  'Cybersecurity',
  'Game Development',
  'UI/UX Design',
  'Open Source',
];

export default function InterestsScreen() {
  const router = useRouter();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleContinue = async () => {
    if (selectedInterests.length === 0) {
      Alert.alert('Select Interests', 'Please select at least one interest');
      return;
    }

    setLoading(true);
    try {
      await userService.saveInterests(selectedInterests);
      router.replace('/(tabs)/home');
    } catch (error) {
      logger.error('Save interests error:', error);
      Alert.alert('Error', 'Failed to save interests');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Select Your Interests" />
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Select your interests to personalize your feed
        </Text>

        <View style={styles.interestsGrid}>
          {interests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[
                styles.interestChip,
                selectedInterests.includes(interest) && styles.selectedChip,
              ]}
              onPress={() => toggleInterest(interest)}
            >
              <Text
                style={[
                  styles.interestText,
                  selectedInterests.includes(interest) && styles.selectedText,
                ]}
              >
                {interest}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (loading || selectedInterests.length === 0) && styles.buttonDisabled,
          ]}
          onPress={handleContinue}
          disabled={loading || selectedInterests.length === 0}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.continueButtonText}>
              Continue ({selectedInterests.length} selected)
            </Text>
          )}
        </TouchableOpacity>
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
    padding: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  selectedChip: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  interestText: {
    fontSize: 14,
    color: Colors.text,
  },
  selectedText: {
    color: Colors.text,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  continueButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

