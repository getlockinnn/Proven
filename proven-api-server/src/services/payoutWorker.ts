import cron from 'node-cron';
import { TransactionType, TransactionStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { createServiceLogger } from '../lib/logger';
import { escrowService } from './escrowService';
import { getQueuedJobs, markProcessing, markCompleted, markFailed } from './payoutQueue';

const logger = createServiceLogger('payout-worker');

export async function processPayoutQueue(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  const jobs = await getQueuedJobs(10);
  if (jobs.length === 0) return { processed, failed };

  logger.info(`Processing ${jobs.length} payout jobs`);

  for (const job of jobs) {
    const lockedJob = await markProcessing(job.id);
    if (!lockedJob) {
      // Already picked up by another worker
      continue;
    }

    try {
      // Resolve wallet address — try job first, then look up from DB
      let wallet = lockedJob.walletAddress || '';
      if (!wallet) {
        const uc = await prisma.userChallenge.findFirst({
          where: { userId: lockedJob.userId, challengeId: lockedJob.challengeId },
          select: { walletAddress: true },
        });
        wallet = uc?.walletAddress || '';

        if (!wallet) {
          const user = await prisma.user.findUnique({
            where: { id: lockedJob.userId },
            select: { walletAddress: true },
          });
          wallet = user?.walletAddress || '';
        }

        // Persist resolved wallet on the job so retries don't re-query
        if (wallet) {
          await prisma.payoutJob.update({
            where: { id: lockedJob.id },
            data: { walletAddress: wallet },
          });
        }
      }

      if (!wallet) {
        throw new Error('No wallet address found on payout job, UserChallenge, or User');
      }

      // For DUST_SWEEP, use treasury address
      const recipientWallet = lockedJob.type === 'DUST_SWEEP'
        ? (process.env.TREASURY_ADDRESS || wallet)
        : wallet;

      // Get challenge escrow address
      const challenge = await prisma.challenge.findUnique({
        where: { id: lockedJob.challengeId },
        select: { escrowAddress: true },
      });

      if (!challenge?.escrowAddress) {
        throw new Error(`Challenge ${lockedJob.challengeId} has no escrow address`);
      }

      // Check escrow balance (throws on RPC error after fix)
      const amountUsdc = lockedJob.amount / 1_000_000;
      const balance = await escrowService.getEscrowBalance(challenge.escrowAddress);
      if (balance < amountUsdc) {
        throw new Error(
          `Insufficient escrow balance: ${balance.toFixed(6)} USDC, need ${amountUsdc.toFixed(6)} USDC`
        );
      }

      // Send payout — escrowService.sendPayout still takes USDC (Float)
      const txSignature = await escrowService.sendPayout(
        lockedJob.challengeId,
        recipientWallet,
        amountUsdc
      );

      // Mark completed
      await markCompleted(lockedJob.id, txSignature);

      // Create Transaction record
      await prisma.transaction.create({
        data: {
          userId: lockedJob.userId,
          challengeId: lockedJob.challengeId,
          transactionType: TransactionType.REWARD,
          amount: amountUsdc,
          description: `${lockedJob.type === 'DAILY_BASE' ? 'Daily payout' : lockedJob.type === 'DAILY_BONUS' ? 'Daily bonus' : 'Dust sweep'} (${amountUsdc.toFixed(6)} USDC) for ${lockedJob.dayDate}`,
          status: TransactionStatus.COMPLETED,
          transactionSignature: txSignature,
          timestamp: new Date(),
          payoutJobId: lockedJob.id,
          metadata: {
            type: lockedJob.type.toLowerCase(),
            dayDate: lockedJob.dayDate,
            amountMicroUsdc: lockedJob.amount,
          },
        },
      });

      logger.info('Payout processed', {
        jobId: lockedJob.id,
        type: lockedJob.type,
        amount: amountUsdc,
        tx: txSignature,
      });

      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await markFailed(lockedJob.id, errorMessage);
      failed++;
      logger.error('Payout failed', {
        jobId: lockedJob.id,
        error: errorMessage,
        attempt: lockedJob.attempts,
      });
    }
  }

  if (processed > 0 || failed > 0) {
    logger.info(`Payout batch complete: ${processed} processed, ${failed} failed`);
  }

  return { processed, failed };
}

let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function startPayoutWorker(): void {
  if (process.env.PAYOUT_WORKER_ENABLED !== 'true') {
    logger.info('Payout worker disabled (set PAYOUT_WORKER_ENABLED=true to enable)');
    return;
  }

  // Every 30 seconds
  cronTask = cron.schedule('*/30 * * * * *', async () => {
    try {
      await processPayoutQueue();
    } catch (err) {
      logger.error('Payout worker error', { error: err instanceof Error ? err.message : String(err) });
    }
  });

  logger.info('Payout worker started (every 30 seconds)');
}

export function stopPayoutWorker(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('Payout worker stopped');
  }
}
