import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import { userService } from '../../../services/userService';
import { messageService } from '../../../services/messageService';
import { logger } from '../../../utils/logger';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CreateGroupChatScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await userService.searchUsers('', 1, 50);
      setUsers(response.users || []);
    } catch (error) {
      logger.error('Load users error:', error);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (selectedUsers.length < 2) {
      Alert.alert('Error', 'Please select at least 2 users');
      return;
    }

    setLoading(true);
    try {
      await messageService.createGroupChat({ name: groupName, userIds: selectedUsers });
      Alert.alert('Success', 'Group chat created', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Create group chat error:', error);
      Alert.alert('Error', 'Failed to create group chat');
    } finally {
      setLoading(false);
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => toggleUser(item.id)}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.username[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        {item.bio && (
          <Text style={styles.bio} numberOfLines={1}>
            {item.bio}
          </Text>
        )}
      </View>
      {selectedUsers.includes(item.id) && (
        <Icon name="check-circle" size={24} color={Colors.accent} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header
        title="New Group Chat"
        rightIcon="check"
        onRightPress={handleCreate}
      />
      <View style={styles.form}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter group name"
          placeholderTextColor={Colors.textSecondary}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />
      </View>

      <Text style={styles.sectionTitle}>
        Select Users ({selectedUsers.length} selected)
      </Text>
      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  form: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    padding: 16,
    paddingBottom: 8,
  },
  listContent: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});

