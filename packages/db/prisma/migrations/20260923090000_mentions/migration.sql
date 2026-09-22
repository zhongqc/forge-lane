-- CreateTable
CREATE TABLE "MentionNotification" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "senderName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "commentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "MentionNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentionNotification_recipientId_createdAt_id_idx" ON "MentionNotification"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MentionNotification_source_sourceId_sourceVersion_recipient_key" ON "MentionNotification"("source", "sourceId", "sourceVersion", "recipientId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_retryAt_leaseUntil_idx" ON "NotificationDelivery"("status", "retryAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- AddForeignKey
ALTER TABLE "MentionNotification" ADD CONSTRAINT "MentionNotification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionNotification" ADD CONSTRAINT "MentionNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionNotification" ADD CONSTRAINT "MentionNotification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "MentionNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

