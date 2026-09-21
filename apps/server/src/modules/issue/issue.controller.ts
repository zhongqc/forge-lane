import { ApiBody } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  Query,
  Headers,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { IssueService } from './issue.service.js';
import { CreateIssueDto, UpdateIssueDto, CommentDto } from './issue.dto.js';
import { parse } from '../../common/validation.js';
@Controller('api')
@UseGuards(SessionGuard)
export class IssueController {
  constructor(@Inject(IssueService) private service: IssueService) {}
  @ApiBody({ type: CreateIssueDto })
  @Post('projects/:id/issues')
  create(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(r.actorContext, id, parse(CreateIssueDto, b), key);
  }
  @Get('projects/:id/issues') list(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: Record<string, string>,
  ) {
    return this.service.list(r.actorContext, id, q);
  }
  @Get('issues/by-key/:key') byKey(@Req() r: AuthRequest, @Param('key') key: string) {
    return this.service.byKey(r.actorContext, key);
  }
  @Get('issues/:id') get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(r.actorContext, id);
  }
  @ApiBody({ type: UpdateIssueDto })
  @Patch('issues/:id')
  update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    for (const field of ['title', 'type', 'statusId', 'description', 'priority'])
      if ((b as Record<string, unknown>)?.[field] === null)
        throw new BadRequestException(`${field} 不允许为空`);
    return this.service.update(r.actorContext, id, parse(UpdateIssueDto, b), key);
  }
  @Get('issues/:id/activities') activities(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.activities(r.actorContext, id, cursor);
  }
  @Get('issues/:id/revisions') revisions(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revisions(r.actorContext, id);
  }
  @Get('issues/:id/revisions/:revisionId') revision(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) rid: string,
  ) {
    return this.service.revision(r.actorContext, id, rid);
  }
  @Get('issues/:id/comments') comments(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.comments(r.actorContext, id);
  }
  @ApiBody({ type: CommentDto })
  @Post('issues/:id/comments')
  comment(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.comment(r.actorContext, id, parse(CommentDto, b), undefined, false, key);
  }
  @ApiBody({ type: CommentDto })
  @Patch('issues/:id/comments/:commentId')
  editComment(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) cid: string,
    @Body() b: unknown,
  ) {
    return this.service.comment(r.actorContext, id, parse(CommentDto, b), cid);
  }
  @ApiBody({ type: CommentDto })
  @Delete('issues/:id/comments/:commentId')
  deleteComment(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) cid: string,
    @Body() b: unknown,
  ) {
    return this.service.comment(r.actorContext, id, parse(CommentDto, b), cid, true);
  }
}
