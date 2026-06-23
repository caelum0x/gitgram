import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../../constants/Colors';
import Header from '../../../../components/navigation/Header';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { messageService } from '../../../../services/messageService';
import { logger } from '../../../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function GroupChatSettingsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroup();
  }, [groupId]);

  const loadGroup = async () => {
    try {
      const response = await messageService.getGroupChat(groupId!);
      setGroup(response.group || response);
    } catch (error) {
      logger.error('Load group error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await messageService.leaveGroup(groupId!);
              router.back();
            } catch (error) {
              logger.error('Leave group error:', error);
              Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Group Settings" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Group Settings" />
      <ScrollView style={styles.content}>
        {group && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Group Info</Text>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.memberCount}>
                {group.members?.length || 0} members
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Members</Text>
              <FlatList
                data={group.members || []}
                renderItem={({ item }) => (
                  <View style={styles.memberItem}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                          {item.username[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.memberName}>@{item.username}</Text>
                  </View>
                )}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>

            <TouchableOpacity
              style={styles.leaveButton}
              onPress={handleLeaveGroup}
            >
              <Text style={styles.leaveButtonText}>Leave Group</Text>
            </TouchableOpacity>
          </>
        )}
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
  groupName: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  memberCount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberName: {
    fontSize: 16,
    color: Colors.text,
  },
  leaveButton: {
    backgroundColor: Colors.error || '#ff4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  leaveButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

