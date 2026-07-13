-- CreateEnum
CREATE TYPE "marvics"."RewardStatus" AS ENUM ('PENDING', 'PAID', 'VOIDED');
-- CreateTable
CREATE TABLE "marvics"."ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "marvics"."RewardStatus" NOT NULL DEFAULT 'PAID',
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "marvics"."ReferralSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "firstDepositReward" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "firstTradeReward" DECIMAL(65,30) NOT NULL DEFAULT 2,
    "rewardAsset" TEXT NOT NULL DEFAULT 'USDT',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ReferralReward_referrerId_createdAt_idx" ON "marvics"."ReferralReward"("referrerId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referredUserId_triggerEvent_key" ON "marvics"."ReferralReward"("referredUserId", "triggerEvent");
-- AddForeignKey
ALTER TABLE "marvics"."ReferralReward" ADD CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;