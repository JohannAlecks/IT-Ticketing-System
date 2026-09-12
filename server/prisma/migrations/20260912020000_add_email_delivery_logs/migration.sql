BEGIN;

CREATE TYPE "EmailLogStatus" AS ENUM ('DISABLED', 'UNKNOWN', 'ACCEPTED', 'FAILED');
CREATE TYPE "EmailLogProvider" AS ENUM ('DISABLED', 'RESEND');
CREATE TYPE "EmailLogType" AS ENUM ('EMAIL_VERIFICATION');
CREATE TYPE "EmailLogError" AS ENUM ('EMAIL_DISABLED', 'NOT_CONFIRMED', 'PROVIDER_REJECTED', 'TIMEOUT', 'TRANSPORT_ERROR', 'INVALID_RESPONSE');

-- Operational metadata only. No message body, token, URL, raw recipient,
-- provider payload, arbitrary metadata, or relation to deletable user records.
CREATE TABLE "email_logs" (
  "id" TEXT NOT NULL,
  "messageType" "EmailLogType" NOT NULL,
  "recipientMasked" VARCHAR(20) NOT NULL,
  "provider" "EmailLogProvider" NOT NULL,
  "status" "EmailLogStatus" NOT NULL,
  "idempotencyHash" VARCHAR(64) NOT NULL,
  "providerMessageId" UUID,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCategory" "EmailLogError",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_logs_mask_check" CHECK ("recipientMasked" ~ '^[a-z0-9*]\*{3}@[a-z0-9*]\*{3}\.\*{3}$'),
  CONSTRAINT "email_logs_hash_check" CHECK ("idempotencyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "email_logs_state_check" CHECK (
    ("status" = 'DISABLED' AND "provider" = 'DISABLED' AND "attemptCount" = 0 AND "errorCategory" IS NOT DISTINCT FROM 'EMAIL_DISABLED'::"EmailLogError" AND "acceptedAt" IS NULL AND "failedAt" IS NULL AND "providerMessageId" IS NULL)
    OR ("status" = 'UNKNOWN' AND "provider" = 'RESEND' AND "attemptCount" = 1 AND "errorCategory" IS NOT NULL AND "errorCategory" IN ('NOT_CONFIRMED', 'TIMEOUT', 'TRANSPORT_ERROR', 'INVALID_RESPONSE') AND "acceptedAt" IS NULL AND "failedAt" IS NULL AND "providerMessageId" IS NULL)
    OR ("status" = 'ACCEPTED' AND "provider" = 'RESEND' AND "attemptCount" = 1 AND "errorCategory" IS NULL AND "acceptedAt" IS NOT NULL AND "failedAt" IS NULL AND "providerMessageId" IS NOT NULL)
    OR ("status" = 'FAILED' AND "provider" = 'RESEND' AND "attemptCount" = 1 AND "errorCategory" IS NOT DISTINCT FROM 'PROVIDER_REJECTED'::"EmailLogError" AND "acceptedAt" IS NULL AND "failedAt" IS NOT NULL AND "providerMessageId" IS NULL)
  )
);
CREATE UNIQUE INDEX "email_logs_idempotencyHash_key" ON "email_logs"("idempotencyHash");
CREATE INDEX "email_logs_createdAt_id_idx" ON "email_logs"("createdAt", "id");
CREATE INDEX "email_logs_status_createdAt_id_idx" ON "email_logs"("status", "createdAt", "id");

COMMIT;
