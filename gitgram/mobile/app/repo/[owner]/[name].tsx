import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import repositoryService from '../../../services/repositoryService';

const REACTIONS = ['👍', '❤️', '🎉', '🚀', '👀', '🔥', '💯'];

export default function RepoDetail() {
  const { owner, name } = useLocalSearchParams();
  const [repo, setRepo] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRepo();
  }, [owner, name]);

  const loadRepo = async () => {
    try {
      const [repoData, commentsData] = await Promise.all([
        repositoryService.get(owner as string, name as string),
        repositoryService.getComments(owner as string, name as string),
      ]);
      
      setRepo(repoData);
      setIsFollowing(repoData.isFollowing);
      setComments(commentsData.comments || []);
    } catch (error) {
      console.error('Failed to load repo', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await repositoryService.unfollow(owner as string, name as string);
      } else {
        await repositoryService.follow(owner as string, name as string);
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Failed to follow/unfollow', error);
    }
  };

  const handleReaction = async (type: string) => {
    try {
      await repositoryService.addReaction(owner as string, name as string, type);
    } catch (error) {
      console.error('Failed to add reaction', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await repositoryService.addComment(owner as string, name as string, newComment);
      setNewComment('');
      loadRepo();
    } catch (error) {
      console.error('Failed to add comment', error);
    }
  };

  if (loading) return <View style={styles.container}><Text>Loading...</Text></View>;
  if (!repo) return <View style={styles.container}><Text>Repository not found</Text></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{repo.fullName}</Text>
        <Text style={styles.description}>{repo.description}</Text>
        
        <View style={styles.stats}>
          <Text style={styles.stat}>⭐ {repo.stars?.toLocaleString()}</Text>
          <Text style={styles.stat}>🍴 {repo.forks?.toLocaleString()}</Text>
          {repo.language && <Text style={styles.stat}>💻 {repo.language}</Text>}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, isFollowing && styles.btnFollowing]} onPress={handleFollow}>
            <Text style={styles.btnText}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.btnSecondary} onPress={() => Linking.openURL(repo.htmlUrl)}>
            <Text style={styles.btnSecondaryText}>View on GitHub</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.reactions}>
          {REACTIONS.map(emoji => (
            <TouchableOpacity key={emoji} onPress={() => handleReaction(emoji)}>
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.comments}>
        <Text style={styles.sectionTitle}>Comments</Text>
        
        <View style={styles.commentInput}>
          <TextInput
            style={styles.input}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity style={styles.submitBtn} onPress={handleAddComment}>
            <Text style={styles.submitText}>Post</Text>
          </TouchableOpacity>
        </View>

        {comments.map((comment: any) => (
          <View key={comment.id} style={styles.comment}>
            <Text style={styles.commentUser}>@{comment.user?.username}</Text>
            <Text>{comment.content}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  description: { fontSize: 14, color: '#666', marginBottom: 12 },
  stats: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  stat: { fontSize: 14, color: '#666' },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  btn: { flex: 1, backgroundColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnFollowing: { backgroundColor: '#ddd' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnSecondary: { flex: 1, borderWidth: 1, borderColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnSecondaryText: { color: '#007AFF', fontWeight: '600' },
  reactions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  emoji: { fontSize: 24 },
  comments: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  commentInput: { marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, minHeight: 60 },
  submitBtn: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, marginTop: 8, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
  comment: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 8 },
  commentUser: { fontWeight: '600', marginBottom: 4 },
});
