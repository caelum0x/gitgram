import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import RepoCard from '../../components/Repo/RepoCard';
import repositoryService from '../../services/repositoryService';

export default function FollowedReposScreen() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowedRepos();
  }, []);

  const loadFollowedRepos = async () => {
    try {
      const data = await repositoryService.getFollowing();
      setRepos(data.repositories || []);
    } catch (error) {
      console.error('Failed to load followed repos', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Followed Repos</Text>
      <FlatList
        data={repos}
        keyExtractor={(item) => item.id || item.fullName}
        renderItem={({ item }) => <RepoCard repo={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No followed repos yet</Text>
              <Text style={styles.emptySubtext}>Follow repos to see them here</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: 'bold', padding: 16, color: Colors.text },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: Colors.text, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: Colors.textSecondary },
});
