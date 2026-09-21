import { Global, Module } from '@nestjs/common';
import { IssueController } from './issue.controller.js';
import { IssueService } from './issue.service.js';
import { IssueRepository } from './issue.repository.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { CommandService } from '../../common/command.service.js';
@Global()
@Module({
  controllers: [IssueController],
  providers: [IssueService, IssueRepository, ActivityRepository, CommandService],
  exports: [IssueService, IssueRepository, ActivityRepository, CommandService],
})
export class IssueModule {}
