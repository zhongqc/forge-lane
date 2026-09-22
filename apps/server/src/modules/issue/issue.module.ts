import { ExecutionController } from '../execution/execution.controller.js';
import { ExecutionService } from '../execution/execution.service.js';
import { Global, Module } from '@nestjs/common';
import { IssueController } from './issue.controller.js';
import { IssueService } from './issue.service.js';
import { IssueRepository } from './issue.repository.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { CommandService } from '../../common/command.service.js';
@Global()
@Module({
  controllers: [IssueController, ExecutionController],
  providers: [ExecutionService, IssueService, IssueRepository, ActivityRepository, CommandService],
  exports: [IssueService, IssueRepository, ActivityRepository, CommandService],
})
export class IssueModule {}
