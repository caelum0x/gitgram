import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import { backupService } from '../../services/backupService';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ImportDataScreen() {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/csv'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      logger.error('Pick file error:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a file to import');
      return;
    }

    Alert.alert(
      'Import Data',
      'Are you sure you want to import this data? This may overwrite existing data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setLoading(true);
            try {
              await backupService.importData(selectedFile.uri);
              Alert.alert('Success', 'Data imported successfully');
              setSelectedFile(null);
            } catch (error) {
              logger.error('Import data error:', error);
              Alert.alert('Error', 'Failed to import data. Please check the file format.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Import Data" />
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Import your data from a previously exported file. Supported formats: JSON, CSV
        </Text>

        <TouchableOpacity
          style={styles.filePicker}
          onPress={handlePickFile}
          disabled={loading}
        >
          <Icon name="upload-file" size={32} color={Colors.accent} />
          <Text style={styles.filePickerText}>
            {selectedFile ? selectedFile.name : 'Select File'}
          </Text>
          <Text style={styles.filePickerHint}>
            {selectedFile ? 'Tap to change' : 'Tap to browse'}
          </Text>
        </TouchableOpacity>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text style={styles.fileInfoLabel}>Selected File:</Text>
            <Text style={styles.fileInfoValue}>{selectedFile.name}</Text>
            <Text style={styles.fileInfoSize}>
              {(selectedFile.size / 1024).toFixed(2)} KB
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.importButton, (!selectedFile || loading) && styles.buttonDisabled]}
          onPress={handleImport}
          disabled={!selectedFile || loading}
        >
          {loading ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.importButtonText}>Import Data</Text>
          )}
        </TouchableOpacity>

        <View style={styles.warning}>
          <Icon name="warning" size={20} color={Colors.error || '#ff4444'} />
          <Text style={styles.warningText}>
            Warning: Importing data may overwrite existing content. Make sure you have a backup.
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
    padding: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 32,
  },
  filePicker: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  filePickerText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  filePickerHint: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  fileInfo: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  fileInfoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  fileInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  fileInfoSize: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  importButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  warning: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

