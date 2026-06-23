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
import { backupService } from '../../services/backupService';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function ExportDataScreen() {
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    setLoading(true);
    try {
      await backupService.exportData(format);
      Alert.alert(
        'Export Started',
        `Your data export in ${format.toUpperCase()} format will be ready shortly. You'll receive a notification when it's complete.`
      );
    } catch (error) {
      logger.error('Export data error:', error);
      Alert.alert('Error', 'Failed to export data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Export Data" />
      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Export a copy of your data including posts, comments, messages, and account information.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export Format</Text>
          <TouchableOpacity
            style={styles.formatOption}
            onPress={() => handleExport('json')}
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

          <TouchableOpacity
            style={styles.formatOption}
            onPress={() => handleExport('csv')}
            disabled={loading}
          >
            <Icon name="table-chart" size={24} color={Colors.text} />
            <View style={styles.formatInfo}>
              <Text style={styles.formatLabel}>CSV</Text>
              <Text style={styles.formatDescription}>
                Spreadsheet format, easy to view
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Note: Large exports may take several minutes to process. You'll receive a notification when your export is ready.
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

