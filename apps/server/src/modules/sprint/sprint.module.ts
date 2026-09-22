import { SprintOverviewService } from './sprint-overview.service.js';
import { Module } from '@nestjs/common';
import { SprintController } from './sprint.controller.js';
import { SprintService } from './sprint.service.js';
@Module({ controllers: [SprintController], providers: [SprintService, SprintOverviewService] })
export class SprintModule {}
