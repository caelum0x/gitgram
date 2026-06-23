// Bundle optimization utilities
import React from 'react';

// Code splitting helper
export const createLazyComponent = <T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>
) => {
  return React.lazy(importFunc);
};

// Dynamic import helper
export async function dynamicImport<T>(
  modulePath: string
): Promise<T> {
  return import(modulePath) as Promise<T>;
}

// Preload critical resources
export function preloadResources(resources: string[]) {
  if (typeof window !== 'undefined') {
    resources.forEach((resource) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource;
      link.as = resource.endsWith('.css') ? 'style' : 'script';
      document.head.appendChild(link);
    });
  }
}

// Memory leak prevention utilities
export class MemoryManager {
  private static listeners: Map<string, Set<() => void>> = new Map();

  static addCleanup(key: string, cleanup: () => void) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(cleanup);
  }

  static removeCleanup(key: string, cleanup: () => void) {
    const cleanups = this.listeners.get(key);
    if (cleanups) {
      cleanups.delete(cleanup);
    }
  }

  static cleanup(key: string) {
    const cleanups = this.listeners.get(key);
    if (cleanups) {
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    }
  }

  static cleanupAll() {
    this.listeners.forEach((cleanups) => {
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    });
    this.listeners.clear();
  }
}

// React hook for cleanup
export function useCleanup(cleanup: () => void, deps: any[] = []) {
  React.useEffect(() => {
    return cleanup;
  }, deps);
}

// Note: For React Native, use React.useEffect directly instead of this helper

