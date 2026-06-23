import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ui/ThemedView';
import { ThemedText } from '../../components/ui/ThemedText';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';

export default function Header({ title, showBack = true, rightAction, onRightPress }: any) {
  const router = useRouter();

  return (
    <ThemedView style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {showBack && (
          <TouchableOpacity onPress={() => router.back()}>
            <Icon name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
        <ThemedText type="subtitle">{title}</ThemedText>
      </View>
      
      {rightAction && (
        <TouchableOpacity onPress={onRightPress}>
          {rightAction}
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}
