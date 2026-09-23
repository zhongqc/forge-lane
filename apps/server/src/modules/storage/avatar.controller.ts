import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Response } from 'express';
import type {} from 'multer';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OssService } from './oss.service.js';

@Controller('api')
@UseGuards(SessionGuard)
export class AvatarController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(OssService) private oss: OssService,
  ) {}

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } }))
  async upload(@Req() req: AuthRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) fail(422, '请选择头像图片');
    let image: Buffer;
    try {
      const source = sharp(file.buffer, { limitInputPixels: 20000000 });
      const metadata = await source.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) fail(422, '请选择 JPG、PNG 或 WebP 图片');
      image = await source.rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
    } catch {
      fail(422, '图片无法处理，请使用有效的 JPG、PNG 或 WebP 图片');
    }
    const id = req.actorContext.actorId;
    const prefix = (process.env.OSS_PREFIX || 'avatars').replace(/^\/+|\/+$/g, '');
    const key = `${prefix}/${id}/${randomUUID()}.webp`;
    await this.oss.put(key, image);
    const previous = await this.db.client.actor.findUniqueOrThrow({
      where: { id },
      select: { avatarKey: true },
    });
    let actor;
    try {
      actor = await this.db.client.actor.update({
        where: { id },
        data: { avatarKey: key },
        select: { id: true, name: true, color: true, kind: true, avatarKey: true },
      });
    } catch (error) {
      await this.oss.delete(key).catch(() => undefined);
      throw error;
    }
    if (previous.avatarKey) await this.oss.delete(previous.avatarKey).catch(() => undefined);
    return actor;
  }

  @Get('actors/:id/avatar')
  async get(@Req() req: AuthRequest, @Param('id') id: string, @Res() res: Response) {
    const actor = await this.db.client.actor.findFirst({
      where: { id, memberships: { some: { workspaceId: req.actorContext.workspaceId } } },
      select: { avatarKey: true },
    });
    if (!actor?.avatarKey) fail(404, '头像不存在');
    const content = await this.oss.get(actor.avatarKey);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.type('image/webp').send(content);
  }
}
