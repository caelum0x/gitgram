import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { reelService } from '../../../services/reelService';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { logger } from '../../../utils/logger';
import { useReelEditorStore } from '../../../store/reelEditorStore';

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  genre?: string;
  previewUrl?: string | null;
  albumArt?: string | null;
}

interface GenreCategory {
  id: string;
  label: string;
  icon: string;
}

// Default genre categories (used as fallback if API unavailable)
const DEFAULT_GENRE_CATEGORIES: GenreCategory[] = [
  { id: 'all', label: 'All', icon: 'library-music' },
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
];

export default function ReelMusicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { musicTrack, setMusicTrack } = useReelEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(musicTrack);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [genreCategories, setGenreCategories] = useState<GenreCategory[]>(DEFAULT_GENRE_CATEGORIES);
  const [apiError, setApiError] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const isNewReel = !id || id === 'new';

  // Audio playback state
  const soundRef = useRef<Audio.Sound | null>(null);
  const playProgress = useRef(new Animated.Value(0)).current;
  const playAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const playbackDurationRef = useRef<number>(0);

  // Format duration from seconds to mm:ss
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load initial data (genres and trending tracks)
  useEffect(() => {
    loadInitialData();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setApiError(null);

    try {
      // Load genres and trending music in parallel
      const [genresResponse, trendingResponse] = await Promise.all([
        reelService.getGenres(),
        reelService.getTrendingMusic(20),
      ]);

      // Set genres from API or use defaults
      if (Array.isArray(genresResponse.genres) && genresResponse.genres.length > 0) {
        const apiGenres: GenreCategory[] = [
          { id: 'all', label: 'All', icon: 'library-music' },
          { id: 'trending', label: 'Trending', icon: 'trending-up' },
          ...genresResponse.genres.map((genre: string) => ({
            id: genre.toLowerCase(),
            label: formatGenreLabel(genre),
            icon: getGenreIcon(genre),
          })),
        ];
        setGenreCategories(apiGenres);
      }

      // Set tracks
      if (trendingResponse.tracks) {
        setTracks(trendingResponse.tracks);
      }

      // Check if there was an API error
      if (trendingResponse.error) {
        setApiError(trendingResponse.error);
      }
    } catch (error: any) {
      logger.error('Failed to load initial music data:', error);
      setApiError('Unable to connect to music service');
    } finally {
      setLoading(false);
    }
  };

  // Helper to get default icon for genre
  const getGenreIcon = (genreName: string): string => {
    const iconMap: { [key: string]: string } = {
      'lo-fi': 'headphones',
      'lofi': 'headphones',
      'electronic': 'graphic-eq',
      'pop': 'music-note',
      'hip hop': 'album',
      'hip-hop': 'album',
      'acoustic': 'audiotrack',
      'cinematic': 'movie',
      'jazz': 'piano',
      'rock': 'speaker',
      'classical': 'queue-music',
      'r&b': 'mic',
      'ambient': 'waves',
      'house': 'nightlife',
      'folk': 'nature',
    };
    return iconMap[genreName.toLowerCase()] || 'music-note';
  };

  const formatGenreLabel = (genreName: string): string => (
    genreName
      .split(/[-_]/g)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );

  const loadTrendingMusic = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const response = await reelService.getTrendingMusic(20);
      setTracks(response.tracks || []);
      if (response.error) {
        setApiError(response.error);
      }
    } catch (error: any) {
      logger.error('Failed to load trending music:', error);
      setApiError('Unable to load trending music');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() && selectedGenre === 'all') {
      loadTrendingMusic();
      return;
    }

    setSearching(true);
    setApiError(null);
    try {
      const query = selectedGenre !== 'all' && selectedGenre !== 'trending'
        ? `${searchQuery} ${selectedGenre}`.trim()
        : searchQuery;

      const response = await reelService.searchMusic(query, 1, 20);
      setTracks(response.tracks || []);

      if (response.error) {
        setApiError(response.error);
      }
    } catch (error: any) {
      logger.error('Music search failed:', error);
      setApiError('Search failed. Please try again.');
      Alert.alert('Search Failed', 'Unable to search for music. Please check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, selectedGenre]);

  // Re-search when genre changes
  useEffect(() => {
    if (selectedGenre === 'trending') {
      loadTrendingMusic();
    } else {
      handleSearch();
    }
  }, [selectedGenre]);

  const stopPlayback = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      soundRef.current = null;
    }
    if (playAnimation.current) {
      playAnimation.current.stop();
    }
    playProgress.setValue(0);
    setPlayingTrackId(null);
  };

  const handlePlayPreview = async (track: MusicTrack) => {
    // If clicking the same track, toggle playback
    if (playingTrackId === track.id) {
      await stopPlayback();
      return;
    }

    // Stop any current playback
    await stopPlayback();

    // If no preview URL, show a message and don't play
    if (!track.previewUrl) {
      setPlayingTrackId(track.id);

      // Show brief visual feedback then reset (no actual audio to play)
      setTimeout(() => {
        if (playingTrackId === track.id) {
          setPlayingTrackId(null);
          Alert.alert(
            'Preview Unavailable',
            'Audio preview is not available for this track. You can still select it for your reel.',
            [{ text: 'OK' }]
          );
        }
      }, 500);
      return;
    }

    // Play actual audio preview
    setAudioLoading(true);
    try {
      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Create and load the sound
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setPlayingTrackId(track.id);
      setAudioLoading(false);

      // Get actual duration from loaded audio if available
      if (status.isLoaded && status.durationMillis) {
        playbackDurationRef.current = status.durationMillis;
        startProgressAnimation(status.durationMillis);
      } else {
        // Fallback to track duration (max 30 seconds for preview)
        const previewDuration = Math.min(track.duration, 30) * 1000;
        playbackDurationRef.current = previewDuration;
        startProgressAnimation(previewDuration);
      }
    } catch (error: any) {
      logger.error('Audio playback failed:', error);
      setAudioLoading(false);

      // Show user-friendly error message
      const errorMessage = error.message?.includes('network')
        ? 'Unable to load audio. Please check your connection.'
        : 'Unable to play audio preview.';

      Alert.alert('Playback Error', errorMessage, [{ text: 'OK' }]);
    }
  };

  // Handle playback status updates from expo-av
  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // Handle error state - check if it's an error status
      if ('error' in status && status.error) {
        logger.error('Playback error:', status.error);
        stopPlayback();
      }
      return;
    }

    // Handle playback completion
    if (status.didJustFinish && !status.isLooping) {
      stopPlayback();
    }

    // Update progress based on actual position
    if (status.positionMillis && playbackDurationRef.current > 0) {
      const progress = status.positionMillis / playbackDurationRef.current;
      playProgress.setValue(Math.min(progress, 1));
    }
  };

  // Start progress bar animation
  const startProgressAnimation = (durationMs: number) => {
    playProgress.setValue(0);
    playAnimation.current = Animated.timing(playProgress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    });
    playAnimation.current.start();
  };

  const handleTrackSelect = (track: MusicTrack) => {
    setSelectedTrack(track);
    // Auto-play preview when selecting
    if (playingTrackId !== track.id) {
      handlePlayPreview(track);
    }
  };

  const handleApplyMusic = async () => {
    if (!selectedTrack) {
      Alert.alert('No Track Selected', 'Please select a music track first.');
      return;
    }

    if (isNewReel) {
      setMusicTrack(selectedTrack);
      router.back();
      return;
    }

    setApplying(true);
    try {
      await reelService.applyMusicToReel(id, selectedTrack.id, 0);
      Alert.alert('Success', `"${selectedTrack.title}" has been added to your reel.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      logger.error('Failed to apply music:', error);
      Alert.alert(
        'Unable to Add Music',
        error?.response?.data?.message || 'The music selection could not be saved to this reel.',
        [{ text: 'OK' }]
      );
    } finally {
      setApplying(false);
    }
  };

  const renderGenreCategory = ({ item }: { item: GenreCategory }) => (
    <TouchableOpacity
      style={[
        styles.genreChip,
        selectedGenre === item.id && styles.genreChipSelected,
      ]}
      onPress={() => setSelectedGenre(item.id)}
    >
      <Icon
        name={item.icon}
        size={16}
        color={selectedGenre === item.id ? Colors.background : Colors.textSecondary}
      />
      <Text
        style={[
          styles.genreChipText,
          selectedGenre === item.id && styles.genreChipTextSelected,
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  const renderTrack = ({ item }: { item: MusicTrack }) => {
    const isSelected = selectedTrack?.id === item.id;
    const isPlaying = playingTrackId === item.id;
    const isLoadingThisTrack = audioLoading && isPlaying;
    const hasPreview = !!item.previewUrl;

    return (
      <TouchableOpacity
        style={[
          styles.trackItem,
          isSelected && styles.trackItemSelected,
        ]}
        onPress={() => handleTrackSelect(item)}
        activeOpacity={0.7}
      >
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={[
            styles.playButton,
            isPlaying && styles.playButtonActive,
            !hasPreview && styles.playButtonNoPreview,
          ]}
          onPress={() => handlePlayPreview(item)}
          disabled={isLoadingThisTrack}
        >
          {isLoadingThisTrack ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Icon
              name={isPlaying ? 'pause' : (hasPreview ? 'play-arrow' : 'music-note')}
              size={24}
              color={isPlaying ? Colors.background : (hasPreview ? Colors.accent : Colors.textSecondary)}
            />
          )}
        </TouchableOpacity>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          <View style={styles.trackTitleRow}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {!hasPreview && (
              <View style={styles.noPreviewBadge}>
                <Text style={styles.noPreviewText}>No preview</Text>
              </View>
            )}
          </View>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist} {item.genre ? `- ${item.genre}` : ''}
          </Text>

          {/* Progress Bar (visible when playing) */}
          {isPlaying && hasPreview && (
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: playProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          )}
        </View>

        {/* Duration */}
        <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>

        {/* Selection Indicator */}
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Icon name="check-circle" size={24} color={Colors.accent} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon
        name={apiError ? "cloud-off" : "music-off"}
        size={64}
        color={Colors.textSecondary}
      />
      <Text style={styles.emptyTitle}>
        {apiError ? 'Music Service Unavailable' : 'No Music Found'}
      </Text>
      <Text style={styles.emptyText}>
        {apiError
          ? 'Unable to connect to the music service. Please try again later.'
          : searchQuery
            ? `No tracks matching "${searchQuery}"`
            : 'Search for music to add to your reel'}
      </Text>
      {apiError && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadInitialData}
        >
          <Icon name="refresh" size={20} color={Colors.accent} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSelectedTrackBanner = () => {
    if (!selectedTrack) return null;

    return (
      <View style={styles.selectedBanner}>
        <View style={styles.selectedBannerInfo}>
          <Icon name="music-note" size={20} color={Colors.accent} />
          <View style={styles.selectedBannerText}>
            <Text style={styles.selectedBannerTitle} numberOfLines={1}>
              {selectedTrack.title}
            </Text>
            <Text style={styles.selectedBannerArtist} numberOfLines={1}>
              {selectedTrack.artist}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => {
            stopPlayback();
            setSelectedTrack(null);
          }}
        >
          <Icon name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Add Music"
        rightIcon={selectedTrack ? 'check' : undefined}
        onRightPress={selectedTrack ? handleApplyMusic : undefined}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Icon name="search" size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists..."
            placeholderTextColor={Colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={handleSearch}
          style={styles.searchButton}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Icon name="search" size={24} color={Colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      {/* Genre Categories */}
      <FlatList
        horizontal
        data={genreCategories}
        renderItem={renderGenreCategory}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreList}
        style={styles.genreContainer}
      />

      {/* Selected Track Banner */}
      {renderSelectedTrackBanner()}

      {/* Music List */}
      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={tracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={tracks.length === 0 ? styles.emptyList : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Apply Button (fixed at bottom when track selected) */}
      {selectedTrack && (
        <View style={styles.applyButtonContainer}>
          <TouchableOpacity
            style={[styles.applyButton, applying && styles.applyButtonDisabled]}
            onPress={handleApplyMusic}
            disabled={applying}
          >
            {applying ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <>
                <Icon name="add" size={20} color={Colors.background} />
                <Text style={styles.applyButtonText}>Use This Sound</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genreContainer: {
    maxHeight: 50,
  },
  genreList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  genreChipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  genreChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  genreChipTextSelected: {
    color: Colors.background,
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  selectedBannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  selectedBannerText: {
    flex: 1,
  },
  selectedBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  selectedBannerArtist: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  clearButton: {
    padding: 4,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  trackItemSelected: {
    backgroundColor: Colors.surface,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  playButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  playButtonNoPreview: {
    borderColor: Colors.border,
    opacity: 0.7,
  },
  trackInfo: {
    flex: 1,
    position: 'relative',
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    flexShrink: 1,
  },
  noPreviewBadge: {
    backgroundColor: Colors.surface,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noPreviewText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  trackArtist: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  progressBar: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    height: 2,
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
  trackDuration: {
    fontSize: 12,
    color: Colors.textSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
  selectedIndicator: {
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.accent,
  },
  applyButtonContainer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  applyButtonDisabled: {
    opacity: 0.7,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.background,
  },
});
