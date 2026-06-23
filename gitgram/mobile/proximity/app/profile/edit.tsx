import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

import { apiClient, API_BASE, getAuthToken } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'gitgram_auth_token';
const BIO_MAX_LENGTH = 160;
const USERNAME_DEBOUNCE_MS = 600;

const Colors = {
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  success: '#34D399',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileFields {
  displayName: string;
  username: string;
  bio: string;
  githubUsername: string;
  twitterHandle: string;
  websiteUrl: string;
  location: string;
  jobTitle: string;
  company: string;
}

interface FetchedProfile extends ProfileFields {
  avatarUrl: string | null;
}

interface ProfileResponse {
  data: FetchedProfile;
}

interface UsernameCheckResponse {
  data: { available: boolean };
}

interface AvatarUploadResponse {
  data: { avatarUrl: string };
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

// ---------------------------------------------------------------------------
// Helper — get token from SecureStore (mirrors useAuth)
// ---------------------------------------------------------------------------

async function getBearerToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return await getAuthToken();
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchProfile(): Promise<FetchedProfile> {
  const response = await apiClient<ProfileResponse>('/api/v1/users/profile');
  return response.data;
}

async function patchProfile(fields: ProfileFields): Promise<void> {
  await apiClient<unknown>('/api/v1/users/profile', {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

async function checkUsernameAvailability(username: string): Promise<boolean> {
  const response = await apiClient<UsernameCheckResponse>(
    `/api/v1/users/check-username?username=${encodeURIComponent(username)}`,
    { skipAuth: false },
  );
  return response.data.available;
}

async function uploadAvatar(localUri: string): Promise<string> {
  const token = await getBearerToken();

  const formData = new FormData();
  const filename = localUri.split('/').pop() ?? 'avatar.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

  formData.append('avatar', {
    uri: localUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const response = await fetch(`${API_BASE}/api/v1/upload/avatar`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body?.error?.message ?? 'Avatar upload failed');
  }

  const json = (await response.json()) as AvatarUploadResponse;
  return json.data.avatarUrl;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LabeledInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'url' | 'email-address';
  onBlur?: () => void;
  accessoryRight?: React.ReactNode;
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  onBlur,
  accessoryRight,
}: LabeledInputProps): React.ReactElement {
  return (
    <View style={inputStyles.wrapper}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={inputStyles.row}>
        <TextInput
          style={[
            inputStyles.input,
            multiline && inputStyles.inputMultiline,
            accessoryRight != null && inputStyles.inputWithAccessory,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline={multiline}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onBlur={onBlur}
          autoCorrect={false}
          spellCheck={false}
        />
        {accessoryRight != null && (
          <View style={inputStyles.accessory}>{accessoryRight}</View>
        )}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputMultiline: {
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  inputWithAccessory: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  accessory: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 0,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileEditScreen(): React.ReactElement {
  const router = useRouter();

  // Remote avatar (confirmed) vs local pick
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [fields, setFields] = useState<ProfileFields>({
    displayName: '',
    username: '',
    bio: '',
    githubUsername: '',
    twitterHandle: '',
    websiteUrl: '',
    location: '',
    jobTitle: '',
    company: '',
  });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [originalUsername, setOriginalUsername] = useState('');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Load existing profile on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    fetchProfile()
      .then((profile) => {
        if (cancelled) return;
        setAvatarUrl(profile.avatarUrl);
        setOriginalUsername(profile.username);
        setFields({
          displayName: profile.displayName ?? '',
          username: profile.username,
          bio: profile.bio ?? '',
          githubUsername: profile.githubUsername ?? '',
          twitterHandle: profile.twitterHandle ?? '',
          websiteUrl: profile.websiteUrl ?? '',
          location: profile.location ?? '',
          jobTitle: profile.jobTitle ?? '',
          company: profile.company ?? '',
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        Alert.alert('Error', message);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Field updater (immutable)
  // -------------------------------------------------------------------------

  const updateField = useCallback(
    <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
      setFields((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Username availability check (debounced)
  // -------------------------------------------------------------------------

  const handleUsernameChange = useCallback(
    (text: string) => {
      updateField('username', text);

      if (usernameDebounceRef.current != null) {
        clearTimeout(usernameDebounceRef.current);
      }

      if (text.trim() === '' || text === originalUsername) {
        setUsernameStatus('idle');
        return;
      }

      setUsernameStatus('checking');
      usernameDebounceRef.current = setTimeout(async () => {
        try {
          const available = await checkUsernameAvailability(text.trim());
          setUsernameStatus(available ? 'available' : 'taken');
        } catch {
          setUsernameStatus('error');
        }
      }, USERNAME_DEBOUNCE_MS);
    },
    [originalUsername, updateField],
  );

  const handleUsernameBlur = useCallback(() => {
    if (usernameDebounceRef.current != null) {
      clearTimeout(usernameDebounceRef.current);
      usernameDebounceRef.current = null;
    }

    const text = fields.username.trim();
    if (text === '' || text === originalUsername) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    checkUsernameAvailability(text)
      .then((available) => setUsernameStatus(available ? 'available' : 'taken'))
      .catch(() => setUsernameStatus('error'));
  }, [fields.username, originalUsername]);

  // -------------------------------------------------------------------------
  // Avatar picker
  // -------------------------------------------------------------------------

  const handlePickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to change your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || result.assets.length === 0) return;

    const picked = result.assets[0];
    setLocalAvatarUri(picked.uri);
    setAvatarUploading(true);

    try {
      const remoteUrl = await uploadAvatar(picked.uri);
      setAvatarUrl(remoteUrl);
      setLocalAvatarUri(null);
    } catch (err: unknown) {
      setLocalAvatarUri(null);
      const message = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload failed', message);
    } finally {
      setAvatarUploading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (usernameStatus === 'taken') {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }
    if (usernameStatus === 'checking') {
      Alert.alert('Please wait', 'Username check is still in progress.');
      return;
    }
    if (fields.username.trim() === '') {
      Alert.alert('Validation', 'Username cannot be empty.');
      return;
    }
    if (avatarUploading) {
      Alert.alert('Please wait', 'Avatar is still uploading.');
      return;
    }

    setSaving(true);
    try {
      await patchProfile({ ...fields, username: fields.username.trim() });
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  }, [fields, usernameStatus, avatarUploading, router]);

  // -------------------------------------------------------------------------
  // Username status indicator
  // -------------------------------------------------------------------------

  const usernameAccessory = ((): React.ReactNode => {
    if (fields.username === originalUsername) return null;
    switch (usernameStatus) {
      case 'checking':
        return <ActivityIndicator size="small" color={Colors.primaryLight} />;
      case 'available':
        return <Text style={styles.statusAvailable}>✓</Text>;
      case 'taken':
        return <Text style={styles.statusTaken}>✕</Text>;
      case 'error':
        return <Text style={styles.statusTaken}>!</Text>;
      default:
        return null;
    }
  })();

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Resolved avatar source
  // -------------------------------------------------------------------------

  const displayAvatarUri = localAvatarUri ?? avatarUrl;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.headerButtonText}>Cancel</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        <Pressable
          onPress={handleSave}
          style={[styles.headerButton, styles.headerButtonRight]}
          disabled={saving || avatarUploading}
          accessibilityLabel="Save profile"
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={[styles.headerButtonText, styles.headerSaveText]}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable
            onPress={handlePickAvatar}
            disabled={avatarUploading}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            style={styles.avatarContainer}
          >
            {displayAvatarUri != null ? (
              <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarPlaceholderText}>
                  {fields.displayName.trim().charAt(0).toUpperCase() ||
                    fields.username.charAt(0).toUpperCase() ||
                    '?'}
                </Text>
              </View>
            )}
            <View style={styles.avatarOverlay}>
              {avatarUploading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.cameraIcon}>📷</Text>
              )}
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        {/* Fields */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          <LabeledInput
            label="Display Name"
            value={fields.displayName}
            onChangeText={(text) => updateField('displayName', text)}
            placeholder="Your full name"
            autoCapitalize="words"
          />

          <LabeledInput
            label="Username"
            value={fields.username}
            onChangeText={handleUsernameChange}
            onBlur={handleUsernameBlur}
            placeholder="username"
            autoCapitalize="none"
            accessoryRight={usernameAccessory}
          />
          {usernameStatus === 'taken' && (
            <Text style={styles.fieldError}>Username is already taken.</Text>
          )}

          <View style={styles.bioWrapper}>
            <LabeledInput
              label="Bio"
              value={fields.bio}
              onChangeText={(text) => updateField('bio', text.slice(0, BIO_MAX_LENGTH))}
              placeholder="Tell us about yourself…"
              multiline
              maxLength={BIO_MAX_LENGTH}
              autoCapitalize="sentences"
            />
            <Text style={styles.bioCounter}>
              {fields.bio.length}/{BIO_MAX_LENGTH}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social</Text>

          <LabeledInput
            label="GitHub Username"
            value={fields.githubUsername}
            onChangeText={(text) => updateField('githubUsername', text)}
            placeholder="octocat"
            autoCapitalize="none"
          />

          <LabeledInput
            label="Twitter / X Handle"
            value={fields.twitterHandle}
            onChangeText={(text) => updateField('twitterHandle', text)}
            placeholder="handle (without @)"
            autoCapitalize="none"
          />

          <LabeledInput
            label="Website"
            value={fields.websiteUrl}
            onChangeText={(text) => updateField('websiteUrl', text)}
            placeholder="https://yoursite.com"
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={[styles.section, styles.sectionLast]}>
          <Text style={styles.sectionTitle}>Work</Text>

          <LabeledInput
            label="Location"
            value={fields.location}
            onChangeText={(text) => updateField('location', text)}
            placeholder="San Francisco, CA"
            autoCapitalize="words"
          />

          <LabeledInput
            label="Job Title"
            value={fields.jobTitle}
            onChangeText={(text) => updateField('jobTitle', text)}
            placeholder="Software Engineer"
            autoCapitalize="words"
          />

          <LabeledInput
            label="Company"
            value={fields.company}
            onChangeText={(text) => updateField('company', text)}
            placeholder="Acme Corp"
            autoCapitalize="words"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 90;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  headerButton: {
    minWidth: 60,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerButtonRight: {
    alignItems: 'flex-end',
  },
  headerButtonText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  headerSaveText: {
    color: Colors.primary,
    fontWeight: '600',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.surfaceElevated,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarPlaceholderText: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  cameraIcon: {
    fontSize: 13,
  },
  avatarHint: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textMuted,
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionLast: {
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // Bio
  bioWrapper: {
    position: 'relative',
  },
  bioCounter: {
    position: 'absolute',
    bottom: 26,
    right: 10,
    fontSize: 11,
    color: Colors.textMuted,
  },

  // Username status
  statusAvailable: {
    fontSize: 18,
    color: Colors.success,
    fontWeight: '700',
  },
  statusTaken: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '700',
  },
  fieldError: {
    marginTop: -14,
    marginBottom: 16,
    fontSize: 12,
    color: Colors.error,
    paddingHorizontal: 2,
  },
});
