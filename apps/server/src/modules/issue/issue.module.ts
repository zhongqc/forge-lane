import { Module } from '@nestjs/common';
import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { IssueController } from './issue.controller.js';
import { IssueService } from './issue.service.js';
import { IssueRepository } from './issue.repository.js';
@Module({
  imports: [CommandModule, ActivityModule, NotificationModule],
  controllers: [IssueController],
  providers: [IssueService, IssueRepository],
  exports: [IssueService, IssueRepository],
})
export class IssueModule {}
