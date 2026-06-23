import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { adCampaignService } from '../../../services/adCampaignService';
import { logger } from '../../../utils/logger';
import Header from '../../../components/navigation/Header';
import { Colors } from '../../../constants/Colors';

export default function CreateCampaignScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'post' as 'post' | 'reel' | 'story' | 'banner' | 'video',
    budget: '',
    dailyBudget: '',
    billingType: 'cpc' as 'cpc' | 'cpm' | 'cpa',
  });

  const handleCreate = async () => {
    if (!formData.name || !formData.budget) {
      Alert.alert('Error', 'Name and budget are required');
      return;
    }

    try {
      setLoading(true);
      const campaign = await adCampaignService.createCampaign({
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        budget: parseFloat(formData.budget),
        dailyBudget: formData.dailyBudget ? parseFloat(formData.dailyBudget) : undefined,
        billingType: formData.billingType,
      });

      Alert.alert('Success', 'Campaign created successfully!', [
        {
          text: 'OK',
          onPress: () => router.replace(`/ads/campaigns/${campaign.campaign.id}`),
        },
      ]);
    } catch (error: any) {
      logger.error('Create campaign error:', error);
      Alert.alert('Error', error.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Create Campaign" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.label}>Campaign Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
          placeholder="Enter campaign name"
          placeholderTextColor={Colors.textSecondary}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          placeholder="Enter campaign description"
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Ad Type *</Text>
        <View style={styles.typeSelector}>
          {['post', 'reel', 'story', 'banner', 'video'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeOption,
                formData.type === type && styles.typeOptionSelected,
              ]}
              onPress={() => setFormData({ ...formData, type: type as any })}
            >
              <Text
                style={[
                  styles.typeText,
                  formData.type === type && styles.typeTextSelected,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Total Budget ($) *</Text>
        <TextInput
          style={styles.input}
          value={formData.budget}
          onChangeText={(text) => setFormData({ ...formData, budget: text })}
          placeholder="0.00"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Daily Budget ($)</Text>
        <TextInput
          style={styles.input}
          value={formData.dailyBudget}
          onChangeText={(text) => setFormData({ ...formData, dailyBudget: text })}
          placeholder="Optional daily limit"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Billing Type *</Text>
        <View style={styles.billingSelector}>
          <TouchableOpacity
            style={[
              styles.billingOption,
              formData.billingType === 'cpc' && styles.billingOptionSelected,
            ]}
            onPress={() => setFormData({ ...formData, billingType: 'cpc' })}
          >
            <Text
              style={[
                styles.billingText,
                formData.billingType === 'cpc' && styles.billingTextSelected,
              ]}
            >
              CPC
            </Text>
            <Text style={styles.billingSubtext}>Cost Per Click</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.billingOption,
              formData.billingType === 'cpm' && styles.billingOptionSelected,
            ]}
            onPress={() => setFormData({ ...formData, billingType: 'cpm' })}
          >
            <Text
              style={[
                styles.billingText,
                formData.billingType === 'cpm' && styles.billingTextSelected,
              ]}
            >
              CPM
            </Text>
            <Text style={styles.billingSubtext}>Cost Per 1000 Impressions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.billingOption,
              formData.billingType === 'cpa' && styles.billingOptionSelected,
            ]}
            onPress={() => setFormData({ ...formData, billingType: 'cpa' })}
          >
            <Text
              style={[
                styles.billingText,
                formData.billingType === 'cpa' && styles.billingTextSelected,
              ]}
            >
              CPA
            </Text>
            <Text style={styles.billingSubtext}>Cost Per Action</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.createButtonText}>Create Campaign</Text>
          )}
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
  },
  contentContainer: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeOptionSelected: {
    backgroundColor: Colors.primary || '#007AFF',
    borderColor: Colors.primary || '#007AFF',
  },
  typeText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  typeTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  billingSelector: {
    gap: 12,
    marginBottom: 24,
  },
  billingOption: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  billingOptionSelected: {
    borderColor: Colors.primary || '#007AFF',
  },
  billingText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  billingTextSelected: {
    color: Colors.primary || '#007AFF',
  },
  billingSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  createButton: {
    backgroundColor: Colors.primary || '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 24,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

