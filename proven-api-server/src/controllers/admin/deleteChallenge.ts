import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';

/**
 * Delete a challenge and all related data (admin)
 * @route DELETE /api/admin/challenges/:id
 * @access Private (Admin only)
 * 
 * Deletes in order:
 * 1. EscrowWallet
 * 2. Disputes (linked to submissions)
 * 3. Submissions
 * 4. Transactions
 * 5. UserChallenges
 * 6. Challenge
 */
export const deleteChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
        // First, fetch the challenge to confirm it exists and get details for audit
        const challenge = await prisma.challenge.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        userChallenges: true,
                        submissions: true,
                        transactions: true,
                    },
                },
                escrowWallet: true,
            },
        });

        if (!challenge) {
            res.status(404).json({
                success: false,
                message: 'Challenge not found',
            });
            return;
        }

        // Store info for audit log before deletion
        const challengeInfo = {
            id: challenge.id,
            title: challenge.title,
            participants: challenge._count.userChallenges,
            submissions: challenge._count.submissions,
            transactions: challenge._count.transactions,
            hadEscrow: !!challenge.escrowWallet,
            escrowAddress: challenge.escrowAddress,
        };

        // Use a transaction to ensure all deletes succeed or none do
        await prisma.$transaction(async (tx) => {
            // 1. Delete EscrowWallet (if exists)
            if (challenge.escrowWallet) {
                await tx.escrowWallet.delete({
                    where: { challengeId: id },
                });
            }

            // 2. Delete Disputes linked to submissions of this challenge
            await tx.dispute.deleteMany({
                where: {
                    submission: {
                        challengeId: id,
                    },
                },
            });

            // 3. Delete Submissions
            await tx.submission.deleteMany({
                where: { challengeId: id },
            });

            // 4. Delete Transactions
            await tx.transaction.deleteMany({
                where: { challengeId: id },
            });

            // 5. Delete UserChallenges
            await tx.userChallenge.deleteMany({
                where: { challengeId: id },
            });

            // 6. Delete the Challenge itself
            await tx.challenge.delete({
                where: { id },
            });
        });

        // Log admin action
        await logAdminAction({
            action: AuditActions.CHALLENGE_DELETED || 'challenge_deleted',
            actor: req.user?.email || 'unknown',
            actorId: req.user?.id,
            target: id,
            details: `Deleted challenge "${challengeInfo.title}" with ${challengeInfo.participants} participants, ${challengeInfo.submissions} submissions${challengeInfo.hadEscrow ? `, escrow ${challengeInfo.escrowAddress}` : ''}`,
            type: 'DESTRUCTIVE',
            metadata: challengeInfo,
        });

        res.json({
            success: true,
            message: 'Challenge deleted successfully',
            data: {
                id: challengeInfo.id,
                title: challengeInfo.title,
                deletedRecords: {
                    escrowWallet: challengeInfo.hadEscrow ? 1 : 0,
                    userChallenges: challengeInfo.participants,
                    submissions: challengeInfo.submissions,
                    transactions: challengeInfo.transactions,
                },
            },
        });
    } catch (error) {
        console.error('Error deleting challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete challenge',
            error: process.env.NODE_ENV === 'development' ? error : undefined,
        });
    }
};
