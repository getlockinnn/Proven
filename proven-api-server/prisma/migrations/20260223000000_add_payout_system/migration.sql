-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('DAILY_BASE', 'DAILY_BONUS', 'DUST_SWEEP');

-- CreateEnum
CREATE TYPE "PayoutJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable: Add payoutsFinalized to Challenge
ALTER TABLE "Challenge" ADD COLUMN "payoutsFinalized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add payoutJobId to Transaction
ALTER TABLE "Transaction" ADD COLUMN "payoutJobId" TEXT;

-- CreateTable: PayoutJob
CREATE TABLE "PayoutJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "PayoutType" NOT NULL,
    "dayDate" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PayoutJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "transactionSignature" TEXT,
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DailySettlement
CREATE TABLE "DailySettlement" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "dayDate" TEXT NOT NULL,
    "totalActive" INTEGER NOT NULL,
    "showedUp" INTEGER NOT NULL,
    "missed" INTEGER NOT NULL,
    "baseDailyRate" INTEGER NOT NULL,
    "bonusPerPerson" INTEGER NOT NULL,
    "totalDistributed" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutJob_idempotencyKey_key" ON "PayoutJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PayoutJob_status_nextAttemptAt_idx" ON "PayoutJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PayoutJob_challengeId_dayDate_idx" ON "PayoutJob"("challengeId", "dayDate");

-- CreateIndex
CREATE INDEX "PayoutJob_userId_challengeId_idx" ON "PayoutJob"("userId", "challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySettlement_challengeId_dayDate_key" ON "DailySettlement"("challengeId", "dayDate");

-- CreateIndex
CREATE INDEX "DailySettlement_challengeId_idx" ON "DailySettlement"("challengeId");

-- AddForeignKey
ALTER TABLE "PayoutJob" ADD CONSTRAINT "PayoutJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutJob" ADD CONSTRAINT "PayoutJob_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySettlement" ADD CONSTRAINT "DailySettlement_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
