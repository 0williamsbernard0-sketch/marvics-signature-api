-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "marvics";

-- CreateEnum
CREATE TYPE "marvics"."UserRole" AS ENUM ('USER', 'SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "marvics"."AccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'RESTRICTED', 'DELETED');

-- CreateEnum
CREATE TYPE "marvics"."KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "marvics"."LedgerEntryType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRADE_BUY', 'TRADE_SELL', 'CONVERSION_OUT', 'CONVERSION_IN', 'TRANSFER_OUT', 'TRANSFER_IN', 'REFERRAL_REWARD', 'FEE', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "marvics"."DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CREDITED', 'FAILED');

-- CreateEnum
CREATE TYPE "marvics"."OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "marvics"."OrderStatus" AS ENUM ('SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "marvics"."User" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "marvics"."UserRole" NOT NULL DEFAULT 'USER',
    "status" "marvics"."AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "kycStatus" "marvics"."KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referredByCode" TEXT,
    "referralCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "entryType" "marvics"."LedgerEntryType" NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."DepositAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."DepositEvent" (
    "id" TEXT NOT NULL,
    "depositAddressId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "marvics"."DepositStatus" NOT NULL DEFAULT 'PENDING',
    "rawWebhookPayload" JSONB NOT NULL,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "marvics"."OrderSide" NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "exchangeOrderId" TEXT NOT NULL,
    "requestedQty" DECIMAL(65,30) NOT NULL,
    "filledQty" DECIMAL(65,30),
    "filledPrice" DECIMAL(65,30),
    "fees" DECIMAL(65,30),
    "feeAsset" TEXT,
    "status" "marvics"."OrderStatus" NOT NULL,
    "rawExchangeResponse" JSONB NOT NULL,
    "ledgerEntryIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "marvics"."User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "marvics"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "marvics"."User"("referralCode");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_asset_createdAt_idx" ON "marvics"."LedgerEntry"("userId", "asset", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_address_key" ON "marvics"."DepositAddress"("address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_userId_chain_asset_key" ON "marvics"."DepositAddress"("userId", "chain", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "DepositEvent_txHash_chain_key" ON "marvics"."DepositEvent"("txHash", "chain");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "marvics"."Order"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "marvics"."LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."DepositEvent" ADD CONSTRAINT "DepositEvent_depositAddressId_fkey" FOREIGN KEY ("depositAddressId") REFERENCES "marvics"."DepositAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;