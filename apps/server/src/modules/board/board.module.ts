import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { IssueModule } from '../issue/issue.module.js';
import { Module } from '@nestjs/common';
import { BoardController } from './board.controller.js';
import { BoardService } from './board.service.js';
@Module({
  imports: [CommandModule, ActivityModule, IssueModule],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
