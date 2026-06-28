import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';

// Matches Bluesky's alt-text limit for parity with the source pattern.
export const MAX_ALT_TEXT = 2000;

const enforceLen = (str: string, max: number): string =>
  str.length > max ? str.slice(0, max) : str;

interface ImageAltTextDialogProps {
  visible: boolean;
  imageUri: string;
  initialAltText?: string;
  // Called with the (length-enforced) alt text when the user saves.
  onSave: (altText: string) => void;
  onClose: () => void;
}

/**
 * Per-image alt-text authoring dialog. Ported from Bluesky's ImageAltTextDialog
 * onto the product's React Native Modal stack: shows the image being described,
 * a multiline field with a live character counter, length enforcement, and a
 * truncation warning.
 */
export default function ImageAltTextDialog({
  visible,
  imageUri,
  initialAltText = '',
  onSave,
  onClose,
}: ImageAltTextDialogProps) {
  const [altText, setAltText] = useState(initialAltText);

  // Reset the field whenever the dialog is (re)opened for a new image.
  useEffect(() => {
    if (visible) {
      setAltText(initialAltText);
    }
  }, [visible, initialAltText]);

  const overLimit = altText.length > MAX_ALT_TEXT;
  const remaining = MAX_ALT_TEXT - altText.length;

  const handleSave = () => {
    onSave(enforceLen(altText.trim(), MAX_ALT_TEXT));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Icon name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Add alt text</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={overLimit}
            accessibilityRole="button"
            accessibilityLabel="Save alt text"
          >
            <Text style={[styles.saveText, overLimit && styles.saveTextDisabled]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.imageWrapper}>
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          </View>

          <Text style={styles.label}>Descriptive alt text</Text>
          <TextInput
            style={styles.input}
            value={altText}
            onChangeText={setAltText}
            placeholder="Describe this image for people who can't see it"
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={4}
            autoFocus
            textAlignVertical="top"
            maxLength={MAX_ALT_TEXT + 100}
            accessibilityLabel="Alt text"
          />

          <View style={styles.metaRow}>
            {overLimit ? (
              <View style={styles.warningRow}>
                <Icon name="error-outline" size={16} color={Colors.error} />
                <Text style={styles.warningText}>
                  Alt text will be truncated. Limit: {MAX_ALT_TEXT} characters.
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Text style={[styles.counter, overLimit && styles.counterOver]}>{remaining}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  saveTextDisabled: {
    color: Colors.disabled,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surface,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  warningText: {
    color: Colors.error,
    fontSize: 12,
    flexShrink: 1,
  },
  counter: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginLeft: 8,
  },
  counterOver: {
    color: Colors.error,
  },
});
