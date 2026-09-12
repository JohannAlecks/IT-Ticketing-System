BEGIN;

-- One database-owned normalization rule for both backfill and future writes.
CREATE FUNCTION public.department_normalize(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
$$;

CREATE TABLE "departments" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "normalizedName" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "departments_name_check" CHECK (char_length("name") BETWEEN 2 AND 100 AND "name" !~ '[[:cntrl:]]' AND "name" = regexp_replace("name", '^[[:space:]]+|[[:space:]]+$', '', 'g')),
  CONSTRAINT "departments_normalized_check" CHECK ("normalizedName" = public.department_normalize("name")),
  CONSTRAINT "departments_description_check" CHECK ("description" IS NULL OR char_length("description") <= 500),
  CONSTRAINT "departments_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "departments_normalizedName_key" ON "departments"("normalizedName");
CREATE INDEX "departments_isActive_name_id_idx" ON "departments"("isActive", "name", "id");
ALTER TABLE "users" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "users_departmentId_isActive_role_idx" ON "users"("departmentId", "isActive", "role");
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deterministic display spelling and IDs. Invalid legacy values stay intact
-- and unlinked. This updates only the new association, never legacy strings,
-- timestamps, SLA/CSAT snapshots, tickets, or historical audit records.
WITH trimmed AS (
  SELECT regexp_replace("department", '^[[:space:]]+|[[:space:]]+$', '', 'g') AS name
  FROM "users" WHERE "department" IS NOT NULL
), canonical AS (
  SELECT public.department_normalize(name) AS normalized, min(name COLLATE "C") AS name
  FROM trimmed WHERE char_length(name) BETWEEN 2 AND 100 AND name !~ '[[:cntrl:]]'
  GROUP BY public.department_normalize(name)
), hashed AS (
  SELECT *, md5('ticketing-department:' || normalized) AS hash FROM canonical
)
INSERT INTO "departments" ("id", "name", "normalizedName", "updatedAt")
SELECT substr(hash,1,8)||'-'||substr(hash,9,4)||'-5'||substr(hash,14,3)||'-a'||substr(hash,18,3)||'-'||substr(hash,21,12), name, normalized, CURRENT_TIMESTAMP
FROM hashed ON CONFLICT ("normalizedName") DO NOTHING;

UPDATE "users" u SET "departmentId" = d.id FROM "departments" d
WHERE u."departmentId" IS NULL AND public.department_normalize(u.department) = d."normalizedName"
  AND char_length(regexp_replace(u.department, '^[[:space:]]+|[[:space:]]+$', '', 'g')) BETWEEN 2 AND 100
  AND regexp_replace(u.department, '^[[:space:]]+|[[:space:]]+$', '', 'g') !~ '[[:cntrl:]]';

COMMIT;
