import { Module } from '@nestjs/common';
import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';
@Module({
  imports: [CommandModule, ActivityModule],
  controllers: [ExecutionController],
  providers: [ExecutionService],
})
export class ExecutionModule {}
