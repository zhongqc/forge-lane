import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';
import { EmailChannel } from './notification-channel.js';
import { NotificationWorker } from './notification.worker.js';
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, EmailChannel, NotificationWorker],
  exports: [NotificationService, EmailChannel, NotificationWorker],
})
export class NotificationModule {}
