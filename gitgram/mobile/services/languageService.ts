import api from './api';

/**
 * A programming language as exposed by the discovery surface.
 */
export interface Language {
  name: string;
  slug: string;
  color?: string | null;
  repoCount: number;
  snippetCount: number;
  trendingScore?: number | null;
}

/**
 * A language that is currently trending, with ranking and momentum metadata.
 */
export interface TrendingLanguage extends Language {
  rank: number;
  changePercent: number;
}

interface LanguagesResponse {
  languages: Language[];
}

interface TrendingLanguagesResponse {
  languages: TrendingLanguage[];
}

/**
 * Service for the languages discovery surface.
 *
 * Wraps the shared axios `api` instance (auth + retry handled centrally).
 * Targets:
 *   - GET /v1/languages           full directory of languages
 *   - GET /v1/languages/trending  ranked trending languages
 *
 * Both endpoints are normalized so callers always receive a typed array,
 * whether the backend returns a bare array or a `{ languages: [...] }` envelope.
 */
export const languageService = {
  /**
   * Fetch the full directory of languages with repo/snippet counts.
   */
  getLanguages: async (): Promise<Language[]> => {
    const response = await api.get<Language[] | LanguagesResponse>('/languages');
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    return data.languages ?? [];
  },

  /**
   * Fetch the trending languages, ranked with momentum (changePercent).
   */
  getTrendingLanguages: async (): Promise<TrendingLanguage[]> => {
    const response = await api.get<TrendingLanguage[] | TrendingLanguagesResponse>(
      '/languages/trending'
    );
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    return data.languages ?? [];
  },
};
