import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../../constants/Colors';
import Header from '../../../../components/navigation/Header';
import { Button } from '../../../../components/ui/Button';
import { adCampaignService } from '../../../../services/adCampaignService';
import { logger } from '../../../../utils/logger';

const PRESET_AMOUNTS = [10, 25, 50, 100, 250];

export default function FundCampaignScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = Number(amount);
  const isValid = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const handleFund = async () => {
    if (!id) return;
    if (!isValid) {
      Alert.alert('Error', 'Enter a valid funding amount greater than 0');
      return;
    }

    setSubmitting(true);
    try {
      await adCampaignService.fundCampaign(id, parsedAmount);
      Alert.alert('Funded', `Added $${parsedAmount.toFixed(2)} to your campaign budget`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error('Fund campaign error:', error);
      Alert.alert('Error', 'Failed to fund campaign. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Add Funds" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Funding amount (USD)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="decimal-pad"
        />

        <View style={styles.presets}>
          {PRESET_AMOUNTS.map((preset) => (
            <TouchableOpacity
              key={preset}
              style={styles.presetChip}
              onPress={() => setAmount(String(preset))}
            >
              <Text style={styles.presetText}>${preset}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title="Add Funds"
          onPress={handleFund}
          size="lg"
          loading={submitting}
          disabled={submitting || !isValid}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 24,
    fontWeight: '600',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetText: {
    color: Colors.text,
    fontWeight: '600',
  },
});
