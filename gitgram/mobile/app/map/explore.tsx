import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { logger } from '../../utils/logger';
import repositoryService from '../../services/repositoryService';
import Icon from 'react-native-vector-icons/MaterialIcons';

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const LANGUAGE_FILTERS = ['all', 'typescript', 'javascript', 'python', 'go', 'rust'] as const;

type LanguageFilter = (typeof LANGUAGE_FILTERS)[number];

interface Project {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
  avatarUrl?: string;
}

interface MapComponents {
  MapView: any;
  Marker: any;
  PROVIDER_GOOGLE: any;
}

export default function MapExploreScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(DEFAULT_REGION);
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [mapComponents, setMapComponents] = useState<MapComponents | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void initializeScreen();
  }, []);

  useEffect(() => {
    if (!loading) {
      void loadProjects(selectedLanguage, true);
    }
  }, [selectedLanguage]);

  const locationSummary = useMemo(() => {
    const mode = usingFallbackLocation ? 'Fallback region' : 'Current location';
    return `${mode}: ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`;
  }, [location, usingFallbackLocation]);

  const initializeScreen = async () => {
    setLoading(true);
    await Promise.all([detectMapSupport(), resolveLocation(), loadProjects(selectedLanguage)]);
    setLoading(false);
  };

  const detectMapSupport = async () => {
    try {
      const maps = require('react-native-maps');
      setMapComponents({
        MapView: maps.default,
        Marker: maps.Marker,
        PROVIDER_GOOGLE: maps.PROVIDER_GOOGLE,
      });
    } catch (mapError) {
      logger.warn('react-native-maps is unavailable; using list-only project explorer');
      setMapComponents(null);
    }
  };

  const resolveLocation = async () => {
    try {
      try {
        const Location = (await import('expo-location')).default;
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: DEFAULT_REGION.latitudeDelta,
            longitudeDelta: DEFAULT_REGION.longitudeDelta,
          });
          setUsingFallbackLocation(false);
          return;
        }
      } catch (locationError) {
        logger.warn('expo-location is unavailable; using fallback region');
      }

      setLocation(DEFAULT_REGION);
      setUsingFallbackLocation(true);
    } catch (locationError) {
      logger.error('Get current location error:', locationError);
      setLocation(DEFAULT_REGION);
      setUsingFallbackLocation(true);
    }
  };

  const loadProjects = async (language: LanguageFilter, silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await repositoryService.getTrending(
        language === 'all' ? undefined : language
      );
      const repositories = Array.isArray(response.repositories) ? response.repositories : [];

      setProjects(
        repositories.map((repo: any, index: number) => ({
          id: repo.id || `${repo.owner}/${repo.name || index}`,
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName || `${repo.owner}/${repo.name}`,
          description: repo.description,
          stars: Number(repo.stars || 0),
          forks: Number(repo.forks || 0),
          language: repo.language,
          avatarUrl: repo.avatarUrl || null,
        }))
      );
    } catch (projectError) {
      logger.error('Load map explore projects error:', projectError);
      setProjects([]);
      setError('Unable to load project results right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const renderProject = ({ item }: { item: Project }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/repo/${item.owner}/${item.name}`)}
    >
      <View style={styles.projectHeader}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.projectAvatar} />
        ) : (
          <View style={styles.projectAvatarFallback}>
            <Text style={styles.projectAvatarText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.projectHeaderText}>
          <Text style={styles.projectName}>{item.fullName}</Text>
          {item.language && (
            <Text style={styles.projectLanguage}>{item.language}</Text>
          )}
        </View>
        <Icon name="chevron-right" size={22} color={Colors.textSecondary} />
      </View>

      {item.description ? (
        <Text style={styles.projectDescription} numberOfLines={3}>
          {item.description}
        </Text>
      ) : (
        <Text style={styles.projectDescriptionMuted}>
          No project description available.
        </Text>
      )}

      <View style={styles.projectStats}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>⭐ {item.stars}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>🍴 {item.forks}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMapSection = () => {
    if (!mapComponents) {
      return (
        <View style={styles.locationCard}>
          <View style={styles.locationCardHeader}>
            <Icon name="place" size={20} color={Colors.accent} />
            <Text style={styles.locationCardTitle}>Project Explorer</Text>
          </View>
          <Text style={styles.locationCardText}>{locationSummary}</Text>
          <Text style={styles.locationCardSubtext}>
            Project coordinate data is not available in the current API, so this screen shows real trending repositories with working language filters.
          </Text>
        </View>
      );
    }

    const { MapView, Marker, PROVIDER_GOOGLE } = mapComponents;

    return (
      <View style={styles.mapCard}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={location}
          region={location}
        >
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title={usingFallbackLocation ? 'Fallback region' : 'Your location'}
            description="Project results are listed below."
          />
        </MapView>
        <View style={styles.mapCaption}>
          <Text style={styles.mapCaptionTitle}>{locationSummary}</Text>
          <Text style={styles.mapCaptionText}>
            Project markers are unavailable because repository coordinates are not stored yet. Results below are live trending repositories.
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Map Explore" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Map Explore" />

      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => void loadProjects(selectedLanguage, true)}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {renderMapSection()}

            <View style={styles.toolbar}>
              <View style={styles.toolbarText}>
                <Text style={styles.toolbarTitle}>Filtered Projects</Text>
                <Text style={styles.toolbarSubtitle}>
                  Language filter: {selectedLanguage === 'all' ? 'All' : selectedLanguage}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  showFilters && styles.filterButtonActive,
                ]}
                onPress={() => setShowFilters((prev) => !prev)}
              >
                <Icon
                  name="filter-list"
                  size={20}
                  color={showFilters ? '#fff' : Colors.text}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    showFilters && styles.filterButtonTextActive,
                  ]}
                >
                  Filters
                </Text>
              </TouchableOpacity>
            </View>

            {showFilters && (
              <View style={styles.filtersPanel}>
                {LANGUAGE_FILTERS.map((language) => {
                  const isActive = selectedLanguage === language;

                  return (
                    <TouchableOpacity
                      key={language}
                      style={[
                        styles.filterChip,
                        isActive && styles.filterChipActive,
                      ]}
                      onPress={() => setSelectedLanguage(language)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive && styles.filterChipTextActive,
                        ]}
                      >
                        {language === 'all'
                          ? 'All'
                          : language.charAt(0).toUpperCase() + language.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No projects found"
            message="Try another language filter or refresh the explorer."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
  },
  headerContent: {
    marginBottom: 16,
  },
  locationCard: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  locationCardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  locationCardText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  locationCardSubtext: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  map: {
    width: '100%',
    height: 220,
  },
  mapCaption: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapCaptionTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  mapCaptionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  toolbarText: {
    flex: 1,
  },
  toolbarTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  toolbarSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  filtersPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  errorCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.text,
    fontSize: 13,
  },
  projectCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    marginBottom: 12,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  projectAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  projectAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  projectHeaderText: {
    flex: 1,
  },
  projectName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  projectLanguage: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  projectDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  projectDescriptionMuted: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
    fontStyle: 'italic',
  },
  projectStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statChip: {
    borderRadius: 999,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
