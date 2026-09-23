import { Module } from '@nestjs/common';
import { AvatarController } from './avatar.controller.js';
import { OssService } from './oss.service.js';
@Module({ controllers: [AvatarController], providers: [OssService] })
export class StorageModule {}
