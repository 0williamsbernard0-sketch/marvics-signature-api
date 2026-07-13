ALTER TABLE "marvics"."Notification" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "marvics"."SupportMessage" ADD COLUMN "attachmentUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
