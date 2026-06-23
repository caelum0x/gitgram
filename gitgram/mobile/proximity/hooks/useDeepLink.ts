import { useEffect, useCallback, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

type DeepLinkRoute =
  | { type: 'post'; id: string }
  | { type: 'profile'; username: string }
  | { type: 'repo'; owner: string; name: string }
  | { type: 'unknown'; url: string };

interface UseDeepLinkReturn {
  isReady: boolean;
  handleDeepLink: (url: string) => void;
}

function parseDeepLink(url: string): DeepLinkRoute | null {
  try {
    const parsed = Linking.parse(url);

    // Only handle gitgram:// scheme
    if (parsed.scheme !== 'gitgram') {
      return null;
    }

    const path = parsed.path ?? '';
    const segments = path.replace(/^\//, '').split('/');

    // gitgram://post/:id
    if (segments[0] === 'post' && segments[1]) {
      return { type: 'post', id: segments[1] };
    }

    // gitgram://profile/:username
    if (segments[0] === 'profile' && segments[1]) {
      return { type: 'profile', username: segments[1] };
    }

    // gitgram://repo/:owner/:name
    if (segments[0] === 'repo' && segments[1] && segments[2]) {
      return { type: 'repo', owner: segments[1], name: segments[2] };
    }

    return { type: 'unknown', url };
  } catch {
    return null;
  }
}

function navigateToRoute(route: DeepLinkRoute): void {
  switch (route.type) {
    case 'post':
      router.push(`/post/${route.id}` as never);
      break;
    case 'profile':
      router.push(`/profile/${route.username}` as never);
      break;
    case 'repo':
      router.push(`/repo/${route.owner}/${route.name}` as never);
      break;
    case 'unknown':
      // No navigation for unrecognised deep links
      break;
  }
}

export function useDeepLink(): UseDeepLinkReturn {
  const [isReady, setIsReady] = useState(false);

  const handleDeepLink = useCallback((url: string) => {
    const route = parseDeepLink(url);
    if (route !== null) {
      navigateToRoute(route);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Handle links received while the app is already running
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (isMounted) {
        handleDeepLink(url);
      }
    });

    // Handle the link that launched the app cold
    Linking.getInitialURL().then((url) => {
      if (isMounted && url) {
        handleDeepLink(url);
      }
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [handleDeepLink]);

  return { isReady, handleDeepLink };
}
