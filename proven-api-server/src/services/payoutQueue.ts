import { PayoutType, PayoutJobStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { createServiceLogger } from '../lib/logger';

const logger = createServiceLogger('payout-queue');

export async function createPayoutJob(params: {
  userId: string;
  challengeId: string;
  amount: number; // microUSDC
  type: PayoutType;
  dayDate: string;
  walletAddress: string;
}) {
  const { userId, challengeId, amount, type, dayDate, walletAddress } = params;
  const idempotencyKey = `${challengeId}:${userId}:${dayDate}:${type}`;

  const job = await prisma.payoutJob.upsert({
    where: { idempotencyKey },
    create: {
      userId,
      challengeId,
      amount,
      type,
      dayDate,
      idempotencyKey,
      walletAddress,
      status: PayoutJobStatus.QUEUED,
    },
    update: {}, // no-op if already exists
  });

  logger.info('Payout job created/found', {
    jobId: job.id,
    idempotencyKey,
    amount,
    type,
    status: job.status,
    isExisting: job.createdAt < new Date(Date.now() - 1000),
  });

  return job;
}

export async function getQueuedJobs(limit: number = 10) {
  return prisma.payoutJob.findMany({
    where: {
      status: PayoutJobStatus.QUEUED,
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function markProcessing(jobId: string) {
  try {
    // Atomic: only succeeds if status is still QUEUED
    const job = await prisma.payoutJob.update({
      where: { id: jobId, status: PayoutJobStatus.QUEUED },
      data: {
        status: PayoutJobStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    return job;
  } catch {
    // Record was already picked up by another worker or status changed
    return null;
  }
}

export async function markCompleted(jobId: string, txSignature: string) {
  await prisma.payoutJob.update({
    where: { id: jobId },
    data: {
      status: PayoutJobStatus.COMPLETED,
      transactionSignature: txSignature,
      processedAt: new Date(),
      lastError: null,
    },
  });
}

export async function markFailed(jobId: string, error: string) {
  const job = await prisma.payoutJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (job.attempts >= job.maxAttempts) {
    // Permanently failed
    await prisma.payoutJob.update({
      where: { id: jobId },
      data: {
        status: PayoutJobStatus.FAILED,
        lastError: error,
        processedAt: new Date(),
      },
    });
    logger.error('Payout job permanently failed', { jobId, error, attempts: job.attempts });
  } else {
    // Exponential backoff: 30s, 120s, 480s
    const backoffMs = 30_000 * Math.pow(4, job.attempts - 1);
    await prisma.payoutJob.update({
      where: { id: jobId },
      data: {
        status: PayoutJobStatus.QUEUED,
        lastError: error,
        nextAttemptAt: new Date(Date.now() + backoffMs),
      },
    });
    logger.warn('Payout job scheduled for retry', {
      jobId,
      error,
      attempt: job.attempts,
      nextAttemptIn: `${backoffMs / 1000}s`,
    });
  }
}

export async function getFailedJobs(challengeId?: string) {
  return prisma.payoutJob.findMany({
    where: {
      status: PayoutJobStatus.FAILED,
      ...(challengeId && { challengeId }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      challenge: { select: { id: true, title: true } },
    },
    orderBy: { processedAt: 'desc' },
  });
}

export async function retryJob(jobId: string) {
  await prisma.payoutJob.update({
    where: { id: jobId },
    data: {
      status: PayoutJobStatus.QUEUED,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      processedAt: null,
    },
  });
  logger.info('Payout job manually retried', { jobId });
}

export async function getPayoutStats() {
  const [queued, processing, completed, failed] = await Promise.all([
    prisma.payoutJob.count({ where: { status: PayoutJobStatus.QUEUED } }),
    prisma.payoutJob.count({ where: { status: PayoutJobStatus.PROCESSING } }),
    prisma.payoutJob.count({ where: { status: PayoutJobStatus.COMPLETED } }),
    prisma.payoutJob.count({ where: { status: PayoutJobStatus.FAILED } }),
  ]);

  return { queued, processing, completed, failed, total: queued + processing + completed + failed };
}

export async function getRecentPayouts(limit: number = 20) {
  return prisma.payoutJob.findMany({
    where: { status: PayoutJobStatus.COMPLETED },
    include: {
      user: { select: { id: true, name: true } },
      challenge: { select: { id: true, title: true } },
    },
    orderBy: { processedAt: 'desc' },
    take: limit,
  });
}
