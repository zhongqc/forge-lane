import { ApiBody } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Headers,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { BoardService } from './board.service.js';
import { MoveIssueDto } from './board.dto.js';
import { parse } from '../../common/validation.js';
@Controller('api/projects/:id/board')
@UseGuards(SessionGuard)
export class BoardController {
  constructor(@Inject(BoardService) private service: BoardService) {}
  @Get() get(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(r.actorContext, id);
  }
  @ApiBody({ type: MoveIssueDto })
  @Post('moves')
  move(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.move(r.actorContext, id, parse(MoveIssueDto, b), key);
  }
}
