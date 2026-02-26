import { z } from 'zod';

export const SubmitProofSchema = z.object({
  userChallengeId: z.string().uuid(),
  imageUrl: z.string().min(1),
  imagePath: z.string().optional(),
  description: z.string().max(500).optional(),
  tz: z.string().min(1).optional(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  offsetMinutes: z.number().int().min(-840).max(840).optional(),
});

export const ReviewSubmissionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComments: z.string().max(500).optional(),
});

export const CreateSignedUploadSchema = z.object({
  challengeId: z.string().uuid(),
  contentType: z.string().min(1), // e.g. image/png
});

export const CreateProofProxyUploadSchema = z.object({
  challengeId: z.string().uuid(),
  contentType: z.string().min(1), // e.g. image/png
  imageBase64: z.string().min(1),
});
