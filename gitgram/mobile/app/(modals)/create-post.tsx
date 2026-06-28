import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import { postService } from '../../services/postService';
import { scheduledPostsService } from '../../services/scheduledPostsService';
import { userService } from '../../services/userService';
import { logger } from '../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ImageAltTextDialog from '../../components/common/ImageAltTextDialog';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../hooks/useToast';

interface TaggablePerson {
  id: string;
  username: string;
  avatar?: string;
}

type MediaType = 'image' | 'video';

interface SelectedMedia {
  uri: string;
  type: MediaType;
  mimeType?: string;
  alt?: string;
}

const inferMediaType = (asset: ImagePicker.ImagePickerAsset): MediaType =>
  asset.type === 'video' ? 'video' : 'image';

const buildMimeType = (media: SelectedMedia, filename: string): string => {
  if (media.mimeType) return media.mimeType;
  const ext = /\.(\w+)$/.exec(filename)?.[1]?.toLowerCase();
  if (media.type === 'video') return ext ? `video/${ext}` : 'video/mp4';
  return ext ? `image/${ext}` : 'image/jpeg';
};

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ schedule?: string }>();
  const isScheduling = params.schedule === 'true';
  const altTextRequired = useSettingsStore((state) => state.altTextRequired);
  const { showToast, ToastComponent } = useToast();

  const [content, setContent] = useState('');
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [taggedPeople, setTaggedPeople] = useState<TaggablePerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [altDialogVisible, setAltDialogVisible] = useState(false);

  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [tagResults, setTagResults] = useState<TaggablePerson[]>([]);
  const [tagSearching, setTagSearching] = useState(false);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMedia({
        uri: asset.uri,
        type: inferMediaType(asset),
        mimeType: asset.mimeType,
      });
    }
  };

  const searchPeople = useCallback(async (query: string) => {
    setTagQuery(query);
    if (query.trim().length < 2) {
      setTagResults([]);
      return;
    }
    setTagSearching(true);
    try {
      const response = await userService.searchUsers(query.trim());
      setTagResults(response.users || response.data || []);
    } catch (error) {
      logger.error('Search users error:', error);
      setTagResults([]);
    } finally {
      setTagSearching(false);
    }
  }, []);

  const togglePerson = (person: TaggablePerson) => {
    setTaggedPeople((prev) =>
      prev.some((p) => p.id === person.id)
        ? prev.filter((p) => p.id !== person.id)
        : [...prev, person]
    );
  };

  const saveAltText = (altText: string) => {
    setMedia((prev) => (prev ? { ...prev, alt: altText } : prev));
  };

  const handlePost = async () => {
    if (!content && !media) return;

    // Enforce alt text on images when the preference is enabled (accessibility).
    if (altTextRequired && media?.type === 'image' && !media.alt?.trim()) {
      showToast('Please add alt text to your image before posting.', 'error');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('content', content);

      if (media) {
        const filename = media.uri.split('/').pop() || `upload.${media.type === 'video' ? 'mp4' : 'jpg'}`;
        formData.append('media', {
          uri: media.uri,
          name: filename,
          type: buildMimeType(media, filename),
        } as unknown as Blob);
        formData.append('mediaType', media.type);
        if (media.alt?.trim()) {
          formData.append('altTexts[]', media.alt.trim());
        }
      }

      taggedPeople.forEach((person) => {
        formData.append('taggedUserIds[]', person.id);
      });

      if (isScheduling) {
        // Schedule for one hour from now by default; the scheduled list lets the
        // user adjust the time afterwards via the edit screen.
        const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await scheduledPostsService.createScheduledPost({
          content,
          mediaUrls: media ? [media.uri] : undefined,
          scheduledFor,
        });
      } else {
        await postService.createPost(formData);
      }

      router.back();
    } catch (error) {
      logger.error('Create post error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText>Cancel</ThemedText>
        </TouchableOpacity>
        <ThemedText type="subtitle">{isScheduling ? 'Schedule Post' : 'New Post'}</ThemedText>
        <Button
          title={isScheduling ? 'Schedule' : 'Post'}
          onPress={handlePost}
          size="sm"
          loading={loading}
          disabled={!content && !media}
        />
      </View>

      <ScrollView style={styles.content}>
        <TextInput
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          value={content}
          onChangeText={setContent}
        />

        {media && (
          <View style={styles.mediaPreview}>
            {media.type === 'video' ? (
              <View style={[styles.image, styles.videoPlaceholder]}>
                <Icon name="play-circle-outline" size={48} color="#FFF" />
                <ThemedText style={styles.videoLabel}>Video selected</ThemedText>
              </View>
            ) : (
              <Image
                source={{ uri: media.uri }}
                style={styles.image}
                accessibilityLabel={media.alt || undefined}
              />
            )}
            <TouchableOpacity style={styles.removeButton} onPress={() => setMedia(null)}>
              <Icon name="close" size={20} color="#FFF" />
            </TouchableOpacity>
            {media.type === 'image' && (
              <TouchableOpacity
                style={styles.altButton}
                onPress={() => setAltDialogVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={media.alt ? 'Edit alt text' : 'Add alt text'}
              >
                <Icon
                  name={media.alt ? 'check-circle' : 'add-circle-outline'}
                  size={16}
                  color="#FFF"
                />
                <ThemedText style={styles.altButtonText}>
                  {media.alt ? 'ALT added' : 'Add alt text'}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {taggedPeople.length > 0 && (
          <View style={styles.taggedRow}>
            {taggedPeople.map((p) => (
              <TouchableOpacity key={p.id} style={styles.taggedChip} onPress={() => togglePerson(p)}>
                <ThemedText style={styles.taggedChipText}>@{p.username}</ThemedText>
                <Icon name="close" size={14} color={Colors.text} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={pickMedia}>
          <Icon name="image" size={24} color={Colors.primary} />
          <ThemedText style={styles.toolbarText}>Photo/Video</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => setTagModalVisible(true)}>
          <Icon name="tag" size={24} color={Colors.primary} />
          <ThemedText style={styles.toolbarText}>Tag People</ThemedText>
        </TouchableOpacity>
      </View>

      <Modal visible={tagModalVisible} animationType="slide" onRequestClose={() => setTagModalVisible(false)}>
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setTagModalVisible(false)}>
              <ThemedText>Close</ThemedText>
            </TouchableOpacity>
            <ThemedText type="subtitle">Tag People</ThemedText>
            <View style={{ width: 48 }} />
          </View>
          <TextInput
            style={styles.tagSearchInput}
            placeholder="Search people"
            placeholderTextColor={Colors.textSecondary}
            value={tagQuery}
            onChangeText={searchPeople}
            autoFocus
            autoCapitalize="none"
          />
          {tagSearching ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primary} />
          ) : (
            <FlatList
              data={tagResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = taggedPeople.some((p) => p.id === item.id);
                return (
                  <TouchableOpacity style={styles.tagResultRow} onPress={() => togglePerson(item)}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.tagAvatar} />
                    ) : (
                      <View style={[styles.tagAvatar, styles.tagAvatarPlaceholder]}>
                        <Icon name="person" size={20} color={Colors.textSecondary} />
                      </View>
                    )}
                    <ThemedText style={styles.tagUsername}>@{item.username}</ThemedText>
                    {selected && <Icon name="check-circle" size={22} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                tagQuery.trim().length >= 2 ? (
                  <ThemedText style={styles.tagEmpty}>No people found</ThemedText>
                ) : null
              }
            />
          )}
        </ThemedView>
      </Modal>

      {media?.type === 'image' && (
        <ImageAltTextDialog
          visible={altDialogVisible}
          imageUri={media.uri}
          initialAltText={media.alt ?? ''}
          onSave={saveAltText}
          onClose={() => setAltDialogVisible(false)}
        />
      )}

      {ToastComponent}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  input: {
    fontSize: 18,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  mediaPreview: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  videoPlaceholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoLabel: {
    color: '#FFF',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
  },
  altButton: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  altButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  taggedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  taggedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  taggedChipText: {
    color: Colors.text,
    fontSize: 13,
  },
  toolbar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 16,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  tagSearchInput: {
    margin: 16,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tagAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  tagAvatarPlaceholder: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagUsername: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
  },
  tagEmpty: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginTop: 24,
  },
});
