import React, { useState } from 'react';
import { StyleSheet, View, Image, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import { postService } from '../../services/postService';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function CreatePostScreen() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setMedia(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!content && !media) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (media) {
        const filename = media.split('/').pop();
        const match = /\.(\w+)$/.exec(filename || '');
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('media', {
          uri: media,
          name: filename,
          type,
        } as any);
        formData.append('mediaType', 'image');
      }

      await postService.createPost(formData);
      router.back();
    } catch (error) {
      console.error('Create post error:', error);
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
        <ThemedText type="subtitle">New Post</ThemedText>
        <Button 
          title="Post" 
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
            <Image source={{ uri: media }} style={styles.image} />
            <TouchableOpacity 
              style={styles.removeButton}
              onPress={() => setMedia(null)}
            >
              <Icon name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={pickImage}>
          <Icon name="image" size={24} color={Colors.primary} />
          <ThemedText style={styles.toolbarText}>Photo/Video</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <Icon name="tag" size={24} color={Colors.primary} />
          <ThemedText style={styles.toolbarText}>Tag People</ThemedText>
        </TouchableOpacity>
      </View>
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
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
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
});
