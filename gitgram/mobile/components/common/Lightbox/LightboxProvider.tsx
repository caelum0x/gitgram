import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { useLightboxStore } from './lightboxStore';

/**
 * App-wide fullscreen image lightbox. Mounted once near the root so any screen
 * can call `useLightbox()` to present a zoomable, swipeable image viewer with
 * swipe-down-to-dismiss.
 *
 * Built on react-native-image-viewing (gesture-handler based, no reanimated),
 * adapted to the product's dark theme with a custom header (close + counter)
 * and an alt-text caption footer.
 */
export function LightboxProvider() {
  const { visible, images, initialIndex, close } = useLightboxStore();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Keep local index in sync whenever the lightbox (re)opens.
  const onIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const renderHeader = useCallback(
    ({ imageIndex }: { imageIndex: number }) => (
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={close}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {images.length > 1 && (
            <Text style={styles.counter}>
              {imageIndex + 1} / {images.length}
            </Text>
          )}
          <View style={styles.closeButton} />
        </View>
      </SafeAreaView>
    ),
    [close, images.length],
  );

  const renderFooter = useCallback(
    ({ imageIndex }: { imageIndex: number }) => {
      const alt = images[imageIndex]?.alt;
      if (!alt) return <View />;
      return (
        <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
          <View style={styles.footer}>
            <Text style={styles.altText} numberOfLines={4}>
              {alt}
            </Text>
          </View>
        </SafeAreaView>
      );
    },
    [images],
  );

  if (!visible || images.length === 0) {
    return null;
  }

  return (
    <ImageView
      images={images.map((image) => ({ uri: image.uri }))}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={close}
      onImageIndexChange={onIndexChange}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      presentationStyle="overFullScreen"
      animationType={Platform.OS === 'ios' ? 'fade' : 'none'}
      backgroundColor="#000000"
      HeaderComponent={renderHeader}
      FooterComponent={renderFooter}
      keyExtractor={(_, index) => `lightbox-${currentIndex}-${index}`}
    />
  );
}

const styles = StyleSheet.create({
  headerSafeArea: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerSafeArea: {
    width: '100%',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  altText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
});
