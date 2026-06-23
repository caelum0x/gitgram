import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import SplashScreen from '../components/common/SplashScreen';

export default function Index() {
  const { isAuthenticated, initialize } = useAuthStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initialize();
    
    // Show splash screen for 2 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }
  
  return <Redirect href="/(auth)/login" />;
}

