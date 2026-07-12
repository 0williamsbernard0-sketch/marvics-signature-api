-- CreateEnum
CREATE TYPE "marvics"."WithdrawalStatus" AS ENUM ('PENDING', 'RISK_REVIEW', 'APPROVED', 'BROADCASTING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "marvics"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER,
    "requestBody" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" "marvics"."WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "requiresKyc" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "txHash" TEXT,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."WithdrawalSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "instantTierLimit" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "dailyLimitInstant" DECIMAL(65,30) NOT NULL DEFAULT 200,
    "dailyLimitVerified" DECIMAL(65,30) NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "marvics"."AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_createdAt_idx" ON "marvics"."WithdrawalRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "marvics"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
