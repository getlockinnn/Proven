import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';
import { escrowService } from '../../services/escrowService';
import { DAY_MS, getChallengeTimeZone, parseDateInputInTimeZone } from '../../utils/timeUtils';

/**
 * Create a new challenge (admin)
 * @route POST /api/admin/challenges
 * @access Private (Admin only)
 */
export const createChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const {
            title,
            description,
            category,
            duration,
            stakeAmount,
            startDate,
            proofType,
            image,
        } = req.body;

        const normalizedCategory = typeof category === 'string' && category.trim()
            ? category.trim()
            : 'challenge';
        const normalizedProofType = typeof proofType === 'string'
            ? proofType.trim().toLowerCase()
            : 'image';
        const durationDays = typeof duration === 'number' ? duration : Number(duration);

        const proofLabel =
            normalizedProofType === 'video'
                ? 'video'
                : normalizedProofType === 'both'
                    ? 'photo or video'
                    : 'photo';

        if (!Number.isFinite(durationDays) || durationDays <= 0) {
            res.status(400).json({
                success: false,
                message: 'Duration must be a positive number of days',
            });
            return;
        }

        if (typeof startDate !== 'string' || !startDate.trim()) {
            res.status(400).json({
                success: false,
                message: 'Start date is required',
            });
            return;
        }

        const generatedRules = [
            `Complete your ${normalizedCategory.toLowerCase()} task for today.`,
            `Submit ${proofLabel} proof before 11:59 PM local time.`,
            'Missed days are not eligible for payout.',
        ];

        const challengeTimeZone = getChallengeTimeZone();
        const start = parseDateInputInTimeZone(startDate, challengeTimeZone);
        const end = new Date(start.getTime() + durationDays * DAY_MS);

        // Create the challenge
        const challenge = await prisma.challenge.create({
            data: {
                title,
                description: description || null,
                difficulty: 'MODERATE', // Default difficulty
                stakeAmount: parseFloat(stakeAmount),
                startDate: start,
                endDate: end,
                image: image || '/placeholder-challenge.png',
                creatorId: req.user?.id || '',
                hostType: 'CORPORATE',
                verificationType: proofType || 'image',
                metrics: category, // Store the actual category
                rules: generatedRules,
                trackingMetrics: [normalizedCategory],
            },
        });

        // Create escrow wallet for this challenge
        let escrowAddress: string | null = null;
        try {
            const escrowWallet = await escrowService.createEscrowWallet(challenge.id);
            escrowAddress = escrowWallet.publicKey;
            console.log(`✅ Escrow wallet created for challenge ${challenge.id}: ${escrowAddress}`);
        } catch (escrowError: any) {
            // Log the FULL error so we know what's wrong
            console.error('❌ Failed to create escrow wallet:', escrowError.message || escrowError);
            console.error('Full error:', escrowError);
            
            // Check for common issues
            if (escrowError.message?.includes('ESCROW_ENCRYPTION_KEY')) {
                console.error('⚠️  ESCROW_ENCRYPTION_KEY environment variable is not set!');
                console.error('    Generate one with: openssl rand -base64 32');
            }
            
            // Don't silently fail - the challenge won't work without escrow
            // But we'll still create it so it can be fixed later
        }

        // Log admin action
        await logAdminAction({
            action: AuditActions.CHALLENGE_CREATED || 'CHALLENGE_CREATED',
            actor: req.user?.email || 'unknown',
            actorId: req.user?.id,
            target: challenge.id,
            details: `Created challenge "${title}" starting ${start.toLocaleDateString()}${escrowAddress ? ` with escrow ${escrowAddress}` : ''}`,
            type: 'SUCCESS',
            metadata: {
                challengeId: challenge.id,
                title,
                duration: durationDays,
                stakeAmount,
                escrowAddress,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Challenge created successfully',
            data: {
                id: challenge.id,
                title: challenge.title,
                description: challenge.description,
                category: challenge.difficulty,
                duration: durationDays,
                stakeAmount: challenge.stakeAmount,
                startDate: challenge.startDate.toISOString(),
                endDate: challenge.endDate.toISOString(),
                status: 'upcoming',
                participants: 0,
                poolSize: 0,
                image: challenge.image,
                escrowAddress,
            },
        });
    } catch (error: any) {
        console.error('Error creating challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create challenge',
            error: process.env.NODE_ENV === 'development' ? error : undefined,
        });
    }
};
