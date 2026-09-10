-- No ticket/cycle/rating backfill. All relations preserve existing data.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TICKET_SATISFACTION_RECEIVED';
ALTER TABLE "tickets" ADD COLUMN "satisfactionCycleNumber" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ticket_resolution_cycles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "requesterId" TEXT NOT NULL,
  "assignedAgentId" TEXT,
  "departmentSnapshot" VARCHAR(100),
  "resolvedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_resolution_cycles_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ticket_resolution_cycles_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ticket_resolution_cycles_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ticket_resolution_cycles_ticketId_number_key" ON "ticket_resolution_cycles"("ticketId", "number");
CREATE INDEX "ticket_resolution_cycles_requesterId_resolvedAt_idx" ON "ticket_resolution_cycles"("requesterId", "resolvedAt");
CREATE INDEX "ticket_resolution_cycles_assignedAgentId_resolvedAt_idx" ON "ticket_resolution_cycles"("assignedAgentId", "resolvedAt");
CREATE TABLE "ticket_satisfactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cycleId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_satisfactions_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ticket_resolution_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ticket_satisfactions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ticket_satisfactions_cycleId_key" ON "ticket_satisfactions"("cycleId");
CREATE INDEX "ticket_satisfactions_requesterId_submittedAt_idx" ON "ticket_satisfactions"("requesterId", "submittedAt");
CREATE INDEX "ticket_satisfactions_submittedAt_idx" ON "ticket_satisfactions"("submittedAt");
