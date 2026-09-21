import { ApiBody } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  UseGuards,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { ProjectService } from './project.service.js';
import { CreateProjectDto, UpdateProjectDto, MemberDto, LabelDto, StatusDto } from './project.dto.js';
import { parse } from '../../common/validation.js';
@Controller('api/projects')
@UseGuards(SessionGuard)
export class ProjectController {
  constructor(@Inject(ProjectService) private service: ProjectService) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.service.list(r.actorContext);
  }
  @ApiBody({ type: CreateProjectDto })
  @Post()
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(r.actorContext, parse(CreateProjectDto, b));
  }
  @ApiBody({ type: UpdateProjectDto })
  @Patch(':id')
  update(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.update(r.actorContext, id, parse(UpdateProjectDto, b));
  }
  @Get(':id/members') members(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.members(r.actorContext, id);
  }
  @ApiBody({ type: MemberDto })
  @Post(':id/members')
  member(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.member(r.actorContext, id, parse(MemberDto, b));
  }
  @ApiBody({ type: LabelDto })
  @Post(':id/labels')
  label(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.label(r.actorContext, id, parse(LabelDto, b));
  }
  @ApiBody({ type: StatusDto })
  @Post(':id/statuses')
  status(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.service.status(r.actorContext, id, parse(StatusDto, b));
  }
  @ApiBody({ type: StatusDto })
  @Patch(':id/statuses/:statusId')
  editStatus(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statusId', ParseUUIDPipe) sid: string,
    @Body() b: unknown,
  ) {
    return this.service.status(r.actorContext, id, parse(StatusDto, b), sid);
  }
  @Delete(':id/statuses/:statusId') deleteStatus(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statusId', ParseUUIDPipe) sid: string,
  ) {
    return this.service.deleteStatus(r.actorContext, id, sid);
  }
}
