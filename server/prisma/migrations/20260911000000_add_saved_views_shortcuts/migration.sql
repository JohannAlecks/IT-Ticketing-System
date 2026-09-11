-- Additive preferences only. No user/ticket updates or historical backfill.
CREATE TYPE "SavedViewScope" AS ENUM ('MY_TICKETS', 'ASSIGNED_TO_ME', 'ALL_AUTHORIZED', 'ARCHIVED');
CREATE TYPE "ShortcutTargetType" AS ENUM ('ROUTE', 'SAVED_VIEW');
CREATE TABLE "saved_ticket_views" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(60) NOT NULL CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
  "normalizedName" VARCHAR(120) NOT NULL,
  "scope" "SavedViewScope" NOT NULL,
  "filters" JSONB NOT NULL CHECK (jsonb_typeof("filters") = 'object'),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_ticket_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "saved_ticket_views_userId_normalizedName_key" ON "saved_ticket_views"("userId", "normalizedName");
CREATE UNIQUE INDEX "saved_ticket_views_userId_id_key" ON "saved_ticket_views"("userId", "id");
CREATE TABLE "user_shortcuts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "label" VARCHAR(40) NOT NULL CHECK (char_length(btrim("label")) BETWEEN 1 AND 40),
  "targetType" "ShortcutTargetType" NOT NULL,
  "routeKey" VARCHAR(40),
  "savedViewId" TEXT,
  "targetKey" VARCHAR(80) NOT NULL,
  -- 8..15 are transaction-private parking positions during atomic reorder.
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 15),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_shortcuts_target_check" CHECK (
    ("targetType" = 'ROUTE' AND "savedViewId" IS NULL AND "routeKey" IS NOT NULL
      AND "routeKey" IN ('SUMMARY','GET_STARTED','MY_TICKETS','CREATE_TICKET','ASSIGNED_TICKETS','ARCHIVED_WORK','KNOWLEDGE_BASE','NOTIFICATIONS','SETTINGS','REPORTS','USERS','AUDIT_LOGS','SLA_SETTINGS')
      AND "targetKey" = 'route:' || "routeKey") OR
    ("targetType" = 'SAVED_VIEW' AND "routeKey" IS NULL AND "savedViewId" IS NOT NULL AND "targetKey" = 'view:' || "savedViewId")
  ),
  CONSTRAINT "user_shortcuts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_shortcuts_userId_savedViewId_fkey" FOREIGN KEY ("userId", "savedViewId") REFERENCES "saved_ticket_views"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_shortcuts_userId_targetKey_key" ON "user_shortcuts"("userId", "targetKey");
CREATE UNIQUE INDEX "user_shortcuts_userId_position_key" ON "user_shortcuts"("userId", "position");
CREATE INDEX "user_shortcuts_userId_savedViewId_idx" ON "user_shortcuts"("userId", "savedViewId");

-- Inspect the final row state, not an earlier queued NEW value: parking
-- positions are allowed within a transaction but can never be committed.
CREATE FUNCTION public.check_shortcut_committed_position() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_shortcuts WHERE id = NEW.id AND position NOT BETWEEN 0 AND 7) THEN
    RAISE EXCEPTION 'Shortcut position must be between 0 and 7 at commit'
      USING ERRCODE = '23514', CONSTRAINT = 'user_shortcuts_committed_position';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER user_shortcuts_committed_position
AFTER INSERT OR UPDATE ON public.user_shortcuts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_shortcut_committed_position();
