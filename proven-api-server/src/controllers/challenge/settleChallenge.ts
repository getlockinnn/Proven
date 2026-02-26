import { Request, Response } from 'express';
import { ChallengeStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { updateAllChallengeStatuses } from '../../services/challengeCompletionService';
import { solanaProgram } from '../../services/solanaProgram';
import { PublicKey } from '@solana/web3.js';

interface SettleChallengeRequest {
  challengeId: string;
}

export const settleChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.body as SettleChallengeRequest;

    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: 'Challenge ID is required',
      });
      return;
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        userChallenges: true,
      },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
      });
      return;
    }

    const now = new Date();
    if (challenge.endDate > now) {
      res.status(400).json({
        success: false,
        message: 'Challenge has not ended yet',
      });
      return;
    }

    const statusUpdate = await updateAllChallengeStatuses(challengeId);

    const refreshedChallenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        userChallenges: true,
      },
    });

    if (!refreshedChallenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found after update',
      });
      return;
    }

    const winners = refreshedChallenge.userChallenges.filter(
      (uc) => uc.status === ChallengeStatus.COMPLETED,
    );
    const losers = refreshedChallenge.userChallenges.filter(
      (uc) => uc.status === ChallengeStatus.FAILED,
    );
    const active = refreshedChallenge.userChallenges.filter(
      (uc) => uc.status === ChallengeStatus.ACTIVE,
    );

    logger.info(`Challenge ${challengeId} settlement summary`, {
      challengeId,
      winners: winners.length,
      losers: losers.length,
      active: active.length,
      updated: statusUpdate,
    });

    // On-chain settlement flow (if challenge is on-chain)
    let onChainSettlement = {
      settleChallengeTx: null as string | null,
      settleParticipantTxs: [] as { userId: string; tx: string }[],
      finalizeSettlementTx: null as string | null,
      errors: [] as string[],
    };

    if (refreshedChallenge.blockchainId) {
      try {
        const oracleKey = solanaProgram.getOraclePublicKey();
        if (oracleKey) {
          const onChainChallengeId = refreshedChallenge.id.slice(0, 32);

          // Phase 1: Settle the challenge (mark as ended)
          try {
            onChainSettlement.settleChallengeTx = await solanaProgram.settleChallenge(onChainChallengeId);
            logger.info(`On-chain settle_challenge tx: ${onChainSettlement.settleChallengeTx}`);
          } catch (e: any) {
            onChainSettlement.errors.push(`settle_challenge: ${e.message}`);
            logger.warn(`Failed to settle challenge on-chain: ${e.message}`);
          }

          // Phase 2: Settle each participant (determine winner/loser)
          const userChallengesWithWallets = await prisma.userChallenge.findMany({
            where: { challengeId },
            include: {
              user: {
                select: {
                  id: true,
                  walletAddress: true,
                },
              },
            },
          });

          for (const uc of userChallengesWithWallets) {
            if (uc.user.walletAddress) {
              try {
                const userPubkey = new PublicKey(uc.user.walletAddress);
                const tx = await solanaProgram.settleParticipant(onChainChallengeId, userPubkey);
                onChainSettlement.settleParticipantTxs.push({ userId: uc.user.id, tx });
                logger.info(`On-chain settle_participant for ${uc.user.id}: ${tx}`);
              } catch (e: any) {
                onChainSettlement.errors.push(`settle_participant(${uc.user.id}): ${e.message}`);
                logger.warn(`Failed to settle participant ${uc.user.id} on-chain: ${e.message}`);
              }
            }
          }

          // Phase 3: Finalize settlement (calculate payouts)
          try {
            onChainSettlement.finalizeSettlementTx = await solanaProgram.finalizeSettlement(onChainChallengeId);
            logger.info(`On-chain finalize_settlement tx: ${onChainSettlement.finalizeSettlementTx}`);
          } catch (e: any) {
            onChainSettlement.errors.push(`finalize_settlement: ${e.message}`);
            logger.warn(`Failed to finalize settlement on-chain: ${e.message}`);
          }
        }
      } catch (onChainError: any) {
        logger.error(`On-chain settlement flow error: ${onChainError.message}`);
        onChainSettlement.errors.push(`flow: ${onChainError.message}`);
      }
    }

    res.json({
      success: true,
      message: 'Challenge settlement completed',
      data: {
        challengeId,
        winners: winners.length,
        losers: losers.length,
        active: active.length,
        statusUpdate,
        onChain: refreshedChallenge.blockchainId ? onChainSettlement : null,
      },
    });

  } catch (error) {
    logger.error('Error settling challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
