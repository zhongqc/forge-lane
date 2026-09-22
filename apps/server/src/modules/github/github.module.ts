import { Module } from '@nestjs/common';
import { GitHubController, GitHubWebhookController } from './github.controller.js';
import { GitHubService } from './github.service.js';
import { GitHubClient } from './github.client.js';
import { GitHubProcessor } from './github.processor.js';
import { GitHubWorker } from './github.worker.js';
import { CommandService } from '../../common/command.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
@Module({
  controllers: [GitHubController, GitHubWebhookController],
  providers: [GitHubService, GitHubClient, GitHubProcessor, GitHubWorker, CommandService, ActivityRepository],
})
export class GitHubModule {}
