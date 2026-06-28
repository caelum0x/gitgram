import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { githubService } from '../../../services/githubService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { logger } from '../../../utils/logger';

export default function FilesScreen() {
    const router = useRouter();
    const { id, fullName, path } = useLocalSearchParams<{ id: string; fullName: string; path?: string }>();
    const [contents, setContents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (fullName) {
            loadContents();
        }
    }, [fullName, path]);

    const loadContents = async () => {
        try {
            setLoading(true);
            const [owner, repo] = fullName!.split('/');
            const data = await githubService.getRepositoryContent(owner, repo, path || '');

            // Sort: folders first, then files
            const sortedData = Array.isArray(data) ? data.sort((a: any, b: any) => {
                if (a.type === b.type) {
                    return a.name.localeCompare(b.name);
                }
                return a.type === 'dir' ? -1 : 1;
            }) : [];

            setContents(sortedData);
        } catch (error) {
            logger.error('Error loading contents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleItemPress = (item: any) => {
        if (item.type === 'dir') {
            router.push({
                pathname: '/project/[id]/files',
                params: { id, fullName, path: item.path }
            });
        } else {
            router.push({
                pathname: '/project/[id]/blob',
                params: { id, fullName, path: item.path, url: item.url }
            });
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.item} onPress={() => handleItemPress(item)}>
            <Icon
                name={item.type === 'dir' ? 'folder' : 'insert-drive-file'}
                size={24}
                color={item.type === 'dir' ? Colors.info : Colors.textSecondary}
            />
            <Text style={styles.itemName}>{item.name}</Text>
            <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Icon name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {path || fullName}
                </Text>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={contents}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.sha}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No files found</Text>
                        </View>
                    }
                />
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
    listContent: {
        paddingBottom: 20,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.background,
        gap: 12,
    },
    itemName: {
        flex: 1,
        fontSize: 16,
        color: Colors.text,
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        color: Colors.textSecondary,
        fontSize: 16,
    },
});
