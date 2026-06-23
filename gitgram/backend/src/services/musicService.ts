import axios from 'axios';
import logger from '../utils/logger';
import { cache } from './redisService';

// Jamendo API configuration
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const JAMENDO_BASE_URL = 'https://api.jamendo.com/v3.0';

// Cache TTL in seconds
const CACHE_TTL = {
  SEARCH: 300,        // 5 minutes for search results
  TRENDING: 600,      // 10 minutes for trending
  TRACK: 3600,        // 1 hour for individual tracks
  GENRES: 86400,      // 24 hours for genres list
};

// Jamendo genre mapping
const JAMENDO_GENRES = [
  'rock',
  'pop',
  'electronic',
  'hiphop',
  'jazz',
  'classical',
  'ambient',
  'metal',
  'folk',
  'country',
  'blues',
  'reggae',
  'latin',
  'punk',
  'indie',
  'soul',
  'funk',
  'rnb',
  'world',
  'soundtrack',
  'chillout',
  'lounge',
  'trance',
  'house',
  'techno',
  'dubstep',
  'drumandbass',
] as const;

export type MusicGenre = typeof JAMENDO_GENRES[number];

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  duration: number; // in seconds
  previewUrl: string;
  streamUrl: string;
  artworkUrl: string;
  genre: string[];
  releaseDate: string;
  license: string;
  downloadUrl?: string;
}

export interface TrackSearchResult {
  tracks: Track[];
  total: number;
  offset: number;
  limit: number;
}

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  album_name: string;
  album_id: string;
  license_ccurl: string;
  position: number;
  releasedate: string;
  album_image: string;
  audio: string;
  audiodownload: string;
  prourl: string;
  shorturl: string;
  shareurl: string;
  image: string;
  musicinfo?: {
    vocalinstrumental: string;
    lang: string;
    gender: string;
    acousticelectric: string;
    speed: string;
    tags: {
      genres: string[];
      instruments: string[];
      vartags: string[];
    };
  };
}

interface JamendoResponse<T> {
  headers: {
    status: string;
    code: number;
    error_message: string;
    warnings: string;
    results_count: number;
  };
  results: T[];
}

export class MusicService {
  private readonly clientId: string | undefined;
  private readonly baseUrl: string;

  constructor() {
    this.clientId = JAMENDO_CLIENT_ID;
    this.baseUrl = JAMENDO_BASE_URL;
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return !!this.clientId;
  }

  /**
   * Transform Jamendo track to our Track interface
   */
  private transformTrack(track: JamendoTrack): Track {
    return {
      id: track.id,
      title: track.name,
      artist: track.artist_name,
      artistId: track.artist_id,
      duration: track.duration,
      previewUrl: track.audio,
      streamUrl: track.audio,
      artworkUrl: track.album_image || track.image,
      genre: track.musicinfo?.tags?.genres || [],
      releaseDate: track.releasedate,
      license: track.license_ccurl,
      downloadUrl: track.audiodownload,
    };
  }

  /**
   * Search for music tracks
   */
  async searchTracks(query: string, limit: number = 20, offset: number = 0): Promise<TrackSearchResult> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const cacheKey = `music:search:${query}:${limit}:${offset}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug(`Music search cache hit for: ${query}`);
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          search: query,
          limit,
          offset,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      const result: TrackSearchResult = {
        tracks: response.data.results.map(track => this.transformTrack(track)),
        total: response.data.headers.results_count,
        offset,
        limit,
      };

      // Cache the result
      await cache.set(cacheKey, result, CACHE_TTL.SEARCH);

      return result;
    } catch (error: any) {
      logger.error('Failed to search tracks:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to search music tracks');
    }
  }

  /**
   * Get trending/popular tracks
   */
  async getTrendingTracks(limit: number = 20, offset: number = 0): Promise<TrackSearchResult> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const cacheKey = `music:trending:${limit}:${offset}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug('Music trending cache hit');
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          order: 'popularity_week',
          limit,
          offset,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      const result: TrackSearchResult = {
        tracks: response.data.results.map(track => this.transformTrack(track)),
        total: response.data.headers.results_count,
        offset,
        limit,
      };

      // Cache the result
      await cache.set(cacheKey, result, CACHE_TTL.TRENDING);

      return result;
    } catch (error: any) {
      logger.error('Failed to get trending tracks:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to get trending music tracks');
    }
  }

  /**
   * Get a specific track by ID
   */
  async getTrackById(id: string): Promise<Track | null> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const cacheKey = `music:track:${id}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug(`Music track cache hit for: ${id}`);
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          id,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      if (response.data.results.length === 0) {
        return null;
      }

      const track = this.transformTrack(response.data.results[0]);

      // Cache the result
      await cache.set(cacheKey, track, CACHE_TTL.TRACK);

      return track;
    } catch (error: any) {
      logger.error(`Failed to get track ${id}:`, error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to get music track');
    }
  }

  /**
   * Get tracks by genre
   */
  async getTracksByGenre(genre: string, limit: number = 20, offset: number = 0): Promise<TrackSearchResult> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    // Validate genre
    const normalizedGenre = genre.toLowerCase().replace(/[^a-z]/g, '');

    const cacheKey = `music:genre:${normalizedGenre}:${limit}:${offset}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug(`Music genre cache hit for: ${normalizedGenre}`);
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          tags: normalizedGenre,
          order: 'popularity_week',
          limit,
          offset,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      const result: TrackSearchResult = {
        tracks: response.data.results.map(track => this.transformTrack(track)),
        total: response.data.headers.results_count,
        offset,
        limit,
      };

      // Cache the result
      await cache.set(cacheKey, result, CACHE_TTL.SEARCH);

      return result;
    } catch (error: any) {
      logger.error(`Failed to get tracks by genre ${genre}:`, error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to get music tracks by genre');
    }
  }

  /**
   * Get available genres
   */
  async getGenres(): Promise<string[]> {
    const cacheKey = 'music:genres';

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Return static list of supported genres
    const genres = [...JAMENDO_GENRES];

    // Cache the result
    await cache.set(cacheKey, genres, CACHE_TTL.GENRES);

    return genres;
  }

  /**
   * Get tracks by artist
   */
  async getTracksByArtist(artistId: string, limit: number = 20, offset: number = 0): Promise<TrackSearchResult> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const cacheKey = `music:artist:${artistId}:${limit}:${offset}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug(`Music artist cache hit for: ${artistId}`);
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          artist_id: artistId,
          limit,
          offset,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      const result: TrackSearchResult = {
        tracks: response.data.results.map(track => this.transformTrack(track)),
        total: response.data.headers.results_count,
        offset,
        limit,
      };

      // Cache the result
      await cache.set(cacheKey, result, CACHE_TTL.SEARCH);

      return result;
    } catch (error: any) {
      logger.error(`Failed to get tracks by artist ${artistId}:`, error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to get music tracks by artist');
    }
  }

  /**
   * Get new releases
   */
  async getNewReleases(limit: number = 20, offset: number = 0): Promise<TrackSearchResult> {
    if (!this.clientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const cacheKey = `music:new:${limit}:${offset}`;

    // Try cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      logger.debug('Music new releases cache hit');
      return cachedResult;
    }

    try {
      const response = await axios.get<JamendoResponse<JamendoTrack>>(`${this.baseUrl}/tracks/`, {
        params: {
          client_id: this.clientId,
          format: 'json',
          order: 'releasedate_desc',
          limit,
          offset,
          include: 'musicinfo',
          imagesize: 300,
          audioformat: 'mp32',
        },
        timeout: 10000,
      });

      const result: TrackSearchResult = {
        tracks: response.data.results.map(track => this.transformTrack(track)),
        total: response.data.headers.results_count,
        offset,
        limit,
      };

      // Cache the result
      await cache.set(cacheKey, result, CACHE_TTL.TRENDING);

      return result;
    } catch (error: any) {
      logger.error('Failed to get new releases:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid Jamendo API credentials');
      }
      throw new Error('Failed to get new music releases');
    }
  }
}

export const musicService = new MusicService();
