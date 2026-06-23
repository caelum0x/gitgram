import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../utils/logger';
import { storyService } from '../../services/storyService';
import { Alert } from 'react-native';

export default function StorySettingsScreen() {
  const [hideStoryFrom, setHideStoryFrom] = useState<string[]>([]);
  const [allowReplies, setAllowReplies] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [saveToArchive, setSaveToArchive] = useState(true);

  const handleSave = async () => {
    try {
      await storyService.updateStorySettings({
        allowReplies,
        allowReactions,
        saveToArchive,
        hideStoryFrom,
      });
      Alert.alert('Success', 'Story settings saved');
    } catch (error) {
      logger.error('Save story settings error:', error);
      Alert.alert('Error', 'Failed to save story settings');
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Story Settings"
        rightIcon="check"
        onRightPress={handleSave}
      />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Replies</Text>
              <Text style={styles.settingDescription}>
                Let people reply to your stories
              </Text>
            </View>
            <Switch
              value={allowReplies}
              onValueChange={setAllowReplies}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Allow Reactions</Text>
              <Text style={styles.settingDescription}>
                Let people react to your stories
              </Text>
            </View>
            <Switch
              value={allowReactions}
              onValueChange={setAllowReactions}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Archive</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Save to Archive</Text>
              <Text style={styles.settingDescription}>
                Automatically save expired stories to archive
              </Text>
            </View>
            <Switch
              value={saveToArchive}
              onValueChange={setSaveToArchive}
              trackColor={{ false: Colors.border, true: Colors.accent }}
            />
          </View>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

