import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3776AB',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Java: '#B07219',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#CC342D',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#777BB4',
  Shell: '#89E051',
  Dart: '#00B4AB',
};

interface TrendingRepoProps {
  repo: {
    fullName: string;
    description?: string;
    language?: string;
    stars: number;
    forks: number;
    htmlUrl: string;
  };
}

function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TrendingRepoCard({ repo }: TrendingRepoProps) {
  const router = useRouter();
  const slashIdx = repo.fullName.indexOf('/');
  const owner = slashIdx >= 0 ? repo.fullName.slice(0, slashIdx) : repo.fullName;
  const name = slashIdx >= 0 ? repo.fullName.slice(slashIdx + 1) : '';
  const langColor = repo.language
    ? (LANGUAGE_COLORS[repo.language] ?? '#8B949E')
    : undefined;

  const handlePress = () => {
    router.push(`/repo/${owner}/${name}`);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <View style={styles.repoIcon}>
          <Text style={styles.repoIconText}>📦</Text>
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.ownerText} numberOfLines={1}>
            {owner}
            <Text style={styles.slash}>/</Text>
            <Text style={styles.repoName}>{name}</Text>
          </Text>
        </View>
      </View>

      {repo.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : (
        <Text style={styles.descriptionEmpty} numberOfLines={1}>
          No description provided
        </Text>
      )}

      <View style={styles.meta}>
        {repo.language && langColor && (
          <View style={styles.langBadge}>
            <View style={[styles.langDot, { backgroundColor: langColor }]} />
            <Text style={styles.langText}>{repo.language}</Text>
          </View>
        )}

        <View style={styles.statBadge}>
          <Text style={styles.statIcon}>⭐</Text>
          <Text style={styles.statText}>{formatCount(repo.stars)}</Text>
        </View>

        <View style={styles.statBadge}>
          <Text style={styles.statIcon}>🍴</Text>
          <Text style={styles.statText}>{formatCount(repo.forks)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213E',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#0F3460',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  repoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F3460',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  repoIconText: {
    fontSize: 18,
  },
  nameBlock: {
    flex: 1,
  },
  ownerText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  slash: {
    color: '#475569',
  },
  repoName: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 14,
  },
  description: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  descriptionEmpty: {
    color: '#475569',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  langText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 12,
  },
  statText: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
