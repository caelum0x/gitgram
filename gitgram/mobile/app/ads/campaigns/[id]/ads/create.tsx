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
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Image } from 'expo-image';
import { Colors } from '../../../../../constants/Colors';
import Header from '../../../../../components/navigation/Header';
import { adService } from '../../../../../services/adService';
import { logger } from '../../../../../utils/logger';



export default function CreateAdScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    callToAction: '',
    destinationUrl: '',
    placement: ['feed'] as string[],
    priority: '0',
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setMedia(result.assets[0]);
    }
  };

  const handleCreate = async () => {
    if (!formData.title && !media) {
      Alert.alert('Error', 'Please provide either a title or upload media');
      return;
    }

    try {
      setLoading(true);
      const ad = await adService.createAd(
        {
          campaignId,
          title: formData.title || undefined,
          content: formData.content || undefined,
          callToAction: formData.callToAction || undefined,
          destinationUrl: formData.destinationUrl || undefined,
          placement: formData.placement,
          priority: parseInt(formData.priority) || 0,
        },
        media
      );

      Alert.alert('Success', 'Ad created successfully! It will be reviewed before going live.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      logger.error('Create ad error:', error);
      Alert.alert('Error', error.message || 'Failed to create ad');
    } finally {
      setLoading(false);
    }
  };

  const togglePlacement = (placement: string) => {
    setFormData((prev) => ({
      ...prev,
      placement: prev.placement.includes(placement)
        ? prev.placement.filter((p) => p !== placement)
        : [...prev.placement, placement],
    }));
  };

  return (
    <View style={styles.container}>
      <Header title="Create Ad" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.label}>Ad Title</Text>
        <TextInput
          style={styles.input}
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
          placeholder="Enter ad title"
          placeholderTextColor={Colors.textSecondary}
        />

        <Text style={styles.label}>Ad Content</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.content}
          onChangeText={(text) => setFormData({ ...formData, content: text })}
          placeholder="Enter ad description"
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Media</Text>
        <TouchableOpacity style={styles.mediaButton} onPress={pickImage}>
          {media ? (
            <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.mediaPlaceholderText}>Tap to select image</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>Call to Action</Text>
        <TextInput
          style={styles.input}
          value={formData.callToAction}
          onChangeText={(text) => setFormData({ ...formData, callToAction: text })}
          placeholder="e.g., Learn More, Shop Now"
          placeholderTextColor={Colors.textSecondary}
        />

        <Text style={styles.label}>Destination URL</Text>
        <TextInput
          style={styles.input}
          value={formData.destinationUrl}
          onChangeText={(text) => setFormData({ ...formData, destinationUrl: text })}
          placeholder="https://example.com"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="url"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Placement</Text>
        <View style={styles.placementSelector}>
          {['feed', 'reels', 'stories', 'explore'].map((placement) => (
            <TouchableOpacity
              key={placement}
              style={[
                styles.placementOption,
                formData.placement.includes(placement) && styles.placementOptionSelected,
              ]}
              onPress={() => togglePlacement(placement)}
            >
              <Text
                style={[
                  styles.placementText,
                  formData.placement.includes(placement) && styles.placementTextSelected,
                ]}
              >
                {placement.charAt(0).toUpperCase() + placement.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Priority (0-100)</Text>
        <TextInput
          style={styles.input}
          value={formData.priority}
          onChangeText={(text) => setFormData({ ...formData, priority: text })}
          placeholder="0"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.createButtonText}>Create Ad</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            • Your ad will be reviewed before going live
          </Text>
          <Text style={styles.infoText}>
            • Ads are subject to content policy guidelines
          </Text>
        </View>
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
  mediaButton: {
    marginBottom: 16,
  },
  mediaPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  mediaPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPlaceholderText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  placementSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  placementOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placementOptionSelected: {
    backgroundColor: Colors.primary || '#007AFF',
    borderColor: Colors.primary || '#007AFF',
  },
  placementText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  placementTextSelected: {
    color: 'white',
    fontWeight: '600',
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
  infoBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
});
