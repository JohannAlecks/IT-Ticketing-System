-- Additive role-aware knowledge base storage. This migration creates no
-- destructive changes and intentionally leaves existing application data intact.
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "KnowledgeVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "KnowledgeVisibility" NOT NULL DEFAULT 'INTERNAL',
    "ticketCategory" "TicketCategory" NOT NULL DEFAULT 'OTHERS',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "reviewNote" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT,
    "reviewedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "article_feedback" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");
CREATE INDEX "knowledge_articles_status_visibility_publishedAt_idx" ON "knowledge_articles"("status", "visibility", "publishedAt");
CREATE INDEX "knowledge_articles_ticketCategory_status_visibility_idx" ON "knowledge_articles"("ticketCategory", "status", "visibility");
CREATE INDEX "knowledge_articles_authorId_status_updatedAt_idx" ON "knowledge_articles"("authorId", "status", "updatedAt");
CREATE UNIQUE INDEX "article_feedback_articleId_userId_key" ON "article_feedback"("articleId", "userId");
CREATE INDEX "article_feedback_articleId_helpful_idx" ON "article_feedback"("articleId", "helpful");

ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "article_feedback" ADD CONSTRAINT "article_feedback_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_feedback" ADD CONSTRAINT "article_feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
