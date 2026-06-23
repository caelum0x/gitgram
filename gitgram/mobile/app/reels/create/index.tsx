import React from 'react';
import { Redirect } from 'expo-router';

export default function CreateReelRedirect() {
  // Redirect to camera view or gallery picker for reels
  // For now reusing post creation but forcing video type
  return <Redirect href="/(modals)/create-post" />;
}

