import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  useSearchStore,
  SearchType,
  SortOption,
  DateRange,
  SearchFilters,
} from '../../store/searchStore';

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'posts', label: 'Posts' },
  { value: 'users', label: 'Users' },
  { value: 'repos', label: 'Repos' },
  { value: 'hashtags', label: 'Hashtags' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevant', label: 'Relevant' },
  { value: 'recent', label: 'Recent' },
  { value: 'popular', label: 'Popular' },
];

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'any', label: 'Any Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

export default function SearchFiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?: SearchType;
    sortBy?: SortOption;
    dateRange?: DateRange;
  }>();

  const { filters: storeFilters, setFilters } = useSearchStore();

  // Local state for filter selections (initialized from store or params)
  const [localFilters, setLocalFilters] = useState<SearchFilters>(() => ({
    type: (params.type as SearchType) || storeFilters.type,
    sortBy: (params.sortBy as SortOption) || storeFilters.sortBy,
    dateRange: (params.dateRange as DateRange) || storeFilters.dateRange,
  }));

  const handleApply = () => {
    // Update the global search store with the selected filters
    setFilters(localFilters);

    // Navigate back with the filter params so the search screen can use them
    router.navigate({
      pathname: '/(tabs)/explore',
      params: {
        filterType: localFilters.type,
        filterSort: localFilters.sortBy,
        filterDate: localFilters.dateRange,
        filtersApplied: 'true',
      },
    });
  };

  const handleReset = () => {
    const defaultFilters: SearchFilters = {
      type: 'all',
      sortBy: 'relevant',
      dateRange: 'any',
    };
    setLocalFilters(defaultFilters);
  };

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const isDefaultFilters =
    localFilters.type === 'all' &&
    localFilters.sortBy === 'relevant' &&
    localFilters.dateRange === 'any';

  return (
    <View style={styles.container}>
      <Header
        title="Search Filters"
        rightIcon="check"
        onRightPress={handleApply}
      />
      <ScrollView style={styles.content}>
        {/* Type Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type</Text>
          {TYPE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                localFilters.type === option.value && styles.optionSelected,
              ]}
              onPress={() => updateFilter('type', option.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  localFilters.type === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {localFilters.type === option.value && (
                <Icon name="check-circle" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort By Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                localFilters.sortBy === option.value && styles.optionSelected,
              ]}
              onPress={() => updateFilter('sortBy', option.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  localFilters.sortBy === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {localFilters.sortBy === option.value && (
                <Icon name="check-circle" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Range Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date Range</Text>
          {DATE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                localFilters.dateRange === option.value && styles.optionSelected,
              ]}
              onPress={() => updateFilter('dateRange', option.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  localFilters.dateRange === option.value && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {localFilters.dateRange === option.value && (
                <Icon name="check-circle" size={20} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Reset Button */}
        {!isDefaultFilters && (
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Icon name="refresh" size={20} color={Colors.textSecondary} />
            <Text style={styles.resetButtonText}>Reset Filters</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Apply Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: {
    borderColor: Colors.accent,
  },
  optionText: {
    fontSize: 16,
    color: Colors.text,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: Colors.accent,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});
