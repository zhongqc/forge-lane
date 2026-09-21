import { Module } from '@nestjs/common';
import { SprintController } from './sprint.controller.js';
import { SprintService } from './sprint.service.js';
@Module({ controllers: [SprintController], providers: [SprintService] })
export class SprintModule {}
