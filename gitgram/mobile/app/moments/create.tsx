import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { Image } from 'expo-image';
import { momentService } from '../../services/momentService';

export default function CreateMomentScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraType, setCameraType] = useState<CameraType>('front');

  const captureScreenshot = async () => {
    try {
      // In a real app, you'd capture the current screen or allow user to select an image
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant access to photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setScreenshot(result.assets[0].uri);
      }
    } catch (error) {
      logger.error('Capture screenshot error:', error);
      Alert.alert('Error', 'Failed to capture screenshot');
    }
  };

  const captureSelfie = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Please grant camera access');
        return;
      }
    }

    try {
      setCapturing(true);
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
        });
        if (photo) {
          setSelfie(photo.uri);
        }
      }
    } catch (error) {
      logger.error('Capture selfie error:', error);
      Alert.alert('Error', 'Failed to capture selfie');
    } finally {
      setCapturing(false);
    }
  };

  const handleShare = async () => {
    if (!screenshot || !selfie) {
      Alert.alert('Error', 'Please capture both screenshot and selfie');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('screenshot', {
        uri: screenshot,
        type: 'image/jpeg',
        name: 'screenshot.jpg',
      } as any);
      formData.append('selfie', {
        uri: selfie,
        type: 'image/jpeg',
        name: 'selfie.jpg',
      } as any);
      
      await momentService.createMoment(formData);
      Alert.alert('Success', 'Moment shared!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Share moment error:', error);
      Alert.alert('Error', 'Failed to share moment');
    } finally {
      setUploading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Header title="Create Moment" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Create Moment" />
      
      <View style={styles.content}>
        <Text style={styles.instruction}>
          Capture a screenshot of your error/problem, then take a selfie showing your reaction!
        </Text>

        {/* Screenshot Preview */}
        <View style={styles.previewContainer}>
          <Text style={styles.label}>Screenshot</Text>
          {screenshot ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: screenshot }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => setScreenshot(null)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={captureScreenshot}
            >
              <Text style={styles.captureButtonText}>📸 Capture Screenshot</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selfie Camera */}
        <View style={styles.previewContainer}>
          <Text style={styles.label}>Your Reaction (Selfie)</Text>
          {selfie ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: selfie }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => setSelfie(null)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              {permission.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={cameraType}
                >
                  <View style={styles.cameraOverlay}>
                    <TouchableOpacity
                      style={styles.captureSelfieButton}
                      onPress={captureSelfie}
                      disabled={capturing}
                    >
                      <View style={styles.captureCircle} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.flipButton}
                      onPress={() => setCameraType(cameraType === 'front' ? 'back' : 'front')}
                    >
                      <Text style={styles.flipButtonText}>🔄</Text>
                    </TouchableOpacity>
                  </View>
                </CameraView>
              ) : (
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={requestPermission}
                >
                  <Text style={styles.captureButtonText}>Grant Camera Permission</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Share Button */}
        <TouchableOpacity
          style={[styles.shareButton, (!screenshot || !selfie || uploading) && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={!screenshot || !selfie || uploading}
        >
          {uploading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.shareButtonText}>Share Moment</Text>
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
  instruction: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  previewContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.error || '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  captureButton: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  captureButtonText: {
    fontSize: 16,
    color: Colors.accent,
    fontWeight: '600',
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  captureSelfieButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.text,
  },
  captureCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent,
  },
  flipButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonText: {
    fontSize: 20,
  },
  shareButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  shareButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

