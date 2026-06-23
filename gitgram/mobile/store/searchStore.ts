import { create } from 'zustand';

export type SearchType = 'all' | 'posts' | 'users' | 'repos' | 'hashtags';
export type SortOption = 'relevant' | 'recent' | 'popular';
export type DateRange = 'any' | 'today' | 'week' | 'month' | 'year';

export interface SearchFilters {
  type: SearchType;
  sortBy: SortOption;
  dateRange: DateRange;
}

interface SearchState {
  query: string;
  filters: SearchFilters;
  isFiltersApplied: boolean;

  // Actions
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  updateFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  resetFilters: () => void;
  clearSearch: () => void;
}

const defaultFilters: SearchFilters = {
  type: 'all',
  sortBy: 'relevant',
  dateRange: 'any',
};

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  filters: { ...defaultFilters },
  isFiltersApplied: false,

  setQuery: (query: string) => {
    set({ query });
  },

  setFilters: (filters: SearchFilters) => {
    const isDefault =
      filters.type === defaultFilters.type &&
      filters.sortBy === defaultFilters.sortBy &&
      filters.dateRange === defaultFilters.dateRange;

    set({
      filters,
      isFiltersApplied: !isDefault,
    });
  },

  updateFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    const newFilters = { ...get().filters, [key]: value };
    const isDefault =
      newFilters.type === defaultFilters.type &&
      newFilters.sortBy === defaultFilters.sortBy &&
      newFilters.dateRange === defaultFilters.dateRange;

    set({
      filters: newFilters,
      isFiltersApplied: !isDefault,
    });
  },

  resetFilters: () => {
    set({
      filters: { ...defaultFilters },
      isFiltersApplied: false,
    });
  },

  clearSearch: () => {
    set({
      query: '',
      filters: { ...defaultFilters },
      isFiltersApplied: false,
    });
  },
}));
