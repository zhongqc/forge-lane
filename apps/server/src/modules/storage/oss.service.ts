import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { fail } from '../../common/errors.js';

@Injectable()
export class OssService {
  private client() {
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    if (!accessKeyId || !accessKeySecret) fail(503, '头像存储尚未配置，请联系管理员');
    return new OSS({
      accessKeyId,
      accessKeySecret,
      bucket: process.env.OSS_BUCKET || 'forge-lane',
      region: process.env.OSS_REGION || 'oss-cn-shanghai',
      endpoint: process.env.OSS_ENDPOINT || 'oss-cn-shanghai.aliyuncs.com',
      secure: true,
      timeout: 15000,
    });
  }
  async put(key: string, body: Buffer) {
    const client = this.client();
    try {
      await client.put(key, body, {
        headers: { 'Content-Type': 'image/webp', 'x-oss-object-acl': 'private' },
      });
    } catch {
      fail(502, '头像上传失败，请稍后重试');
    }
  }
  async get(key: string) {
    const client = this.client();
    try {
      const result = await client.get(key);
      return result.content;
    } catch {
      fail(502, '头像暂时无法加载');
    }
  }
  async delete(key: string) {
    await this.client().delete(key);
  }
}
