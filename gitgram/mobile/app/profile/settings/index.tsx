import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Switch, Alert } from 'react-native';
import { ThemedView } from '../../../components/ui/ThemedView';
import { ThemedText } from '../../../components/ui/ThemedText';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Colors } from '../../../constants/Colors';
import { useAuthStore } from '../../../store/authStore';
import { userService } from '../../../services/userService';
import { useRouter } from 'expo-router';

export default function AccountSettingsScreen() {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const response = await userService.updateProfile({
        username: username.trim(),
        bio: bio.trim(),
        isPrivate,
      });

      // Update the user in the auth store with the new data
      if (response.user && user) {
        setUser({
          ...user,
          username: response.user.username,
          bio: response.user.bio,
          isPrivate: response.user.isPrivate,
        });
      }

      Alert.alert('Success', 'Profile updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Failed to update profile';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Profile</ThemedText>
          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
          />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself"
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Privacy</ThemedText>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">Private Account</ThemedText>
              <ThemedText type="caption">Only followers can see your posts</ThemedText>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={'#FFFFFF'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Security</ThemedText>
          <Button
            title="Change Password"
            variant="outline"
            style={styles.button}
            onPress={() => {}}
          />
          <Button
            title="Two-Factor Authentication"
            variant="outline"
            style={styles.button}
            onPress={() => {}}
          />
        </View>

        <Button title="Save Changes" onPress={handleSave} size="lg" loading={isSaving} disabled={isSaving} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  button: {
    marginBottom: 12,
  },
});

