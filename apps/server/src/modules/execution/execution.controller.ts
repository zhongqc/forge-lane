import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { parse } from '../../common/validation.js';
import { ExecutionService } from './execution.service.js';
import { ClaimDto, RenewDto, FinishDto } from './execution.dto.js';
class ExecutionQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() issueId?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @IsIn(['true', 'false']) page?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsIn(['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED']) status?:
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED';
}
@Controller('api')
@UseGuards(SessionGuard)
export class ExecutionController {
  constructor(@Inject(ExecutionService) private service: ExecutionService) {}
  @Post('issues/:id/claim') claim(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.claim(r.actorContext, id, parse(ClaimDto, b), key);
  }
  @Get('issues/:id/executions') issueRuns(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(r.actorContext, undefined, id);
  }
  @Get('executions') list(@Req() r: AuthRequest, @Query() q: unknown) {
    const input = parse(ExecutionQuery, q);
    return this.service.list(r.actorContext, input.projectId, input.issueId, input);
  }
  @Get('executions/:id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(r.actorContext, id);
  }
  @Post('executions/:id/renew') renew(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.change(r.actorContext, id, parse(RenewDto, b), key);
  }
  @Post('executions/:id/finish') finish(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.change(r.actorContext, id, parse(FinishDto, b), key);
  }
}
