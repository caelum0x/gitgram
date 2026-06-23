import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { postService } from '../../services/postService';

export default function CreatePostScreen() {
    const router = useRouter();
    const [content, setContent] = useState('');
    const [media, setMedia] = useState<string | null>(null);
    const [codeSnippet, setCodeSnippet] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [activeTab, setActiveTab] = useState<'media' | 'code'>('media');
    const [loading, setLoading] = useState(false);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 1,
        });

        if (!result.canceled) {
            setMedia(result.assets[0].uri);
        }
    };

    const handlePost = async () => {
        if (!content && !media && !codeSnippet) return;

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
                } as unknown as Blob);
                formData.append('mediaType', 'image');
            }

            if (codeSnippet) {
                formData.append('codeSnippet', codeSnippet);
                formData.append('language', language);
            }

            await postService.createPost(formData);
            router.back();
        } catch (error) {
            Alert.alert('Error', 'Failed to create post. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Post</Text>
                <TouchableOpacity onPress={handlePost} disabled={loading || (!content && !media && !codeSnippet)}>
                    {loading ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                        <Text style={[styles.postText, (!content && !media && !codeSnippet) && styles.disabledText]}>
                            Post
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.inputContainer}>
                    <Image
                        source={{ uri: 'https://github.com/github.png' }}
                        style={styles.avatar}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="What's on your mind?"
                        placeholderTextColor={Colors.textSecondary}
                        multiline
                        value={content}
                        onChangeText={setContent}
                    />
                </View>

                <View style={styles.tabs}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'media' && styles.activeTab]}
                        onPress={() => setActiveTab('media')}
                    >
                        <Icon name="image" size={24} color={activeTab === 'media' ? Colors.primary : Colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === 'media' && styles.activeTabText]}>Media</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'code' && styles.activeTab]}
                        onPress={() => setActiveTab('code')}
                    >
                        <Icon name="code" size={24} color={activeTab === 'code' ? Colors.primary : Colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === 'code' && styles.activeTabText]}>Code</Text>
                    </TouchableOpacity>
                </View>

                {activeTab === 'media' ? (
                    <View style={styles.mediaContainer}>
                        {media ? (
                            <View>
                                <Image source={{ uri: media }} style={styles.previewImage} />
                                <TouchableOpacity style={styles.removeMedia} onPress={() => setMedia(null)}>
                                    <Icon name="close" size={20} color="#FFF" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
                                <Icon name="add-photo-alternate" size={48} color={Colors.textSecondary} />
                                <Text style={styles.uploadText}>Select Photo</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <View style={styles.codeEditorContainer}>
                        <View style={styles.languageSelector}>
                            <Text style={styles.label}>Language:</Text>
                            <TextInput
                                style={styles.languageInput}
                                value={language}
                                onChangeText={setLanguage}
                                placeholder="e.g. javascript"
                                placeholderTextColor={Colors.textSecondary}
                            />
                        </View>
                        <TextInput
                            style={styles.codeInput}
                            placeholder="// Paste your code here..."
                            placeholderTextColor={Colors.textSecondary}
                            multiline
                            value={codeSnippet}
                            onChangeText={setCodeSnippet}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.secondary,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.text,
    },
    cancelText: {
        color: Colors.text,
        fontSize: 16,
    },
    postText: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    disabledText: {
        opacity: 0.5,
    },
    content: {
        flex: 1,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        marginTop: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        gap: 8,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: Colors.primary,
    },
    tabText: {
        color: Colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabText: {
        color: Colors.primary,
    },
    mediaContainer: {
        padding: 16,
        alignItems: 'center',
    },
    uploadButton: {
        width: '100%',
        height: 200,
        borderWidth: 2,
        borderColor: Colors.border,
        borderStyle: 'dashed',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    uploadText: {
        color: Colors.textSecondary,
        fontSize: 16,
    },
    previewImage: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: 12,
    },
    removeMedia: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 12,
        padding: 4,
    },
    codeEditorContainer: {
        padding: 16,
        gap: 12,
    },
    languageSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        color: Colors.textSecondary,
        fontSize: 14,
    },
    languageInput: {
        flex: 1,
        backgroundColor: Colors.surface,
        color: Colors.text,
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    codeInput: {
        backgroundColor: '#0d1117',
        color: Colors.text,
        fontFamily: 'monospace',
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 200,
        textAlignVertical: 'top',
    },
});
