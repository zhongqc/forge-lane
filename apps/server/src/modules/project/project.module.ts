import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller.js';
import { ProjectService } from './project.service.js';
import { ProjectRepository } from './project.repository.js';
@Module({
  imports: [CommandModule, ActivityModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectRepository],
  exports: [ProjectService],
})
export class ProjectModule {}
