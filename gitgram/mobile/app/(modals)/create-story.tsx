import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/Colors';
import { storyService } from '../../services/storyService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useToast } from '../../hooks/useToast';

export default function CreateStoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant permission to access your media library.'
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadStory(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Pick image error:', error);
      showToast('Failed to pick image', 'error');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant permission to access your camera.'
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadStory(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Take photo error:', error);
      showToast('Failed to take photo', 'error');
    }
  };

  const uploadStory = async (uri: string, mediaType: 'image' | 'video') => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('media', {
        uri,
        type: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
        name: `story.${mediaType === 'image' ? 'jpg' : 'mp4'}`,
      } as any);
      formData.append('mediaType', mediaType);

      await storyService.createStory(formData);
      showToast('Story created successfully!', 'success');
      router.back();
    } catch (error) {
      console.error('Upload story error:', error);
      showToast('Failed to create story', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {ToastComponent}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Story</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.option} onPress={takePhoto}>
          <Text style={styles.optionIcon}>📷</Text>
          <Text style={styles.optionText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.option} onPress={pickImage}>
          <Text style={styles.optionIcon}>🖼️</Text>
          <Text style={styles.optionText}>Choose from Library</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelButton: {
    color: Colors.text,
    fontSize: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  option: {
    width: '100%',
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  optionIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  optionText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

