import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

const categories = ['project', 'code', 'template', 'library', 'tool', 'other'];
const priceRanges = [
  { label: 'Any', min: 0, max: Infinity },
  { label: 'Under $10', min: 0, max: 10 },
  { label: '$10 - $50', min: 10, max: 50 },
  { label: '$50 - $100', min: 50, max: 100 },
  { label: 'Over $100', min: 100, max: Infinity },
];
const sortOptions = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Most Popular', value: 'popular' },
  { label: 'Highest Rated', value: 'rating' },
];

export default function StoreFiltersScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPriceRange, setSelectedPriceRange] = useState(0);
  const [selectedSort, setSelectedSort] = useState('newest');
  const [minRating, setMinRating] = useState(0);

  const handleApply = () => {
    const params: Record<string, string> = {};
    if (selectedCategory) {
      params.category = selectedCategory;
    }
    if (priceRanges[selectedPriceRange].min > 0) {
      params.priceMin = String(priceRanges[selectedPriceRange].min);
    }
    if (priceRanges[selectedPriceRange].max !== Infinity) {
      params.priceMax = String(priceRanges[selectedPriceRange].max);
    }
    if (selectedSort !== 'newest') {
      params.sort = selectedSort;
    }
    if (minRating > 0) {
      params.minRating = String(minRating);
    }

    // Navigate back to the store browse screen with filter params
    router.navigate({
      pathname: '/store/browse',
      params,
    });
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setSelectedPriceRange(0);
    setSelectedSort('newest');
    setMinRating(0);
  };

  return (
    <View style={styles.container}>
      <Header
        title="Filters"
        rightIcon="check"
        onRightPress={handleApply}
      />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.optionsContainer}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionButton,
                  selectedCategory === cat && styles.selectedOption,
                ]}
                onPress={() =>
                  setSelectedCategory(selectedCategory === cat ? null : cat)
                }
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedCategory === cat && styles.selectedOptionText,
                  ]}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Range</Text>
          {priceRanges.map((range, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.radioOption,
                selectedPriceRange === index && styles.selectedRadio,
              ]}
              onPress={() => setSelectedPriceRange(index)}
            >
              <View style={styles.radio}>
                {selectedPriceRange === index && (
                  <View style={styles.radioSelected} />
                )}
              </View>
              <Text
                style={[
                  styles.radioText,
                  selectedPriceRange === index && styles.selectedRadioText,
                ]}
              >
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          {sortOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.radioOption,
                selectedSort === option.value && styles.selectedRadio,
              ]}
              onPress={() => setSelectedSort(option.value)}
            >
              <View style={styles.radio}>
                {selectedSort === option.value && (
                  <View style={styles.radioSelected} />
                )}
              </View>
              <Text
                style={[
                  styles.radioText,
                  selectedSort === option.value && styles.selectedRadioText,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Minimum Rating</Text>
          <View style={styles.ratingContainer}>
            {[0, 1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                style={[
                  styles.ratingButton,
                  minRating === rating && styles.selectedRating,
                ]}
                onPress={() => setMinRating(rating)}
              >
                <Text
                  style={[
                    styles.ratingText,
                    minRating === rating && styles.selectedRatingText,
                  ]}
                >
                  {rating === 0 ? 'Any' : `${rating}+ ⭐`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset Filters</Text>
        </TouchableOpacity>
      </ScrollView>
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
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedOption: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  optionText: {
    fontSize: 14,
    color: Colors.text,
  },
  selectedOptionText: {
    color: Colors.text,
    fontWeight: '600',
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  selectedRadio: {
    backgroundColor: Colors.accentBackground || Colors.surface,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  radioText: {
    fontSize: 16,
    color: Colors.text,
  },
  selectedRadioText: {
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedRating: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  ratingText: {
    fontSize: 14,
    color: Colors.text,
  },
  selectedRatingText: {
    color: Colors.text,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});

