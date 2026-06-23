import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function AdsManagerScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalImpressions: 20000,
    totalClicks: 570,
    totalSpend: 165.50
  });

  useEffect(() => {
    // Mock data
    setCampaigns([
      { id: 1, name: 'Summer Sale', status: 'active', impressions: 15000, clicks: 450, spend: 120.50 },
      { id: 2, name: 'New Feature Launch', status: 'paused', impressions: 5000, clicks: 120, spend: 45.00 },
    ]);
  }, []);

  const renderCampaign = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.campaignCard}>
      <View style={styles.campaignHeader}>
        <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
        <View style={[
          styles.statusBadge,
          item.status === 'active' ? styles.statusActive : styles.statusPaused
        ]}>
          <ThemedText style={[
            styles.statusText,
            item.status === 'active' ? styles.statusTextActive : styles.statusTextPaused
          ]}>
            {item.status.toUpperCase()}
          </ThemedText>
        </View>
      </View>
      
      <View style={styles.campaignStats}>
        <View style={styles.statItem}>
          <ThemedText type="caption">Impressions</ThemedText>
          <ThemedText type="defaultSemiBold">{item.impressions.toLocaleString()}</ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText type="caption">Clicks</ThemedText>
          <ThemedText type="defaultSemiBold">{item.clicks.toLocaleString()}</ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText type="caption">Spend</ThemedText>
          <ThemedText type="defaultSemiBold">${item.spend.toFixed(2)}</ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <ThemedText type="title">Ads Manager</ThemedText>
        <Button title="Create" size="sm" onPress={() => {}} />
      </View>

      <ScrollView>
        {/* Overview Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <ThemedText type="caption">Impressions</ThemedText>
            <ThemedText type="title">{stats.totalImpressions.toLocaleString()}</ThemedText>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statCard, { flex: 1, marginRight: 8 }]}>
              <ThemedText type="caption">Clicks</ThemedText>
              <ThemedText type="subtitle">{stats.totalClicks.toLocaleString()}</ThemedText>
            </View>
            <View style={[styles.statCard, { flex: 1, marginLeft: 8 }]}>
              <ThemedText type="caption">Spend</ThemedText>
              <ThemedText type="subtitle">${stats.totalSpend.toFixed(2)}</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Campaigns</ThemedText>
          <FlatList
            data={campaigns}
            renderItem={renderCampaign}
            keyExtractor={item => item.id.toString()}
            scrollEnabled={false}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    paddingRight: 16,
  },
  statsContainer: {
    padding: 20,
  },
  statCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  campaignCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  campaignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: 'rgba(35, 134, 54, 0.1)',
  },
  statusPaused: {
    backgroundColor: 'rgba(157, 166, 185, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusTextActive: {
    color: Colors.success,
  },
  statusTextPaused: {
    color: Colors.textSecondary,
  },
  campaignStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
});

