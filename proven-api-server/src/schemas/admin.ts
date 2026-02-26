import { z } from 'zod';

// Challenge schemas
export const UpdateChallengeSchema = z.object({
  status: z.enum(['PAUSED', 'ACTIVE', 'ENDED']).optional(),
  endDate: z.string().datetime().optional(),
});

export const PauseChallengeSchema = z.object({
  pause: z.boolean(), // true = pause, false = resume
});

export const EndChallengeSchema = z.object({
  reason: z.string().optional(), // Optional reason for ending early
});

export const CreateChallengeSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  category: z.enum([
    'health', 'fitness', 'wellness', 'learning', 'productivity', 'finance', 'creativity',
    'HEALTH', 'FITNESS', 'WELLNESS', 'LEARNING', 'PRODUCTIVITY', 'FINANCE', 'CREATIVITY'
  ]),
  duration: z.number().int().min(1).max(365),
  stakeAmount: z.number().positive(),
  startDate: z.string(), // ISO date string
  proofType: z.enum(['image', 'video', 'both']).optional().default('image'),
  image: z.string().url().optional(),
});

// Proof schemas
export const RejectProofSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
  category: z.enum([
    'unclear',
    'unrelated',
    'timestamp',
    'duplicate',
    'incomplete',
    'other',
  ]),
});

// User schemas
export const FlagUserSchema = z.object({
  reason: z.string().min(1, 'Flag reason is required'),
});

export const BlockUserSchema = z.object({
  block: z.boolean(),
});

// Dispute schemas
export const ResolveDisputeSchema = z.object({
  resolution: z.enum(['approved', 'upheld']), // approved = reverse decision, upheld = keep original
  notes: z.string().optional(),
});

// Settings schemas
export const UpdateSettingsSchema = z.object({
  proofCutoffTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)').optional(),
  reviewWindowHours: z.number().int().min(1).max(168).optional(),
  maxProofsPerDay: z.number().int().min(1).max(10).optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  emergencyPause: z.boolean().optional(),
});

// Query parameter schemas
export const PaginationSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
});

export const ProofsQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'all']).default('PENDING'),
  challengeId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const ChallengesQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  status: z.enum(['active', 'upcoming', 'completed', 'all']).default('all'),
  search: z.string().optional(),
});

export const UsersQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  flagged: z.string().transform((v) => v === 'true').optional(),
  blocked: z.string().transform((v) => v === 'true').optional(),
  search: z.string().optional(),
});

export const DisputesQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  status: z.enum(['PENDING', 'RESOLVED', 'all']).default('all'),
});

export const AuditLogsQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('50'),
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
  search: z.string().optional(),
});

// Type exports
export type UpdateChallengeInput = z.infer<typeof UpdateChallengeSchema>;
export type RejectProofInput = z.infer<typeof RejectProofSchema>;
export type FlagUserInput = z.infer<typeof FlagUserSchema>;
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
