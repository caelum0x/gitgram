import { useState, useEffect } from 'react';
import { Image } from 'expo-image';

interface CacheOptions {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
}

class ImageCache {
  private cache: Map<string, { url: string; timestamp: number }> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
  }

  set(key: string, url: string) {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      url,
      timestamp: Date.now(),
    });
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.url;
  }

  has(key: string): boolean {
    return this.cache.has(key) && 
           Date.now() - (this.cache.get(key)?.timestamp || 0) <= this.ttl;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const imageCache = new ImageCache({ maxSize: 100, ttl: 24 * 60 * 60 * 1000 });

export function useImageCache(url: string | null | undefined) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) {
      setCachedUrl(null);
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = imageCache.get(url);
    if (cached) {
      setCachedUrl(cached);
      setLoading(false);
      return;
    }

    // Preload image
    setLoading(true);
    Image.prefetch(url)
      .then(() => {
        imageCache.set(url, url);
        setCachedUrl(url);
        setLoading(false);
      })
      .catch(() => {
        setCachedUrl(url); // Fallback to original URL
        setLoading(false);
      });
  }, [url]);

  return { cachedUrl, loading };
}

export { imageCache };

