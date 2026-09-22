-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" UUID NOT NULL,
    "digest" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectIds" UUID[],
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueExecution" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "tokenId" UUID NOT NULL,
    "executor" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "prUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IssueExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_digest_key" ON "ApiToken"("digest");

-- CreateIndex
CREATE INDEX "ApiToken_actorId_workspaceId_idx" ON "ApiToken"("actorId", "workspaceId");

-- CreateIndex
CREATE INDEX "IssueExecution_issueId_createdAt_idx" ON "IssueExecution"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "IssueExecution_projectId_status_leaseExpiresAt_idx" ON "IssueExecution"("projectId", "status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueExecution" ADD CONSTRAINT "IssueExecution_projectId_issueId_fkey" FOREIGN KEY ("projectId", "issueId") REFERENCES "Issue"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueExecution" ADD CONSTRAINT "IssueExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueExecution" ADD CONSTRAINT "IssueExecution_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueExecution" ADD CONSTRAINT "IssueExecution_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: the transaction lock also expires leases before a new claim.
CREATE UNIQUE INDEX "IssueExecution_one_running_per_issue" ON "IssueExecution"("issueId") WHERE "status" = 'RUNNING';
