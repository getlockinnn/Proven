import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { fetchLeaderboard, LeaderboardEntry } from '../../services/leaderboardService';

// Components
import {
  LeaderboardHeader,
  LeaderboardPeriod,
  LeaderboardRow,
  Podium
} from '../../components/leaderboard';

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<LeaderboardPeriod>('weekly');
  const [leaderboardData, setLeaderboardData] = useState<{
    daily: LeaderboardEntry[];
    weekly: LeaderboardEntry[];
  }>({ daily: [], weekly: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const [daily, weekly] = await Promise.all([
        fetchLeaderboard('daily'),
        fetchLeaderboard('weekly'),
      ]);
      setLeaderboardData({ daily, weekly });
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [daily, weekly] = await Promise.all([
        fetchLeaderboard('daily'),
        fetchLeaderboard('weekly'),
      ]);
      setLeaderboardData({ daily, weekly });
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const currentLeaderboard = useMemo(() => {
    return (leaderboardData[selectedPeriod] || []).slice(0, 10);
  }, [selectedPeriod, leaderboardData]);

  // Show podium only when we have all 3 slots filled
  const showPodium = currentLeaderboard.length >= 3;
  const restOfLeaderboard = showPodium
    ? currentLeaderboard.slice(3)
    : currentLeaderboard;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LeaderboardHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.provenGreen} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
            currentLeaderboard.length === 0 && styles.emptyScrollContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.provenGreen} />
          }
        >
          {currentLeaderboard.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No rankings yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Complete challenges and submit proofs to climb the leaderboard!
              </Text>
            </View>
          ) : (
            <>
              {showPodium && <Podium data={currentLeaderboard} />}

              <View style={styles.listContainer}>
                {restOfLeaderboard.map((item, index) => {
                  const rowUserId = item.userId || '';

                  let gapToNext: number | undefined;
                  if (item.isCurrentUser) {
                    const targetRankIndex = item.rank - 2;
                    if (targetRankIndex >= 0 && currentLeaderboard[targetRankIndex]) {
                      const targetEarnings = currentLeaderboard[targetRankIndex].earnings || currentLeaderboard[targetRankIndex].earned || 0;
                      const myEarnings = item.earnings || item.earned || 0;
                      gapToNext = targetEarnings - myEarnings + 1;
                    }
                  }

                  return (
                    <LeaderboardRow
                      key={`${selectedPeriod}-${item.rank}-${rowUserId}`}
                      rank={item.rank}
                      name={item.name}
                      earnings={item.earnings || item.earned}
                      avatar={item.avatar}
                      isCurrentUser={item.isCurrentUser}
                      index={index}
                      gapToNext={gapToNext}
                      userId={rowUserId}
                      onPress={
                        !item.isCurrentUser && rowUserId
                          ? () => router.push(`/user/${rowUserId}`)
                          : undefined
                      }
                    />
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  listContainer: {
    gap: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl * 2,
  },
  emptyTitle: {
    ...typography.heading3,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});
