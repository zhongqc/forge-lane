import 'reflect-metadata';
import { NotificationModule } from './modules/notification/notification.module.js';
import 'dotenv/config';
import { config } from 'dotenv';
import { StorageModule } from './modules/storage/storage.module.js';
config({ path: process.env.OSS_ENV_FILE || '.env.oss', quiet: true });
import { Module, Controller, Get, Inject } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { DatabaseModule, Db } from './common/db.js';
import { ApiExceptionFilter } from './common/errors.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProjectModule } from './modules/project/project.module.js';
import { ExecutionModule } from './modules/execution/execution.module.js';
import { IssueModule } from './modules/issue/issue.module.js';
import { SprintModule } from './modules/sprint/sprint.module.js';
import { WorkspaceService } from './modules/workspace/workspace.service.js';
import { WorkspaceController } from './modules/workspace/workspace.controller.js';
import { GitHubModule } from './modules/github/github.module.js';
import { BoardModule } from './modules/board/board.module.js';
import { APP_VERSION } from '../../../packages/shared/src/version.js';

@Controller('api/version')
class VersionController {
  @Get() get() {
    return { version: APP_VERSION };
  }
}

@Controller('api/health')
class HealthController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async get() {
    await this.db.client.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
@Module({
  controllers: [WorkspaceController, HealthController, VersionController],
  providers: [WorkspaceService],
  imports: [
    NotificationModule,
    StorageModule,
    DatabaseModule,
    AuthModule,
    ProjectModule,
    IssueModule,
    ExecutionModule,
    SprintModule,
    BoardModule,
    GitHubModule,
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn'],
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(
    '/api/github/webhook',
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.json({ limit: '512kb' }));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = process.env.APP_URL ?? 'http://localhost:5173';
      if ((origin && origin !== allowed) || req.headers['sec-fetch-site'] === 'cross-site')
        return res.status(403).json({ code: 'CSRF', message: '请求来源不被允许' });
    }
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Forge Lane API')
      .setVersion(APP_VERSION)
      .addCookieAuth('forge_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
