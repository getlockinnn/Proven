import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChallengeDetailCTA } from '../../components/challenge-detail/ChallengeDetailCTA';
import { PostSubmissionState } from '../../components/challenge-detail/PostSubmissionState';
import { CountdownTimer } from '../../components/ui/CountdownTimer';
import { ProofImages, ProveModal } from '../../components/ui/ProveModal';
import { StatusPill } from '../../components/ui/StatusPill';
import { StakePaymentModal } from '../../components/wallet/StakePaymentModal';
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/theme';
import { useTapestry } from '../../context/TapestryContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Challenge,
  checkUserChallenge,
  fetchChallengeById,
} from '../../services/challengeService';
import { CalendarDay, getChallengeCalendar, uploadAndSubmitProof } from '../../services/proofService';
import { getUserProfile, updateUserProfile } from '../../services/userService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function getPartValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  const value = parts.find((part) => part.type === type)?.value;
  return value ? parseInt(value, 10) : 0;
}

function getUtcMsFromTimeZoneView(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Date.UTC(
    getPartValue(parts, 'year'),
    getPartValue(parts, 'month') - 1,
    getPartValue(parts, 'day'),
    getPartValue(parts, 'hour'),
    getPartValue(parts, 'minute'),
    getPartValue(parts, 'second')
  );
}

function getDayRangeUtc(referenceDate: Date, timeZone: string): { startUtc: Date; endUtc: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const year = getPartValue(parts, 'year');
  const month = String(getPartValue(parts, 'month')).padStart(2, '0');
  const day = String(getPartValue(parts, 'day')).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;
  const offsetMs = getUtcMsFromTimeZoneView(referenceDate, timeZone) - getUtcMsFromTimeZoneView(referenceDate, 'UTC');
  const startUtc = new Date(Date.parse(`${dateKey}T00:00:00Z`) - offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

export default function ChallengeDetailScreen() {
  const { id, isActive } = useLocalSearchParams<{ id: string; isActive?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { tapestryProfileId } = useTapestry();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  const [userChallengeId, setUserChallengeId] = useState<string | null>(null);
  const [userChallengeStatus, setUserChallengeStatus] = useState<string | null>(null);
  const [solanaPayModalVisible, setSolanaPayModalVisible] = useState(false);

  const [showProveModal, setShowProveModal] = useState(false);
  const [swipeKey, setSwipeKey] = useState(0);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calendarTotalDays, setCalendarTotalDays] = useState(0);
  const [challengeTimezone, setChallengeTimezone] = useState('Asia/Kolkata');
  const [todayCalendarStatus, setTodayCalendarStatus] = useState<string | null>(null);
  const [todayPayoutSignature, setTodayPayoutSignature] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [userHasWallet, setUserHasWallet] = useState(true);

  // Optional state for "View Full Rules" toggle
  const [showFullRules, setShowFullRules] = useState(false);

  // Challenge is completed if backend marked it or end date has passed
  const isChallengeCompleted = challenge?.status === 'completed';

  // User's participation is done if their userChallenge status is COMPLETED or FAILED
  const isUserChallengeDone = userChallengeStatus === 'COMPLETED' || userChallengeStatus === 'FAILED';

  // Determine if this is an active challenge the user needs to prove
  const isActiveChallenge = (isActive === 'true' || hasJoined) && !isUserChallengeDone && !isChallengeCompleted;

  useEffect(() => {
    loadChallengeData();
  }, [id]);

  const loadChallengeData = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setUserChallengeId(null);
      setUserChallengeStatus(null);
      setCalendarDays([]);
      setCalendarTotalDays(0);
      setChallengeTimezone('Asia/Kolkata');
      setTodayCalendarStatus(null);
      setTodayPayoutSignature(null);

      // Fetch challenge details and membership first.
      // Calendar should only be requested for joined users.
      const [challengeData, userCheck] = await Promise.all([
        fetchChallengeById(id),
        checkUserChallenge(id),
      ]);

      if (challengeData) {
        setChallenge(challengeData);
      }

      const { hasJoined: joined, userChallenge } = userCheck;
      setHasJoined(joined);

      // Check if user has a wallet address for payouts
      if (joined) {
        getUserProfile().then((profile) => {
          setUserHasWallet(!!profile?.walletAddress);
        }).catch(() => {});
      }

      if (userChallenge) {
        setUserChallengeId(userChallenge.id);
        setUserChallengeStatus(userChallenge.status);

        const calendar = await getChallengeCalendar(id, { forceRefresh: true }).catch(() => null);

        // Process calendar/proof data if available
        if (calendar) {
          setCalendarDays(calendar.calendar);
          setCalendarTotalDays(calendar.statistics.totalDays);
          setChallengeTimezone(calendar.challenge.challengeTimezone || 'Asia/Kolkata');
          const todayEntry = calendar.calendar.find((day) => day.isToday);
          if (todayEntry?.status) {
            setTodayCalendarStatus(todayEntry.status);
          }
          if (todayEntry?.payout?.transactionSignature) {
            setTodayPayoutSignature(todayEntry.payout.transactionSignature);
          }
        }
      }
    } catch (error) {
      console.error('Error loading challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const completedDays = useMemo(() => {
    if (!isActiveChallenge || !challenge) return [];
    return calendarDays
      .filter((day) => day.status === 'submitted' || day.status === 'approved' || day.status === 'rejected')
      .map((day) => day.dayNumber);
  }, [isActiveChallenge, challenge, calendarDays]);

  const proofImagesByDay = useMemo(() => {
    const images: ProofImages = {};
    for (const day of calendarDays) {
      if (
        day.submission?.imageUrl &&
        !day.isFuture &&
        day.status !== 'locked'
      ) {
        images[day.dayNumber] = day.submission.imageUrl;
      }
    }
    return images;
  }, [calendarDays]);

  const challengeRules = useMemo(() => {
    const cleanedRules = (challenge?.rules || [])
      .map((rule) => (typeof rule === 'string' ? rule.trim() : ''))
      .filter(Boolean);

    if (cleanedRules.length > 0) return cleanedRules;

    return [
      'Complete the challenge activity for today.',
      'Submit proof before 11:59 PM IST.',
      'Missed days are not eligible for payout.',
    ];
  }, [challenge?.rules]);

  const primaryRule = challengeRules[0] || 'Complete the challenge activity for today.';

  // Derived state for Execution Mode
  const executionState = useMemo(() => {
    if (!challenge || !isActiveChallenge) return null;

    const todayEntry = calendarDays.find((day) => day.isToday);
    const dayNumber = todayEntry?.dayNumber ?? 1;
    const totalDays = calendarTotalDays > 0 ? calendarTotalDays : Math.max(calendarDays.length, 1);
    const rawStatus = todayEntry?.status || todayCalendarStatus || undefined;
    const isSubmittedToday = rawStatus === 'submitted' || rawStatus === 'approved' || rawStatus === 'rejected';

    // Determine the 'pill status' string for UI
    let todayStatus: 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected' = 'pending';
    if (rawStatus === 'submitted') todayStatus = 'under_review';
    else if (rawStatus === 'approved') todayStatus = 'approved';
    else if (rawStatus === 'rejected') todayStatus = 'rejected';

    const dayRange = getDayRangeUtc(new Date(), challengeTimezone);
    const deadline = new Date(dayRange.endUtc.getTime() - 1);

    return {
      dayNumber,
      totalDays,
      isSubmittedToday,
      todayStatus,
      stakeAtRisk: challenge.stakeAmount || 0, // Simplified: daily stake risk
      deadline,
    };
  }, [challenge, isActiveChallenge, calendarDays, calendarTotalDays, challengeTimezone, todayCalendarStatus]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.provenGreen} />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Challenge not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.provenGreen }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleJoinChallenge = async () => {
    if (!challenge) return;

    // Open Solana Pay modal to handle staking
    setSolanaPayModalVisible(true);
  };

  const handleStakeSuccess = () => {
    setSolanaPayModalVisible(false);
    setHasJoined(true);
    loadChallengeData();

    Alert.alert(
      'Challenge Joined! 🎉',
      `You've successfully joined "${challenge?.title}". Your stake of $${challenge?.stakeAmount || 0} USDC has been locked.`,
      [
        {
          text: 'View My Challenges',
          onPress: () => router.push('/(main)/challenges'),
        },
        {
          text: 'Stay Here',
          style: 'cancel',
        },
      ]
    );
  };

  const handleProveChallenge = () => {
    setShowProveModal(true);
  };

  const handleCameraPress = async () => {
    if (submittingProof) return;

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(
        'Camera Access Needed',
        'To submit proof, we need access to your camera. Please enable camera permissions in your device settings.',
        [{ text: 'Got it' }]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;

      // Upload and submit proof to backend
      if (userChallengeId) {
        try {
          setSubmittingProof(true);
          const dayNumber = executionState?.dayNumber ?? 1;
          const totalDays = executionState?.totalDays ?? Math.max(calendarTotalDays, 1);
          const submitResult = await uploadAndSubmitProof(
            userChallengeId,
            imageUri,
            undefined,
            id,
            {
              tapestryProfileId,
              challengeTitle: challenge?.title || 'Challenge',
              dayNumber,
              totalDays,
              earnedAmount: challenge?.stakeAmount && totalDays > 0
                ? challenge.stakeAmount / totalDays
                : undefined,
            }
          );

          if (submitResult.success && !submitResult.pending) {
            setShowProveModal(false);
            setSwipeKey((prev) => prev + 1);
            await loadChallengeData();
          } else if (submitResult.alreadySubmitted) {
            setShowProveModal(false);
            setSwipeKey((prev) => prev + 1);

            await loadChallengeData();
            Alert.alert(
              'Already Submitted',
              submitResult.message || "You've already submitted proof for today.",
              [{ text: 'OK' }]
            );
          } else if (submitResult.pending) {
            setShowProveModal(false);
            Alert.alert(
              'Saved for Later',
              submitResult.message || 'Your proof is saved locally and will retry when you are back online.',
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Submission Issue',
              submitResult.message || "We couldn't save your proof right now. Please try again.",
              [{ text: 'OK' }]
            );
          }
        } finally {
          setSubmittingProof(false);
        }
      }
    }
  };

  const handleModalClose = () => {
    if (submittingProof) return;
    setShowProveModal(false);
    setSwipeKey((prev) => prev + 1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate timeline from dates
  const getTimeline = () => {
    if (challenge.timeline) return challenge.timeline;
    if (challenge.startDate && challenge.endDate) {
      const start = new Date(challenge.startDate);
      const end = new Date(challenge.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return `${days} days`;
    }
    return '30 days';
  };

  // --- Render Helpers ---

  const renderPreJoinHeader = () => (
    <View style={styles.headerOverlay}>
      <View style={styles.categoryBadge}>
        <View style={styles.categoryIcon}>
          <Ionicons name="fitness" size={12} color="#FFFFFF" />
        </View>
        <Text style={styles.categoryText}>
          {(challenge.category || challenge.metrics || 'CHALLENGE').toUpperCase()}
        </Text>
      </View>
      <Text style={styles.headerTitle}>{challenge.title}</Text>

      {/* Social Proof Stats */}
      <View style={styles.socialStatsRow}>
        <View style={styles.statBadge}>
          <Ionicons name="people" size={14} color="#FFFFFF" />
          <Text style={styles.statText}>
            {challenge.participants ? challenge.participants.toLocaleString() : '212'} joined
          </Text>
        </View>
        <View style={styles.statBadge}>
          <Ionicons name="trophy" size={14} color="#ffd700" />
          <Text style={styles.statText}>94% rate</Text>
        </View>
      </View>
    </View>
  );

  const renderPostJoinHeader = () => {
    if (!executionState) return null;

    // Use proper status from executionState
    const pillStatus = executionState.todayStatus;
    const isSubmitted = executionState.isSubmittedToday;
    const isRejected = pillStatus === 'rejected';

    return (
      <View style={styles.headerOverlay}>
        <Text style={styles.headerTitle}>{challenge.title}</Text>

        {/* Execution Stats Row */}
        <View style={styles.executionStatsRow}>
          <Text style={[
            styles.dayProgressText,
            isSubmitted && !isRejected && styles.dayProgressTextSuccess
          ]}>
            {isSubmitted && !isRejected ? `Day ${executionState.dayNumber} complete` : `Day ${executionState.dayNumber} of ${executionState.totalDays}`}
          </Text>
        </View>

        {/* Only show urgency signals when NOT submitted (or rejected with retry?) - simplistic: hide if submitted */}
        {!isSubmitted ? (
          <View style={styles.executionMetaRow}>
            <Text style={styles.stakeRiskText}>Stake at risk today: ${executionState.stakeAtRisk}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <StatusPill status="pending" />
              <CountdownTimer
                deadline={executionState.deadline}
                status="pending"
              />
            </View>
          </View>
        ) : (
          <View style={styles.executionMetaRow}>
            {/* If approved/rejected, show appropriate pill */}
            <StatusPill status={pillStatus} />
          </View>
        )}
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Hero Section (Shared but content differs) */}
        <View style={styles.imageSection}>
          <Image
            source={{ uri: challenge.imageUrl || challenge.image }}
            style={styles.heroImage}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />

          <View style={[styles.imageStatusPill, { top: insets.top + spacing.md }]}>
            {/* Hide generic status pill in post-join (we show specific daily status) */}
            {!isActiveChallenge && <StatusPill status={challenge.status || 'active'} />}
          </View>

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.gradientOverlay}
            locations={[0.4, 1]}
          />

          {/* Header Content Overlay */}
          {hasJoined && (isChallengeCompleted || isUserChallengeDone) ? (
            // --- COMPLETED CHALLENGE HEADER (for joined users) ---
            <View style={styles.headerOverlay}>
              <Text style={styles.headerTitle}>{challenge.title}</Text>
              <View style={styles.executionStatsRow}>
                <Text style={[styles.dayProgressText, styles.dayProgressTextSuccess]}>
                  Challenge {userChallengeStatus === 'COMPLETED' ? 'Completed' : 'Ended'}
                </Text>
              </View>
            </View>
          ) : isActiveChallenge ? renderPostJoinHeader() : renderPreJoinHeader()}
        </View>

        {/* Content Card */}
        <View style={[styles.contentCard, { backgroundColor: colors.cardBackground }]}>

          {hasJoined && (isChallengeCompleted || isUserChallengeDone) ? (
            // --- COMPLETED CHALLENGE CONTENT (for joined users) ---
            <View style={styles.sectionContainer}>
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                <Ionicons
                  name={userChallengeStatus === 'COMPLETED' ? 'trophy' : 'flag'}
                  size={48}
                  color={userChallengeStatus === 'COMPLETED' ? '#ffd700' : colors.textMuted}
                />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, textAlign: 'center', marginTop: spacing.md }]}>
                  {userChallengeStatus === 'COMPLETED' ? 'Challenge Complete!' : 'Challenge Ended'}
                </Text>
                <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
                  {userChallengeStatus === 'COMPLETED'
                    ? 'Congratulations! You successfully completed this challenge.'
                    : 'This challenge has ended. Check out other challenges to keep going!'}
                </Text>
              </View>

              {/* Stats summary */}
              <View style={[styles.commitmentGrid, { marginTop: spacing.md }]}>
                <View style={[styles.commitmentCard, { backgroundColor: colors.warmGray }]}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="calendar" size={20} color={colors.provenGreen} />
                  </View>
                  <View>
                    <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Duration</Text>
                    <Text style={[styles.cardValue, { color: colors.textPrimary }]}>{getTimeline()}</Text>
                  </View>
                </View>
                <View style={[styles.commitmentCard, { backgroundColor: colors.warmGray }]}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="camera" size={20} color={colors.provenGreen} />
                  </View>
                  <View>
                    <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Proofs</Text>
                    <Text style={[styles.cardValue, { color: colors.textPrimary }]}>{completedDays.length} submitted</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : isActiveChallenge ? (
            // --- POST-JOIN EXECUTION CONTENT ---
            <>
              {executionState?.isSubmittedToday ? (
                // --- POST-SUBMISSION STATES ---
                <PostSubmissionState
                  status={executionState.todayStatus}
                  stakeAmount={challenge.stakeAmount || 0}
                  totalDays={executionState.totalDays}
                  ruleDescription={primaryRule}
                  dayNumber={executionState.dayNumber}
                  transactionSignature={todayPayoutSignature}
                  hasWallet={userHasWallet}
                  onSaveWallet={async (address) => {
                    await updateUserProfile({ walletAddress: address });
                    setUserHasWallet(true);
                  }}
                />
              ) : (
                // --- PENDING STATE: Before proof submission ---
                <>
                  {/* Today's Requirement */}
                  <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{"Today's Requirement"}</Text>
                    <View style={{ gap: spacing.md }}>
                      <View style={styles.reqItem}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.provenGreen} />
                        <Text style={[styles.reqText, { color: colors.textPrimary }]}>{primaryRule}</Text>
                      </View>
                      <View style={styles.reqItem}>
                        <Ionicons name="time" size={24} color={colors.warning} />
                        <Text style={[styles.reqText, { color: colors.textPrimary }]}>Submit proof before 11:59 PM IST</Text>
                      </View>
                    </View>
                  </View>

                  {/* Submission Details */}
                  <View style={styles.sectionContainer}>
                    <View style={{ paddingVertical: spacing.sm }}>
                      <Text style={[styles.glanceTitle, { color: colors.textSecondary }]}>Submission details</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                        <Text style={[styles.glanceText, { color: colors.textPrimary }]}>Proof required: Photo via Camera</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {/* Collapsible Inline Rules */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}
                    onPress={() => setShowFullRules(!showFullRules)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>View Full Rules</Text>
                    <Ionicons name={showFullRules ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
                  </TouchableOpacity>

                  {showFullRules && (
                    <View style={{ marginTop: spacing.md, paddingBottom: spacing.lg }}>
                      <View style={styles.rulesContainer}>
                        {challengeRules.map((rule, index) => (
                          <View key={index} style={styles.ruleItem}>
                            <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                            <Text style={[styles.ruleText, { color: colors.textSecondary }]}>{rule}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          ) : (
            // --- PRE-JOIN DISCOVERY CONTENT (Existing) ---
            <>
              {/* 2. Commitment Summary */}
              <View style={styles.sectionContainer}>
                <View style={styles.commitmentGrid}>
                  {/* Duration Card */}
                  <View style={[styles.commitmentCard, { backgroundColor: colors.warmGray }]}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="calendar" size={20} color={colors.provenGreen} />
                    </View>
                    <View>
                      <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Duration</Text>
                      <Text style={[styles.cardValue, { color: colors.textPrimary }]}>{getTimeline()}</Text>
                      <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>
                        {challenge.startDate && challenge.endDate
                          ? `${formatDate(challenge.startDate)} - ${formatDate(challenge.endDate)}`
                          : 'Dates TBD'}
                      </Text>
                    </View>
                  </View>

                  {/* Stake Card */}
                  <View style={[styles.commitmentCard, { backgroundColor: colors.warmGray }]}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="wallet" size={20} color={colors.provenGreen} />
                    </View>
                    <View>
                      <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Stake</Text>
                      <Text style={[styles.cardValue, { color: colors.textPrimary }]}>${challenge.stakeAmount}</Text>
                      <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>Refunded as you complete days</Text>
                    </View>
                  </View>

                  {/* Loss Framing Card (Full Width) */}
                  <View style={styles.lossCard}>
                    <View style={styles.lossIconCircle}>
                      <Ionicons name="alert-circle" size={20} color="#D32F2F" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lossTitle}>No proof = No payout</Text>
                      <Text style={styles.lossText}>{"If you miss a day, you don't get paid for that day."}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* 3. How This Challenge Works */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>How This Works</Text>
                <View style={styles.stepsContainer}>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.warmGray, borderColor: colors.border }]}><Text style={[styles.stepNumberText, { color: colors.textSecondary }]}>1</Text></View>
                    <Text style={[styles.stepText, { color: colors.textPrimary }]}>Lock your stake to join</Text>
                  </View>
                  <View style={[styles.stepConnector, { backgroundColor: colors.border }]} />
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.warmGray, borderColor: colors.border }]}><Text style={[styles.stepNumberText, { color: colors.textSecondary }]}>2</Text></View>
                    <Text style={[styles.stepText, { color: colors.textPrimary }]}>Complete the habit daily</Text>
                  </View>
                  <View style={[styles.stepConnector, { backgroundColor: colors.border }]} />
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.warmGray, borderColor: colors.border }]}><Text style={[styles.stepNumberText, { color: colors.textSecondary }]}>3</Text></View>
                    <Text style={[styles.stepText, { color: colors.textPrimary }]}>Upload proof within 24 hours</Text>
                  </View>
                  <View style={[styles.stepConnector, { backgroundColor: colors.border }]} />
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.provenGreen }]}>
                      <Ionicons name="checkmark" size={14} color="white" />
                    </View>
                    <Text style={[styles.stepText, { fontWeight: '700', color: colors.provenGreen }]}>
                      Get paid for that day
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* 4. Proof Requirements */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proof Requirements</Text>
                <View style={[styles.proofCard, { backgroundColor: colors.warmGray, borderColor: colors.border }]}>
                  <View style={styles.proofItem}>
                    <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
                    <Text style={[styles.proofText, { color: colors.textPrimary }]}>Photo or Video evidence required</Text>
                  </View>
                  <View style={styles.proofItem}>
                    <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                    <Text style={[styles.proofText, { color: colors.textPrimary }]}>Submit by midnight IST</Text>
                  </View>
                  <View style={[styles.proofLockedItem, { borderTopColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.proofLockedText, { color: colors.textMuted }]}>Content is private — only proof is verified</Text>
                  </View>
                </View>
              </View>

              {/* 5. Rules & Constraints */}
              <View style={styles.sectionContainer}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rules</Text>
                <View style={styles.rulesContainer}>
                  {challenge.rules && challenge.rules.length > 0 ? (
                    challenge.rules.map((rule, index) => (
                      <View key={index} style={styles.ruleItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.ruleText, { color: colors.textSecondary }]}>{rule}</Text>
                      </View>
                    ))
                  ) : (
                    <>
                      <View style={styles.ruleItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.ruleText, { color: colors.textSecondary }]}>Minimum 30 minutes of activity</Text>
                      </View>
                      <View style={styles.ruleItem}>
                        <Ionicons name="checkmark-circle-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.ruleText, { color: colors.textSecondary }]}>No rest days allowed</Text>
                      </View>
                      <View style={styles.ruleItem}>
                        <Ionicons name="alert-circle-outline" size={20} color={colors.textMuted} />
                        <Text style={[styles.ruleText, { color: colors.textSecondary }]}>Missed days result in no payout for that day</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView >

      {/* 6. Call to Action */}
      <ChallengeDetailCTA
        isSubmittedToday={Boolean(executionState?.isSubmittedToday)}
        todayStatus={executionState?.todayStatus}
        isActiveChallenge={isActiveChallenge}
        isChallengeCompleted={isChallengeCompleted || isUserChallengeDone}
        swipeKey={swipeKey}
        insets={insets}
        onSwipeJoin={handleJoinChallenge}
        onSwipeProve={handleProveChallenge}
      />
      <ProveModal
        visible={showProveModal}
        onClose={handleModalClose}
        onCameraPress={handleCameraPress}
        challenge={challenge}
        completedDays={completedDays}
        proofImages={proofImagesByDay}
        calendarDays={calendarDays}
        challengeTimezone={challengeTimezone}
        todaySubmitted={Boolean(executionState?.isSubmittedToday)}
        isSubmitting={submittingProof}
      />

      {/* Stake Payment Modal - QR Code / Address */}
      <StakePaymentModal
        visible={solanaPayModalVisible}
        onClose={() => {
          setSolanaPayModalVisible(false);
          setSwipeKey((prev) => prev + 1);
        }}
        onSuccess={handleStakeSuccess}
        challengeId={challenge?.id || ''}
        challengeTitle={challenge?.title || ''}
        stakeAmount={challenge?.stakeAmount || 0}
      />
    </GestureHandlerRootView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.heading3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  backLink: {
    ...typography.body,
    color: colors.provenGreen,
  },

  // Hero Section
  imageSection: {
    height: SCREEN_HEIGHT * 0.45,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  imageStatusPill: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 10,
  },
  headerOverlay: {
    position: 'absolute',
    bottom: spacing.xl + 24,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 5,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  categoryIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.provenGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: spacing.xs,
  },

  // Social Proof Stats
  socialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Content Card
  contentCard: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    marginTop: -32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },

  // Shared Section Styles
  sectionContainer: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },

  // Commitment Summary
  commitmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  commitmentCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.warmGray,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  fullWidthCard: {
    minWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Loss Framing Card
  lossCard: {
    minWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5', // Light red background
    borderWidth: 1,
    borderColor: '#FFCDD2',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  lossIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lossTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F', // Deep red
  },
  lossText: {
    fontSize: 13,
    color: '#B71C1C',
    marginTop: 2,
  },

  highlightCard: {
    backgroundColor: '#2D1810', // Dark background for emphasis
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  highlightIconCircle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  highlightText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  highlightSubtext: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontSize: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  cardLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // How It Works
  stepsContainer: {
    gap: 0,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 4,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warmGray,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepNumberFinal: {
    backgroundColor: colors.provenGreen,
    borderColor: colors.provenGreen,
    transform: [{ scale: 1.1 }], // Subtle pop
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stepText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  stepTextFinal: {
    fontWeight: '800', // Bolder
    color: colors.provenGreen,
    fontSize: 16, // Slightly larger
  },
  stepConnector: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 11.5, // Center align with step number width (24/2 - 0.5)
    marginVertical: 2,
  },

  // Proof Requirements
  proofCard: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  proofItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  proofText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  proofLockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  proofLockedText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Rules
  rulesContainer: {
    gap: spacing.md,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  ruleText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  // Bottom CTA
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm, // Reduced top padding to fit text
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reassuranceText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },

  // Execution Mode Styles
  executionStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dayProgressText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.9,
  },
  executionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  stakeRiskText: {
    color: colors.warning,
    fontWeight: '700',
    fontSize: 14,
  },
  reqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reqText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.provenDark,
  },

  // Today at a Glance
  glanceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  glanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  glanceText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  dayProgressTextSuccess: {
    color: '#4B8F50', // Muted green
    fontWeight: '700',
  },
});
