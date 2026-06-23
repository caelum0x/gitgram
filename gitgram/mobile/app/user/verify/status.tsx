import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import { userService } from '../../../services/userService';
import { logger } from '../../../utils/logger';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function VerificationStatusScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      const response = await userService.getVerificationStatus();
      setStatus(response.status || response);
    } catch (error) {
      logger.error('Load verification status error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Verification Status" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Header title="Verification Status" />
      <View style={styles.content}>
        {status?.isGoldenVerified ? (
          <View style={styles.statusCard}>
            <Icon name="workspace-premium" size={64} color="#FFD700" />
            <Text style={styles.statusTitle}>Golden Verified</Text>
            <Text style={styles.statusDescription}>
              Your account has been verified with a golden badge. You're a premium member!
            </Text>
          </View>
        ) : status?.isVerified ? (
          <View style={styles.statusCard}>
            <Icon name="verified" size={64} color={Colors.accent} />
            <Text style={styles.statusTitle}>Verified</Text>
            <Text style={styles.statusDescription}>
              Your account has been verified with a blue checkmark badge.
            </Text>
          </View>
        ) : (
          <View style={styles.statusCard}>
            <Icon name="info" size={64} color={Colors.textSecondary} />
            <Text style={styles.statusTitle}>Not Verified</Text>
            <Text style={styles.statusDescription}>
              Your account is not yet verified. Request verification to get a verified badge.
            </Text>
            <TouchableOpacity
              style={styles.requestButton}
              onPress={() => router.push('/user/verify')}
            >
              <Text style={styles.requestButtonText}>Request Verification</Text>
            </TouchableOpacity>
          </View>
        )}

        {status?.isVerified && !status?.isGoldenVerified && (
          <View style={styles.upgradeSection}>
            <Text style={styles.upgradeTitle}>Upgrade to Golden Verification</Text>
            <Text style={styles.upgradeDescription}>
              Get a golden badge and unlock premium features with golden verification.
            </Text>
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/user/verify/golden')}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Golden</Text>
            </TouchableOpacity>
          </View>
        )}
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
    padding: 20,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  statusDescription: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  requestButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
  },
  requestButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  upgradeSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  upgradeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  upgradeDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

