import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../../constants/Colors';

interface PostOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  onReport: () => void;
  onShare?: () => void;
  onSave?: () => void;
  onCopyLink?: () => void;
  isOwner?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface OptionItem {
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
  hidden?: boolean;
}

export default function PostOptionsModal({
  visible,
  onClose,
  onReport,
  onShare,
  onSave,
  onCopyLink,
  isOwner = false,
  onEdit,
  onDelete,
}: PostOptionsModalProps) {
  const handleOptionPress = (onPress: () => void) => {
    onClose();
    // Small delay to allow modal to close before opening another modal
    setTimeout(() => onPress(), 200);
  };

  const options: OptionItem[] = [
    {
      label: 'Share',
      icon: '📤',
      onPress: () => onShare?.(),
      hidden: !onShare,
    },
    {
      label: 'Save',
      icon: '🔖',
      onPress: () => onSave?.(),
      hidden: !onSave,
    },
    {
      label: 'Copy link',
      icon: '🔗',
      onPress: () => onCopyLink?.(),
      hidden: !onCopyLink,
    },
    {
      label: 'Edit',
      icon: '✏️',
      onPress: () => onEdit?.(),
      hidden: !isOwner || !onEdit,
    },
    {
      label: 'Report',
      icon: '🚩',
      onPress: () => handleOptionPress(onReport),
      destructive: true,
      hidden: isOwner, // Don't show report option for own posts
    },
    {
      label: 'Delete',
      icon: '🗑️',
      onPress: () => onDelete?.(),
      destructive: true,
      hidden: !isOwner || !onDelete,
    },
  ];

  const visibleOptions = options.filter(opt => !opt.hidden);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.handleBar} />
            {visibleOptions.map((option, index) => (
              <TouchableOpacity
                key={option.label}
                style={[
                  styles.option,
                  index === visibleOptions.length - 1 && styles.lastOption,
                ]}
                onPress={option.onPress}
              >
                <Text style={styles.optionIcon}>{option.icon}</Text>
                <Text
                  style={[
                    styles.optionLabel,
                    option.destructive && styles.destructiveLabel,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    padding: 8,
    paddingBottom: 34, // Safe area padding
  },
  content: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lastOption: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  optionLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  destructiveLabel: {
    color: Colors.error,
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.accent,
  },
});
