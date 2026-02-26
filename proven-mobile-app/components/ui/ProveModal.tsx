import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { Challenge } from '../../services/challengeService';
import { CalendarDay } from '../../services/proofService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


// Map of day number to proof image URI
export type ProofImages = { [day: number]: string };

interface ProveModalProps {
  visible: boolean;
  onClose: () => void;
  onCameraPress: () => void;
  challenge: Challenge;
  completedDays?: number[]; // Array of day numbers that are completed
  proofImages?: ProofImages; // Map of day to image URI
  calendarDays?: CalendarDay[];
  challengeTimezone?: string;
  todaySubmitted?: boolean; // Whether today's proof has been submitted
  isSubmitting?: boolean; // Whether proof is currently being uploaded
}

export function ProveModal({
  visible,
  onClose,
  onCameraPress,
  challenge,
  completedDays = [],
  proofImages = {},
  calendarDays = [],
  challengeTimezone = 'Asia/Kolkata',
  todaySubmitted = false,
  isSubmitting = false,
}: ProveModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Calculate time remaining until midnight
  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date();
      const dayRange = getDayRangeUtc(now, challengeTimezone);
      const midnight = new Date(dayRange.endUtc.getTime() - 1);

      const diffMs = midnight.getTime() - now.getTime();
      if (diffMs <= 0) {
        setTimeRemaining('0m');
        return;
      }

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else {
        setTimeRemaining(`${minutes}m`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [visible, challengeTimezone]);

  // Calculate calendar data based on challenge timeline
  const calendarData = useMemo(() => {
    const startDate = new Date(challenge.startDate);
    const endDate = new Date(challenge.endDate);
    const today = new Date();
    const calendarByDate = new Map<string, CalendarDay>();
    for (const day of calendarDays) {
      calendarByDate.set(day.date, day);
    }

    // Get current month and year (using start date's month for display)
    const displayDate = today > startDate ? today : startDate;
    const month = displayDate.getMonth();
    const year = displayDate.getFullYear();

    // Get first day of month and total days
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Get starting day of week (0 = Sunday, we want Monday = 0)
    let startingDay = firstDayOfMonth.getDay() - 1;
    if (startingDay === -1) startingDay = 6; // Sunday becomes 6

    const hasServerCalendar = calendarDays.length > 0;

    // Generate calendar days
    const days: {
      day: number | null;
      isCompleted: boolean;
      isToday: boolean;
      isMissed: boolean;
      isFuture: boolean;
      isInChallenge: boolean;
      proofImage?: string;
    }[] = [];

    // Add empty slots for days before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push({ day: null, isCompleted: false, isToday: false, isMissed: false, isFuture: false, isInChallenge: false });
    }

    // Add days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(year, month, d);
      const dateKey = getDateKey(currentDate);
      const calendarEntry = calendarByDate.get(dateKey);
      const isToday = calendarEntry ? calendarEntry.isToday : currentDate.toDateString() === today.toDateString();
      const isInChallenge = calendarEntry
        ? true
        : currentDate >= startDate && currentDate < endDate;
      const isCompleted = calendarEntry
        ? calendarEntry.status === 'submitted' || calendarEntry.status === 'approved' || calendarEntry.status === 'rejected'
        : completedDays.includes(d);

      // Rough missed check: In challenge, past, not completed, not today. 
      // Note: This relies on simple day numbers. Real app uses full dates.
      // Assuming 'today' is correct relative to the month view.
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isPast = currentDate < todayDate;
      const isFuture = calendarEntry ? calendarEntry.isFuture : currentDate > todayDate;
      const isMissed = calendarEntry
        ? calendarEntry.status === 'not_submitted' && calendarEntry.isPast
        : isInChallenge && isPast && !isCompleted;
      const proofImage = calendarEntry
        ? (calendarEntry.isFuture || calendarEntry.status === 'locked'
          ? undefined
          : calendarEntry.submission?.imageUrl || undefined)
        : (hasServerCalendar ? undefined : proofImages[d]);

      days.push({ day: d, isCompleted, isToday, isMissed, isFuture, isInChallenge, proofImage });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return {
      monthName: monthNames[month],
      year,
      days,
    };
  }, [challenge, completedDays, proofImages, calendarDays]);

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(300).easing(Easing.out(Easing.ease))}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <Pressable style={styles.overlayPress} onPress={isSubmitting ? undefined : onClose} />

        <Animated.View
          entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(250).easing(Easing.in(Easing.ease))}
          style={[styles.modalContent, { backgroundColor: colors.cardBackground, paddingBottom: Math.max(insets.bottom, spacing.xl) }, shadows.lg]}
        >
          {/* close button - top right corner */}
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: colors.warmGray }]}
            onPress={onClose}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Urgency Header */}
          <View style={styles.urgencyHeader}>
            <Text style={[styles.todayStatusText, { color: colors.textPrimary }]}>
              Today:{' '}
              {todaySubmitted ? (
                <Text style={{ color: colors.success }}>Submitted</Text>
              ) : (
                <Text style={{ color: colors.error }}>Not submitted</Text>
              )}
            </Text>
            {!todaySubmitted && timeRemaining && (
              <Text style={[styles.deadlineText, { color: colors.textMuted }]}>Deadline in {timeRemaining}</Text>
            )}
          </View>

          {/* calendar header */}
          <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
            {calendarData.monthName} {calendarData.year}
          </Text>

          {/* week day headers */}
          <View style={styles.weekDaysRow}>
            {weekDays.map((day, index) => (
              <View key={index} style={styles.weekDayCell}>
                <Text style={[styles.weekDayText, { color: colors.textMuted }]}>{day}</Text>
              </View>
            ))}
          </View>

          {/* calendar grid */}
          <View style={styles.calendarGrid}>
            {calendarData.days.map((dayData, index) => (
              <View key={index} style={styles.dayCell}>
                {dayData.day !== null ? (() => {
                  const shouldShowProofImage = Boolean(
                    dayData.proofImage &&
                    !dayData.isFuture &&
                    dayData.isInChallenge
                  );

                  return (
                  <View style={[
                    styles.dayCircle,
                    dayData.isToday && [styles.dayCircleToday, { borderColor: colors.textPrimary, backgroundColor: colors.cardBackground }],
                    dayData.isCompleted && !shouldShowProofImage && { backgroundColor: colors.provenGreen },
                    dayData.isMissed && styles.dayCircleMissed,
                  ]}>
                    {shouldShowProofImage ? (
                      // show proof image as background
                      <View style={styles.proofImageContainer}>
                        <Image
                          source={{ uri: dayData.proofImage }}
                          style={styles.proofImage}
                          contentFit="cover"
                          transition={200}
                          cachePolicy="disk"
                        />
                        <View style={styles.proofImageOverlay}>
                          <Text style={styles.dayTextOnImage}>{dayData.day}</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={[
                        styles.dayText,
                        { color: colors.textPrimary },
                        dayData.isToday && styles.dayTextToday,
                        dayData.isCompleted && { color: colors.cardBackground, fontWeight: '600' },
                        dayData.isMissed && { color: colors.error },
                        (dayData.isFuture || (!dayData.isInChallenge && !dayData.isMissed)) && { color: colors.textMuted, opacity: 0.3 },
                      ]}>
                        {dayData.day}
                      </Text>
                    )}
                  </View>
                  );
                })() : null}
              </View>
            ))}
          </View>

          {/* Camera Button - Bottom Center */}
          <View style={styles.cameraButtonContainer}>
            {isSubmitting ? (
              <>
                <ActivityIndicator size="large" color={colors.provenGreen} />
                <Text style={[styles.ctaLabel, { color: colors.textPrimary, marginTop: spacing.md }]}>
                  Uploading proof...
                </Text>
                <Text style={[styles.consequenceText, { color: colors.textMuted }]}>
                  Please wait while we submit your proof.
                </Text>
              </>
            ) : todaySubmitted ? (
              <>
                <View style={[styles.cameraButton, { backgroundColor: colors.success }, shadows.md]}>
                  <Ionicons name="checkmark" size={28} color={colors.cardBackground} />
                </View>
                <Text style={[styles.ctaLabel, { color: colors.textPrimary }]}>Proof already submitted</Text>
                <Text style={[styles.consequenceText, { color: colors.textMuted }]}>{"Great job. We'll review it soon."}</Text>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.cameraButton, { backgroundColor: colors.provenGreen }, shadows.md]}
                  onPress={onCameraPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={28} color={colors.cardBackground} />
                </TouchableOpacity>
                <Text style={[styles.ctaLabel, { color: colors.textPrimary }]}>{"Submit today's proof"}</Text>
                <Text style={[styles.consequenceText, { color: colors.textMuted }]}>Submissions close at midnight {challengeTimezone}.</Text>
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  overlayPress: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    height: '90%',
    width: '100%',
  },
  monthTitle: {
    fontSize: 28,
    marginTop: spacing.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  weekDayCell: {
    width: '14.28%',
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 18,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    marginTop: spacing.sm,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCircleToday: {
    borderWidth: 2,
  },
  dayCircleMissed: {
    borderWidth: 1,
    borderColor: '#EF9A9A', // Faded red outline
    backgroundColor: '#FFEBEE', // Very light red bg
  },
  proofImageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
  },
  proofImage: {
    width: '100%',
    height: '100%',
  },
  proofImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayTextOnImage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '400',
  },
  dayTextToday: {
    fontWeight: '700',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  cameraButtonContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  cameraButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  urgencyHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  todayStatusText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  deadlineText: {
    fontSize: 14,
    fontWeight: '500',
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  consequenceText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
