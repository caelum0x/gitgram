import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import {
  languageService,
  Language,
  TrendingLanguage,
} from '../../services/languageService';
import { logger } from '../../utils/logger';

/**
 * Fallback brand colors for language dots when the API omits a color.
 * Kept as a local constant per the canonical port convention.
 */
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

function languageColor(lang: Pick<Language, 'name' | 'color'>): string {
  if (lang.color) {
    return lang.color;
  }
  return LANGUAGE_COLORS[lang.name.toLowerCase()] ?? Colors.textSecondary;
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
      accessibilityLabel={`${language.name}, trending rank ${language.rank}`}
    >
      <View style={styles.trendingRankRow}>
        <Text style={styles.trendingRank}>#{language.rank}</Text>
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <Text style={styles.trendingName} numberOfLines={1}>
        {language.name}
      </Text>
      <View style={styles.trendingChangeRow}>
        <Icon name="trending-up" size={14} color={Colors.success} />
        <Text style={styles.trendingChange}>
          {language.changePercent.toFixed(0)}%
        </Text>
      </View>
    </Pressable>
  );
}

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
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.cardName} numberOfLines={1}>
            {language.name}
          </Text>
          {isTrending ? (
            <Icon name="trending-up" size={16} color={Colors.success} />
          ) : null}
        </View>
        <View style={styles.cardStats}>
          <Text style={styles.cardStat}>
            {formatCount(language.repoCount)} repos
          </Text>
          <Text style={styles.cardStatDivider}>·</Text>
          <Text style={styles.cardStat}>
            {formatCount(language.snippetCount)} snippets
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

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
        languageService.getTrendingLanguages(),
        languageService.getLanguages(),
      ]);
      setTrending(trendingRes);
      setLanguages(allRes);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load languages';
      logger.error('Load languages error:', err);
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
    [trending]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return languages;
    }
    return languages.filter((lang) => lang.name.toLowerCase().includes(q));
  }, [languages, query]);

  const goToLanguage = useCallback(
    (language: Pick<Language, 'slug'>): void => {
      // Route to the trending/discover feed filtered by the chosen language.
      router.push({
        pathname: '/discover/trending',
        params: { language: language.slug },
      });
    },
    [router]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header title="Languages" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  const showTrending = trending.length > 0 && query.trim().length === 0;

  return (
    <View style={styles.screen}>
      <Header title="Languages" />

      <View style={styles.searchBar}>
        <Icon name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search languages"
          placeholderTextColor={Colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close" size={18} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={onRefresh}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry loading languages"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {showTrending ? (
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
              message={
                query.trim()
                  ? `Nothing matches "${query.trim()}"`
                  : 'Languages will appear here once available.'
              }
              icon="code"
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
    </View>
  );
}

const CARD_GAP = 12;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 0,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  trendingRow: {
    paddingHorizontal: 16,
    gap: CARD_GAP,
  },
  trendingCard: {
    width: 120,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
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
    color: Colors.accent,
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
    gap: 3,
  },
  trendingChange: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16 - CARD_GAP / 2,
  },
  card: {
    width: '50%',
    padding: CARD_GAP / 2,
  },
  cardInner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 5,
  },
  cardStat: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardStatDivider: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  errorBox: {
    marginHorizontal: 16,
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
    backgroundColor: Colors.buttonPrimary,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
