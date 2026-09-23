import { Module } from '@nestjs/common';
import { ActivityRepository } from './activity.repository.js';
@Module({ providers: [ActivityRepository], exports: [ActivityRepository] })
export class ActivityModule {}
