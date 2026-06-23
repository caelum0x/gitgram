import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import repositoryService from '../../services/repositoryService';

interface RepoCardProps {
  repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    description?: string;
    stars: number;
    forks: number;
    language?: string;
    isFollowing?: boolean;
  };
}

export default function RepoCard({ repo }: RepoCardProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(repo.isFollowing || false);

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await repositoryService.unfollow(repo.owner, repo.name);
      } else {
        await repositoryService.follow(repo.owner, repo.name);
      }
      setIsFollowing(!isFollowing);
    } catch (e) {
      console.error('Follow error', e);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${repo.fullName} on Gitgram!\nhttps://github.com/${repo.fullName}`,
      });
    } catch (e) {
      console.error('Share error', e);
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push(`/repo/${repo.owner}/${repo.name}`)}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📦</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{repo.fullName}</Text>
          {repo.description && (
            <Text style={styles.description} numberOfLines={1}>{repo.description}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={(e) => { e.stopPropagation(); handleFollow(); }}
        >
          <Text style={[styles.followText, isFollowing && styles.followingText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <Text style={styles.stat}>⭐ {repo.stars >= 1000 ? `${(repo.stars/1000).toFixed(0)}k` : repo.stars}</Text>
        <Text style={styles.stat}>🍴 {repo.forks >= 1000 ? `${(repo.forks/1000).toFixed(0)}k` : repo.forks}</Text>
        {repo.language && <Text style={styles.stat}>💻 {repo.language}</Text>}
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleShare(); }} style={styles.shareBtn}>
          <Text style={styles.stat}>📤</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  followingBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  followingText: {
    color: Colors.text,
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stat: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  shareBtn: {
    marginLeft: 'auto',
  },
});
