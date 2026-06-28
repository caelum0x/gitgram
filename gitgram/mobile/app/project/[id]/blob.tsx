import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { githubService } from '../../../services/githubService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Buffer } from 'buffer';
import { logger } from '../../../utils/logger';

export default function BlobScreen() {
    const router = useRouter();
    const { id, fullName, path, url } = useLocalSearchParams<{ id: string; fullName: string; path: string; url: string }>();
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (fullName && path) {
            loadContent();
        }
    }, [fullName, path]);

    const loadContent = async () => {
        try {
            setLoading(true);
            const [owner, repo] = fullName!.split('/');
            // Note: githubService.getRepositoryContent returns metadata for file if path is provided
            // We might need to fetch the blob content using the 'url' or just use the content from the response if it's small
            // For now, let's assume we fetch the file content directly
            const data = await githubService.getRepositoryContent(owner, repo, path);

            if (data.content && data.encoding === 'base64') {
                const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
                setContent(decoded);
            } else {
                setContent('Unable to display file content');
            }
        } catch (error) {
            logger.error('Error loading blob:', error);
            setContent('Error loading file content');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Icon name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {path}
                </Text>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <ScrollView style={styles.scrollView}>
                    <View style={styles.codeContainer}>
                        <Text style={styles.codeText}>{content}</Text>
                    </View>
                </ScrollView>
            )}
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
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        paddingBottom: 12,
        backgroundColor: Colors.secondary,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        gap: 12,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    codeContainer: {
        padding: 16,
    },
    codeText: {
        fontFamily: 'monospace',
        color: Colors.text,
        fontSize: 14,
    },
});
