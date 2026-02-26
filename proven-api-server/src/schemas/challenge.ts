import { z } from 'zod';
import { validateChallengeTimeline, calculateChallengeDuration } from '../utils/challengeTimeline';

export const CreateChallengeSchema = z.object({
  title: z.string().min(1, "Challenge title is required"),
  type: z.string(),
  hostType: z.enum(['PERSONAL', 'FRIEND', 'CORPORATE']).default('PERSONAL'),
  sponsor: z.string().optional(),
  duration: z.string().optional(), // Now optional, calculated from dates
  difficulty: z.string(),
  userStake: z.number().positive("Stake amount must be positive"),
  totalPrizePool: z.number().positive("Prize pool must be positive"),
  participants: z.number().int().nonnegative().default(0),
  metrics: z.string(),
  trackingMetrics: z.array(z.string()).default([]),
  image: z.string().url("Valid image URL is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  rules: z.array(z.string()).min(1, "At least one rule is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  verificationType: z.string().optional(),
  // Escrow wallet address (will hold stakes for this challenge)
  escrowAddress: z.string().optional(),
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  // Use the timeline validation utility
  const validation = validateChallengeTimeline(startDate, endDate);
  return validation.valid;
}, {
  message: "Invalid challenge timeline. Start date must be in the future and end date must be after start date (1-365 days duration).",
  path: ["startDate", "endDate"]
});

export type CreateChallengeInput = z.infer<typeof CreateChallengeSchema>; 

export const JoinChallengeBodySchema = z.object({
  challengeId: z.string().uuid(),
  // New flow: either legacy stakeAmount OR quote-based join with signature
  stakeAmount: z.number().positive().max(100000).optional(),
  quoteId: z.string().optional(),
  signature: z.string().optional(),
  walletAddress: z.string().optional(),
});

export const JoinChallengeSchema = { body: JoinChallengeBodySchema } as const;
