import { ApiBody } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Headers,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { SprintService } from './sprint.service.js';
import { CreateSprintDto, SprintCommandDto, SprintIssueDto, PlanningMoveDto } from './sprint.dto.js';
import { parse } from '../../common/validation.js';
@Controller('api')
@UseGuards(SessionGuard)
export class SprintController {
  constructor(@Inject(SprintService) private service: SprintService) {}
  @Get('projects/:id/sprints') list(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(r.actorContext, id);
  }
  @ApiBody({ type: CreateSprintDto })
  @Post('sprints')
  create(@Req() r: AuthRequest, @Body() b: unknown, @Headers('idempotency-key') key?: string) {
    return this.service.create(r.actorContext, parse(CreateSprintDto, b), key);
  }
  @ApiBody({ type: SprintCommandDto })
  @Post('sprints/:id/start')
  start(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.lifecycle(r.actorContext, id, 'start', parse(SprintCommandDto, b), key);
  }
  @ApiBody({ type: SprintCommandDto })
  @Post('sprints/:id/complete')
  complete(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.lifecycle(r.actorContext, id, 'complete', parse(SprintCommandDto, b), key);
  }
  @ApiBody({ type: SprintCommandDto })
  @Delete('sprints/:id')
  remove(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.lifecycle(r.actorContext, id, 'delete', parse(SprintCommandDto, b));
  }
  @ApiBody({ type: SprintIssueDto })
  @Post('sprints/:id/issues')
  assign(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.assign(r.actorContext, id, parse(SprintIssueDto, b));
  }
  @ApiBody({ type: SprintCommandDto })
  @Delete('sprints/:id/issues/:issueId')
  unassign(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() b: unknown,
  ) {
    const v = parse(SprintCommandDto, b);
    return this.service.unassign(r.actorContext, id, issueId, v.version);
  }
  @ApiBody({ type: PlanningMoveDto })
  @Post('projects/:id/backlog/moves')
  plan(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.plan(r.actorContext, id, parse(PlanningMoveDto, b), key);
  }
}
