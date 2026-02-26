/**
 * Challenge Timeline Utilities
 *
 * Helper functions for working with challenge timelines (start/end dates)
 */

/**
 * Challenge status type
 */
export type ChallengeStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';

/**
 * Calculate the duration of a challenge in days
 */
export const calculateChallengeDuration = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Check if a challenge is currently active based on timeline
 */
export const isChallengeActive = (startDate: Date, endDate: Date): boolean => {
  const now = new Date();
  return now >= startDate && now <= endDate;
};

/**
 * Check if a challenge is upcoming (hasn't started yet)
 */
export const isChallengeUpcoming = (startDate: Date): boolean => {
  const now = new Date();
  return now < startDate;
};

/**
 * Check if a challenge has ended
 */
export const isChallengeEnded = (endDate: Date): boolean => {
  const now = new Date();
  return now > endDate;
};

/**
 * Get challenge status based on timeline
 */
export const getChallengeStatus = (startDate: Date, endDate: Date): ChallengeStatus => {
  const now = new Date();

  if (now < startDate) {
    return 'UPCOMING';
  } else if (now >= startDate && now <= endDate) {
    return 'ACTIVE';
  } else {
    return 'COMPLETED';
  }
};

/**
 * Validate challenge timeline
 */
export const validateChallengeTimeline = (
  startDate: Date,
  endDate: Date
): { valid: boolean; error?: string } => {
  const now = new Date();

  // Start date must be in the future
  if (startDate <= now) {
    return {
      valid: false,
      error: 'Challenge start date must be in the future',
    };
  }

  // End date must be after start date
  if (endDate <= startDate) {
    return {
      valid: false,
      error: 'Challenge end date must be after start date',
    };
  }

  // Minimum duration: 1 day
  const duration = calculateChallengeDuration(startDate, endDate);
  if (duration < 1) {
    return {
      valid: false,
      error: 'Challenge must be at least 1 day long',
    };
  }

  // Maximum duration: 365 days (1 year)
  if (duration > 365) {
    return {
      valid: false,
      error: 'Challenge cannot be longer than 365 days',
    };
  }

  return { valid: true };
};

/**
 * Format challenge timeline for display
 * Example: "Oct 25 - Nov 1 (7 days)"
 */
export const formatChallengeTimeline = (startDate: Date, endDate: Date): string => {
  const duration = calculateChallengeDuration(startDate, endDate);
  const startFormatted = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endFormatted = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startFormatted} - ${endFormatted} (${duration} days)`;
};

/**
 * Get days remaining in a challenge
 */
export const getDaysRemaining = (endDate: Date): number => {
  const now = new Date();
  if (now > endDate) return 0;

  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Get days until challenge starts
 */
export const getDaysUntilStart = (startDate: Date): number => {
  const now = new Date();
  if (now >= startDate) return 0;

  const diffTime = startDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};
