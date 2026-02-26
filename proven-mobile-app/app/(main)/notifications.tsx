import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityFeed } from '../../components/social';
import { useTheme } from '../../context/ThemeContext';

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ActivityFeed active />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
