-- CreateTable
CREATE TABLE "marvics"."Conversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAsset" TEXT NOT NULL,
    "toAsset" TEXT NOT NULL,
    "fromAmount" DECIMAL(65,30) NOT NULL,
    "toAmount" DECIMAL(65,30) NOT NULL,
    "rateUsed" DECIMAL(65,30) NOT NULL,
    "ledgerEntryIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marvics"."InternalTransfer" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "ledgerEntryIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversion_userId_createdAt_idx" ON "marvics"."Conversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalTransfer_senderId_createdAt_idx" ON "marvics"."InternalTransfer"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalTransfer_recipientId_createdAt_idx" ON "marvics"."InternalTransfer"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "marvics"."Conversion" ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."InternalTransfer" ADD CONSTRAINT "InternalTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marvics"."InternalTransfer" ADD CONSTRAINT "InternalTransfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "marvics"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
