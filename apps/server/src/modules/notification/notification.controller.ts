import { Controller, Get, Post, Param, Query, Req, UseGuards, Inject, ParseUUIDPipe } from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { NotificationService } from './notification.service.js';
@Controller('api/notifications')
@UseGuards(SessionGuard)
export class NotificationController {
  constructor(@Inject(NotificationService) private service: NotificationService) {}
  @Get() list(@Req() r: AuthRequest, @Query('cursor') cursor?: string) {
    return this.service.list(r.actorContext, cursor);
  }
  @Post('read-all') all(@Req() r: AuthRequest) {
    return this.service.read(r.actorContext);
  }
  @Post(':id/read') read(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(r.actorContext, id);
  }
}
