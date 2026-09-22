ALTER TABLE "GitHubRepository" ADD COLUMN "pendingAutomations" JSONB NOT NULL DEFAULT '[]';
