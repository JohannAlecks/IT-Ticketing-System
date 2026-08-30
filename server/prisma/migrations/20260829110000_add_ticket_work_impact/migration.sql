-- Additive work-impact fields. Existing tickets remain readable and default
-- to not work-blocking with no requester explanation.
ALTER TABLE "tickets"
  ADD COLUMN "isWorkBlocking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "impactDescription" VARCHAR(500);
