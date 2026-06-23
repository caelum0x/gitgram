import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';
import { EmptyState } from '../../components/EmptyState';

// ---------------------------------------------------------------------------
// Brand colors — matches proximity dark theme
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  trendingUp: '#34D399',
  white: '#FFFFFF',
} as const;

// Fallback color used when the API does not provide a language color.
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178C6',
  javascript: '#F7DF1E',
  python: '#3572A5',
  go: '#00ADD8',
  rust: '#DEA584',
  java: '#B07219',
  ruby: '#701516',
  swift: '#F05138',
  kotlin: '#A97BFF',
  cpp: '#F34B7D',
  c: '#555555',
  csharp: '#178600',
  php: '#4F5D95',
  html: '#E34C26',
  css: '#563D7C',
  shell: '#89E051',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Language {
  name: string;
  slug: string;
  color?: string | null;
  repoCount: number;
  snippetCount: number;
  trendingScore?: number | null;
}

interface TrendingLanguage extends Language {
  rank: number;
  changePercent: number;
}

interface LanguagesResponse {
  languages: Language[];
}

interface TrendingResponse {
  languages: TrendingLanguage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function languageColor(lang: Pick<Language, 'name' | 'color'>): string {
  if (lang.color) {
    return lang.color;
  }
  return LANGUAGE_COLORS[lang.name.toLowerCase()] ?? Colors.textMuted;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Trending highlight card
// ---------------------------------------------------------------------------
interface TrendingCardProps {
  language: TrendingLanguage;
  onPress: (language: TrendingLanguage) => void;
}

function TrendingCard({ language, onPress }: TrendingCardProps): React.ReactElement {
  const color = languageColor(language);
  return (
    <Pressable
      style={styles.trendingCard}
      onPress={() => onPress(language)}
      accessibilityRole="button"
      accessibilityLabel={`${language.name}, trending`}
    >
      <View style={styles.trendingRankRow}>
        <Text style={styles.trendingRank}>#{language.rank}</Text>
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <Text style={styles.trendingName} numberOfLines={1}>
        {language.name}
      </Text>
      <View style={styles.trendingChangeRow}>
        <Text style={styles.trendingArrow}>{'↑'}</Text>
        <Text style={styles.trendingChange}>
          {language.changePercent.toFixed(0)}%
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Language grid card
// ---------------------------------------------------------------------------
interface LanguageCardProps {
  language: Language;
  isTrending: boolean;
  onPress: (language: Language) => void;
}

function LanguageCard({
  language,
  isTrending,
  onPress,
}: LanguageCardProps): React.ReactElement {
  const color = languageColor(language);
  return (
    <Pressable
      style={styles.card}
      onPress={() => onPress(language)}
      accessibilityRole="button"
      accessibilityLabel={`${language.name}, ${language.repoCount} repos`}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.cardName} numberOfLines={1}>
          {language.name}
        </Text>
        {isTrending ? (
          <Text style={styles.cardTrendingArrow}>{'↑'}</Text>
        ) : null}
      </View>
      <View style={styles.cardStats}>
        <Text style={styles.cardStat}>
          {formatCount(language.repoCount)} repos
        </Text>
        <Text style={styles.cardStatDivider}>{'·'}</Text>
        <Text style={styles.cardStat}>
          {formatCount(language.snippetCount)} snippets
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function LanguagesScreen(): React.ReactElement {
  const router = useRouter();

  const [languages, setLanguages] = useState<Language[]>([]);
  const [trending, setTrending] = useState<TrendingLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [trendingRes, allRes] = await Promise.all([
        apiClient<TrendingResponse>('/v1/languages/trending'),
        apiClient<LanguagesResponse>('/v1/languages'),
      ]);
      setTrending(trendingRes.languages ?? []);
      setLanguages(allRes.languages ?? []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load languages';
      setError(message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (active) {
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const trendingSlugs = useMemo(
    () => new Set(trending.map((t) => t.slug)),
    [trending],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return languages;
    }
    return languages.filter((lang) =>
      lang.name.toLowerCase().includes(q),
    );
  }, [languages, query]);

  const goToLanguage = useCallback(
    (language: Pick<Language, 'slug'>): void => {
      // /languages/[lang] is the filtered feed. It falls back to the search
      // screen's language filter if the dedicated route is not registered.
      router.push(`/languages/${encodeURIComponent(language.slug)}`);
    },
    [router],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primaryLight} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Languages</Text>
        <Text style={styles.headerSubtitle}>
          Explore code by language
        </Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>{'⌕'}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search languages"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryLight}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {trending.length > 0 && query.trim().length === 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trending this week</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingRow}
            >
              {trending.map((lang) => (
                <TrendingCard
                  key={lang.slug}
                  language={lang}
                  onPress={goToLanguage}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {query.trim() ? 'Results' : 'All languages'}
          </Text>
          {filtered.length === 0 ? (
            <EmptyState
              title="No languages found"
              subtitle={
                query.trim()
                  ? `Nothing matches "${query.trim()}"`
                  : 'Languages will appear here once available.'
              }
            />
          ) : (
            <View style={styles.grid}>
              {filtered.map((lang) => (
                <LanguageCard
                  key={lang.slug}
                  language={lang}
                  isTrending={trendingSlugs.has(lang.slug)}
                  onPress={goToLanguage}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_GAP = 12;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    fontSize: 16,
    color: Colors.textMuted,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 0,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  trendingRow: {
    paddingHorizontal: 20,
    gap: CARD_GAP,
  },
  trendingCard: {
    width: 120,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trendingRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendingRank: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  trendingName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 10,
  },
  trendingChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  trendingArrow: {
    fontSize: 13,
    color: Colors.trendingUp,
    marginRight: 3,
  },
  trendingChange: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.trendingUp,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20 - CARD_GAP / 2,
  },
  card: {
    width: '50%',
    padding: CARD_GAP / 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: 8,
  },
  cardTrendingArrow: {
    fontSize: 14,
    color: Colors.trendingUp,
    fontWeight: '700',
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 18,
  },
  cardStat: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardStatDivider: {
    fontSize: 12,
    color: Colors.textMuted,
    marginHorizontal: 5,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  errorBox: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
