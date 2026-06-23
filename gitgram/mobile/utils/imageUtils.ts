import * as ImageManipulator from 'expo-image-manipulator';

export const compressImage = async (
  uri: string,
  quality: number = 0.8
): Promise<string> => {
  try {
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }], // Resize to max 1080px width
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipulatedImage.uri;
  } catch (error) {
    console.error('Image compression error:', error);
    return uri; // Return original if compression fails
  }
};

export const generateThumbnail = async (
  uri: string,
  width: number = 200
): Promise<string> => {
  try {
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipulatedImage.uri;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return uri;
  }
};

