-- CreateTable
CREATE TABLE "GitHubRepository" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "githubId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "requestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubPullRequest" (
    "id" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL,
    "reviewRequested" BOOLEAN NOT NULL,
    "author" TEXT NOT NULL,
    "remoteUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubPullRequestLink" (
    "pullRequestId" UUID NOT NULL,
    "issueId" UUID NOT NULL,

    CONSTRAINT "GitHubPullRequestLink_pkey" PRIMARY KEY ("pullRequestId","issueId")
);

-- CreateTable
CREATE TABLE "GitHubCommit" (
    "id" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubCommitLink" (
    "commitId" UUID NOT NULL,
    "issueId" UUID NOT NULL,

    CONSTRAINT "GitHubCommitLink_pkey" PRIMARY KEY ("commitId","issueId")
);

-- CreateTable
CREATE TABLE "GitHubDelivery" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "retryAt" TIMESTAMP(3),

    CONSTRAINT "GitHubDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubRepository_requestedAt_retryAt_idx" ON "GitHubRepository"("requestedAt", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubRepository_projectId_githubId_key" ON "GitHubRepository"("projectId", "githubId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubPullRequest_repositoryId_number_key" ON "GitHubPullRequest"("repositoryId", "number");

-- CreateIndex
CREATE INDEX "GitHubPullRequestLink_issueId_idx" ON "GitHubPullRequestLink"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubCommit_repositoryId_sha_key" ON "GitHubCommit"("repositoryId", "sha");

-- CreateIndex
CREATE INDEX "GitHubCommitLink_issueId_idx" ON "GitHubCommitLink"("issueId");

-- CreateIndex
CREATE INDEX "GitHubDelivery_processedAt_retryAt_idx" ON "GitHubDelivery"("processedAt", "retryAt");

-- AddForeignKey
ALTER TABLE "GitHubRepository" ADD CONSTRAINT "GitHubRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubPullRequest" ADD CONSTRAINT "GitHubPullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubPullRequestLink" ADD CONSTRAINT "GitHubPullRequestLink_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "GitHubPullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubPullRequestLink" ADD CONSTRAINT "GitHubPullRequestLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubCommit" ADD CONSTRAINT "GitHubCommit_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "GitHubRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubCommitLink" ADD CONSTRAINT "GitHubCommitLink_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "GitHubCommit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubCommitLink" ADD CONSTRAINT "GitHubCommitLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

