import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../../components/ui/ThemedView';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../../constants/Colors';
import { storyService } from '../../../services/storyService';
import { logger } from '../../../utils/logger';

export default function CreateStoryScreen() {
  const router = useRouter();
  const [type, setType] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    requestPermission();
  }, []);

  const uploadStory = async (uri: string, mediaType: 'image' | 'video' = 'image') => {
    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('media', {
        uri,
        type: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
        name: `story.${mediaType === 'image' ? 'jpg' : 'mp4'}`,
      } as any);
      formData.append('mediaType', mediaType);

      await storyService.createStory(formData);

      // Navigate back to home after successful upload
      router.back();
    } catch (err) {
      logger.error('Failed to upload story:', err);
      setError('Failed to create story. Please try again.');
      Alert.alert(
        'Upload Failed',
        'Failed to create story. Please try again.',
        [{ text: 'OK', onPress: () => setError(null) }]
      );
    } finally {
      setIsUploading(false);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current && !isUploading) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
        });

        if (photo?.uri) {
          await uploadStory(photo.uri, 'image');
        }
      } catch (err) {
        logger.error('Failed to take picture:', err);
        Alert.alert('Error', 'Failed to capture photo. Please try again.');
      }
    }
  };

  const pickFromGallery = async () => {
    if (isUploading) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to access your media library.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        await uploadStory(asset.uri, mediaType);
      }
    } catch (err) {
      logger.error('Failed to pick from gallery:', err);
      Alert.alert('Error', 'Failed to select media. Please try again.');
    }
  };

  if (!permission?.granted) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon name="camera-alt" size={64} color={Colors.textSecondary} />
          <Text style={styles.permissionText}>Camera permission is required</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <CameraView style={styles.camera} facing={type} ref={cameraRef}>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            disabled={isUploading}
          >
            <Icon name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          {/* Loading Overlay */}
          {isUploading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={styles.loadingText}>Creating story...</Text>
            </View>
          )}

          <View style={styles.bottomControls}>
            <TouchableOpacity
              onPress={pickFromGallery}
              disabled={isUploading}
              style={isUploading ? styles.disabledButton : undefined}
            >
              <Icon name="photo-library" size={32} color={isUploading ? '#666' : '#FFF'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, isUploading && styles.disabledCaptureButton]}
              onPress={takePicture}
              disabled={isUploading}
            >
              <View style={[styles.captureInner, isUploading && styles.disabledCaptureInner]} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setType((current: CameraType) => (
                  current === 'back' ? 'front' : 'back'
                ));
              }}
              disabled={isUploading}
              style={isUploading ? styles.disabledButton : undefined}
            >
              <Icon name="flip-camera-ios" size={32} color={isUploading ? '#666' : '#FFF'} />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  controls: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
  },
  closeButton: {
    alignSelf: 'flex-start',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledCaptureButton: {
    borderColor: '#666',
  },
  disabledCaptureInner: {
    backgroundColor: '#666',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
});
