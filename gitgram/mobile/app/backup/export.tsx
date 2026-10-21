import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import {
  requestAndDownloadDataExport,
  shareExportFile,
  DataExportTimeoutError,
  DataExportPhase,
} from '../../utils/dataExportFlow';
import Icon from 'react-native-vector-icons/MaterialIcons';

const PHASE_MESSAGES: Record<DataExportPhase, string> = {
  requesting: 'Requesting your export…',
  processing: 'Preparing your export… this can take a couple of minutes.',
  downloading: 'Export ready — downloading…',
  done: 'Export downloaded. Opening share sheet…',
};

export default function ExportDataScreen() {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const { fileUri } = await requestAndDownloadDataExport((phase) => {
        setStatusMessage(PHASE_MESSAGES[phase]);
      });

      try {
        await shareExportFile(fileUri);
      } catch (shareError) {
        // The export downloaded fine; sharing it is best-effort, so surface
        // this but don't treat it as a failed export.
        logger.error('Share export file error:', shareError);
        Alert.alert(
          'Export Downloaded',
          'Your data export was downloaded but could not be opened for sharing. It is saved in app storage.'
        );
        return;
      }

      setStatusMessage('Your data export is ready.');
    } catch (error) {
      logger.error('Export data error:', error);
      Alert.alert(
        'Export Failed',
        error instanceof DataExportTimeoutError
          ? 'Still preparing your export. Please check back in a few minutes.'
          : error instanceof Error
            ? error.message
            : 'Failed to export data. Please try again.'
      );
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Export Data" />
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Export a copy of your data including posts, snippets, collections, messages, and account information.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export Format</Text>
          <TouchableOpacity
            style={[styles.formatOption, loading && styles.formatOptionDisabled]}
            onPress={handleExport}
            disabled={loading}
          >
            <Icon name="code" size={24} color={Colors.text} />
            <View style={styles.formatInfo}>
              <Text style={styles.formatLabel}>JSON</Text>
              <Text style={styles.formatDescription}>
                Machine-readable format, includes all data
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {statusMessage && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Note: Large exports may take a couple of minutes to process. Keep this screen open while your export is prepared, then use the share sheet to save or send the file.
          </Text>
        </View>
      </ScrollView>
      {loading && <LoadingSpinner />}
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  formatInfo: {
    flex: 1,
  },
  formatLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  formatDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  formatOptionDisabled: {
    opacity: 0.6,
  },
  statusBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    color: Colors.text,
  },
  note: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
  },
  noteText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

