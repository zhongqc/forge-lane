import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { IssueModule } from '../issue/issue.module.js';
import { SprintOverviewService } from './sprint-overview.service.js';
import { Module } from '@nestjs/common';
import { SprintController } from './sprint.controller.js';
import { SprintService } from './sprint.service.js';
@Module({
  imports: [CommandModule, ActivityModule, IssueModule],
  controllers: [SprintController],
  providers: [SprintService, SprintOverviewService],
})
export class SprintModule {}
