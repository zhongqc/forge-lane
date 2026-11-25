-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "repositoryPath" TEXT NOT NULL,
    "gitCommonDir" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "values" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Mutation" (
    "requestId" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "seq" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_gitCommonDir_key" ON "Project"("gitCommonDir");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_eventId_key" ON "ActivityEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_requestId_key" ON "ActivityEvent"("requestId");
