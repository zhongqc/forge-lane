import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller.js';
import { AvatarCache } from './avatar-cache.service.js';
import { OssService } from './oss.service.js';
@Module({ controllers: [AvatarController], providers: [OssService, AvatarCache] })
export class StorageModule {}
