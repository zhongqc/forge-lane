import { CommandModule } from '../../common/command.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { Module } from '@nestjs/common';
import { GitHubController, GitHubWebhookController } from './github.controller.js';
import { GitHubService } from './github.service.js';
import { GitHubClient } from './github.client.js';
import { GitHubProcessor } from './github.processor.js';
import { GitHubWorker } from './github.worker.js';
@Module({
  imports: [CommandModule, ActivityModule],
  controllers: [GitHubController, GitHubWebhookController],
  providers: [GitHubService, GitHubClient, GitHubProcessor, GitHubWorker],
})
export class GitHubModule {}
