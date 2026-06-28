import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import api from '../../services/api';
import { logger } from '../../utils/logger';

interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code: string;
  language: string;
  isPublic: boolean;
  likesCount: number;
  viewsCount: number;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

const LANGUAGES = [
  { value: 'all', label: 'All' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
];

export default function SnippetsScreen() {
  const router = useRouter();
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [showMySnippets, setShowMySnippets] = useState(false);

  useEffect(() => {
    loadSnippets();
  }, [selectedLanguage, showMySnippets]);

  const loadSnippets = async () => {
    try {
      setLoading(true);
      const params: any = {
        limit: 20,
      };
      if (selectedLanguage !== 'all') {
        params.language = selectedLanguage;
      }
      if (showMySnippets) {
        params.mine = true;
      }
      if (searchQuery) {
        params.q = searchQuery;
      }

      const { data } = await api.get('/snippets', { params });
      setSnippets(data.snippets || data || []);
    } catch (error) {
      logger.error('Load snippets error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSnippets();
    setRefreshing(false);
  }, [selectedLanguage, showMySnippets, searchQuery]);

  const handleSearch = () => {
    loadSnippets();
  };

  const handleShare = async (snippet: CodeSnippet) => {
    try {
      await Share.share({
        message: `Check out this ${snippet.language} snippet: "${snippet.title}"\n\n${snippet.code.substring(0, 200)}...`,
        title: snippet.title,
      });
    } catch (error) {
      logger.error('Share error:', error);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copied', 'Code copied to clipboard!');
    } catch (error) {
      logger.error('Copy snippet error:', error);
      Alert.alert('Error', 'Failed to copy code to clipboard');
    }
  };

  const handleDelete = (snippetId: string) => {
    Alert.alert('Delete Snippet', 'Are you sure you want to delete this snippet?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/snippets/${snippetId}`);
            setSnippets(snippets.filter((s) => s.id !== snippetId));
          } catch (error) {
            logger.error('Delete snippet error:', error);
            Alert.alert('Error', 'Failed to delete snippet');
          }
        },
      },
    ]);
  };

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      javascript: '#f7df1e',
      typescript: '#3178c6',
      python: '#3776ab',
      rust: '#ce422b',
      go: '#00add8',
      java: '#5382a1',
      csharp: '#68217a',
      cpp: '#00599c',
      swift: '#fa7343',
      kotlin: '#7f52ff',
    };
    return colors[language.toLowerCase()] || Colors.muted;
  };

  const renderSnippet = ({ item }: { item: CodeSnippet }) => (
    <TouchableOpacity
      style={styles.snippetCard}
      onPress={() => router.push(`/snippets/${item.id}`)}
    >
      <View style={styles.snippetHeader}>
        <View style={styles.languageBadge}>
          <View
            style={[
              styles.languageDot,
              { backgroundColor: getLanguageColor(item.language) },
            ]}
          />
          <Text style={styles.languageText}>{item.language}</Text>
        </View>
        {!item.isPublic && (
          <View style={styles.privateBadge}>
            <Text style={styles.privateText}>Private</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{item.title}</Text>

      {item.description && (
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.codePreview}>
        <Text style={styles.codeText} numberOfLines={3}>
          {item.code}
        </Text>
      </View>

      <View style={styles.snippetFooter}>
        <View style={styles.stats}>
          <Text style={styles.statText}>❤️ {item.likesCount || 0}</Text>
          <Text style={styles.statText}>👁️ {item.viewsCount || 0}</Text>
        </View>
        <View style={styles.snippetActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleCopy(item.code)}
          >
            <Text style={styles.actionIcon}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleShare(item)}
          >
            <Text style={styles.actionIcon}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && snippets.length === 0) {
    return (
      <View style={styles.container}>
        <Header title="Code Snippets" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Code Snippets"
        rightComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/snippets/create')}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        }
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search snippets..."
          placeholderTextColor={Colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={LANGUAGES}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.languageFilters}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedLanguage === item.value && styles.filterChipActive,
              ]}
              onPress={() => setSelectedLanguage(item.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedLanguage === item.value && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity
          style={[styles.mySnippetsToggle, showMySnippets && styles.mySnippetsActive]}
          onPress={() => setShowMySnippets(!showMySnippets)}
        >
          <Text
            style={[
              styles.mySnippetsText,
              showMySnippets && styles.mySnippetsTextActive,
            ]}
          >
            My Snippets
          </Text>
        </TouchableOpacity>
      </View>

      {snippets.length > 0 ? (
        <FlatList
          data={snippets}
          renderItem={renderSnippet}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      ) : (
        <EmptyState
          title={showMySnippets ? 'No snippets yet' : 'No snippets found'}
          message={
            showMySnippets
              ? 'Create your first code snippet!'
              : 'Try a different search or filter'
          }
          icon="💻"
          actionLabel="Create Snippet"
          onAction={() => router.push('/snippets/create')}
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.foreground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filters: {
    paddingBottom: 12,
  },
  languageFilters: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.foreground,
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  mySnippetsToggle: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.card,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mySnippetsActive: {
    backgroundColor: `${Colors.primary}20`,
    borderColor: Colors.primary,
  },
  mySnippetsText: {
    fontSize: 13,
    color: Colors.muted,
  },
  mySnippetsTextActive: {
    color: Colors.primary,
    fontWeight: '500',
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  snippetCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  snippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  languageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  languageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  languageText: {
    fontSize: 12,
    color: Colors.muted,
    textTransform: 'capitalize',
  },
  privateBadge: {
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  privateText: {
    fontSize: 10,
    color: Colors.warning,
    fontWeight: '500',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.foreground,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: Colors.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  codePreview: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#d4d4d4',
    lineHeight: 18,
  },
  snippetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
  },
  statText: {
    fontSize: 12,
    color: Colors.muted,
  },
  snippetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  actionIcon: {
    fontSize: 16,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 20,
    color: Colors.white,
    fontWeight: '600',
    lineHeight: 22,
  },
});
