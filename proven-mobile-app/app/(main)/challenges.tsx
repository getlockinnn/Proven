import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { Challenge, fetchUserChallenges, UserChallenge } from '../../services/challengeService';

// Components
import {
  ChallengeListItem,
  ChallengesHeader,
  TabSelector,
  type TabType
} from '../../components/challenges';
import { EmptyState } from '../../components/ui';

export default function ChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [activeChallenges, setActiveChallenges] = useState<UserChallenge[]>([]);
  const [completedChallenges, setCompletedChallenges] = useState<UserChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadUserChallenges();
    }, [])
  );

  const loadUserChallenges = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) setLoading(true);
      const { active, completed } = await fetchUserChallenges(forceRefresh);
      setActiveChallenges(active);
      setCompletedChallenges(completed);
      // todayStatus is now populated correctly by the backend fetchUserChallenges call!
    } catch (error) {
      console.error('Error loading user challenges:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUserChallenges(true);
  }, []);

  const transformToChallenge = (uc: UserChallenge) => {
    // Map the backend's 'submitted' to the UI's 'under_review' to match the design system
    const rawStatus = uc.todayStatus;
    let todayStatus: 'pending' | 'under_review' | 'approved' | 'rejected' = 'pending';
    if (rawStatus === 'submitted') todayStatus = 'under_review';
    else if (rawStatus === 'approved') todayStatus = 'approved';
    else if (rawStatus === 'rejected') todayStatus = 'rejected';
    const earnedAmount = uc.stakeAmount * 1.5;
    const timeline =
      uc.challenge?.timeline ||
      (uc.challenge as any)?.duration ||
      getDurationLabel(uc.challenge?.startDate || uc.startDate, uc.challenge?.endDate || uc.endDate);

    return {
      id: uc.challenge?.id || uc.challengeId,
      title: uc.challenge?.title || 'Challenge',
      description: uc.challenge?.description || '',
      imageUrl: uc.challenge?.image || uc.challenge?.imageUrl,
      timeline,
      stakeAmount: uc.stakeAmount,
      prizePool: uc.challenge?.totalPrizePool || uc.challenge?.prizePool || 0,
      participants: uc.challenge?.participants || 0,
      status: uc.status.toLowerCase() as any,
      category: uc.challenge?.metrics || 'Other',
      startDate: uc.startDate,
      endDate: uc.endDate || uc.challenge?.endDate,
      progress: uc.progress,
      todayStatus: todayStatus as 'pending' | 'under_review' | 'approved' | 'rejected',
      earnedAmount,
    } as unknown as Challenge;
  };

  const currentList = activeTab === 'active'
    ? activeChallenges
      .map(transformToChallenge)
      // Sort urgency for active tab:
      // pending -> rejected -> under review -> approved
      .sort((a: any, b: any) => {
        const order: Record<string, number> = {
          pending: 0,
          rejected: 1,
          under_review: 2,
          approved: 3,
        };
        return (order[a.todayStatus] ?? 99) - (order[b.todayStatus] ?? 99);
      })
    : completedChallenges.map(transformToChallenge);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ChallengesHeader />

      <TabSelector activeTab={activeTab} onTabChange={setActiveTab} />

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
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.provenGreen}
              colors={[colors.provenGreen]}
            />
          }
        >
          {currentList.length === 0 ? (
            <EmptyState
              icon={activeTab === 'completed' ? 'medal-outline' : 'rocket-outline'}
              title={activeTab === 'completed' ? 'No completed challenges yet' : 'No active challenges'}
              subtitle={activeTab === 'completed'
                ? 'Complete your first challenge to see it here!'
                : 'Join a challenge to start your journey!'}
              actionLabel={activeTab === 'active' ? 'Browse Challenges' : undefined}
              onPress={activeTab === 'active' ? () => router.push('/') : undefined}
            />
          ) : (
            <View style={styles.listContainer}>
              {currentList.map((challenge, index) => (
                <ChallengeListItem
                  key={challenge.id}
                  challenge={challenge}
                  index={index}
                  isCompleted={activeTab === 'completed'}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function getLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapCalendarStatusToTodayStatus(
  status?: string
): 'pending' | 'under_review' | 'approved' | 'rejected' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'submitted') return 'under_review';
  return 'pending';
}

function getDurationLabel(startDate?: string, endDate?: string | null): string {
  if (!startDate || !endDate) return '';

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return `${days} days`;
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
    gap: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
