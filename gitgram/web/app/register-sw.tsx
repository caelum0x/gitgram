'use client';

import { useEffect } from 'react';

export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New version available — page will pick it up on next visit
              console.info('[SW] New version available.');
            }
          });
        });
      } catch (error) {
        console.error('[SW] Registration failed:', error);
      }
    };

    register();
  }, []);

  return null;
}
