import { useState } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import repositoryService from '../../services/repositoryService';
import { logger } from '../../utils/logger';

export default function RepoSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const data = await repositoryService.search(query);
      setResults(data.repositories);
    } catch (error) {
      logger.error('Search failed', error);
    } finally {
      setLoading(false);
    }
  };

  const renderRepo = ({ item }: any) => (
    <TouchableOpacity
      style={styles.repoCard}
      onPress={() => router.push(`/repo/${item.owner}/${item.name}`)}
    >
      <Text style={styles.repoName}>{item.fullName}</Text>
      <Text style={styles.repoDesc} numberOfLines={2}>
        {item.description || 'No description'}
      </Text>
      <View style={styles.repoStats}>
        <Text style={styles.stat}>⭐ {item.stars.toLocaleString()}</Text>
        {item.language && <Text style={styles.stat}>💻 {item.language}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search GitHub repos (e.g., vscode, react)"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        renderItem={renderRepo}
        keyExtractor={(item: any) => item.fullName}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: { flexDirection: 'row', padding: 16, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 },
  searchBtn: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  repoCard: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 16, marginBottom: 12 },
  repoName: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  repoDesc: { fontSize: 14, color: '#666', marginBottom: 8 },
  repoStats: { flexDirection: 'row', gap: 16 },
  stat: { fontSize: 12, color: '#666' },
});
