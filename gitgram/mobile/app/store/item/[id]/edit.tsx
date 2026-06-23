import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../../constants/Colors';
import Header from '../../../../components/navigation/Header';
import LoadingSpinner from '../../../../components/common/LoadingSpinner';
import { storeService } from '../../../../services/storeService';
import { logger } from '../../../../utils/logger';

export default function EditStoreItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
  });

  useEffect(() => {
    if (id && typeof id === 'string') {
      loadItem();
    }
  }, [id]);

  const loadItem = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      setLoading(true);
      const response = await storeService.getItem(id);
      const item = response.item;
      setFormData({
        name: item.name || '',
        description: item.description || '',
        price: item.price?.toString() || '',
        category: item.category || '',
      });
    } catch (error) {
      logger.error('Load store item error:', error);
      Alert.alert('Error', 'Failed to load item');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id || typeof id !== 'string') return;

    if (!formData.name || !formData.price) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      await storeService.updateItem(id, {
        title: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
      });
      Alert.alert('Success', 'Item updated successfully');
      router.back();
    } catch (error: any) {
      logger.error('Update store item error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Edit Item" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Edit Item" rightIcon="check" onRightPress={handleSave} />
      <View style={styles.content}>
        <Text style={styles.label}>Item Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter item name"
          placeholderTextColor={Colors.textSecondary}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Enter description"
          placeholderTextColor={Colors.textSecondary}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Price *</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={Colors.textSecondary}
          value={formData.price}
          onChangeText={(text) => setFormData({ ...formData, price: text })}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., project, code, template"
          placeholderTextColor={Colors.textSecondary}
          value={formData.category}
          onChangeText={(text) => setFormData({ ...formData, category: text })}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <LoadingSpinner />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

