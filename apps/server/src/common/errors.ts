import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
export function fail(status: number, message: string, code = 'VALIDATION_ERROR'): never {
  throw new HttpException({ code, message }, status);
}
export function conflict(): never {
  return fail(409, '此事项已被更新。请载入最新版本后重试。', 'VERSION_CONFLICT');
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof HttpException) {
      const data = error.getResponse();
      res.status(error.getStatus()).json(typeof data === 'string' ? { message: data, code: 'ERROR' } : data);
      return;
    }
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') {
      res.status(409).json({ code: 'CONFLICT', message: '数据已存在，请刷新后重试' });
      return;
    }
    if (code === 'P2003' || code === 'P2004') {
      res.status(422).json({ code: 'RELATION_CONFLICT', message: '此操作违反数据关联约束' });
      return;
    }
    const requestId = randomUUID();
    console.error('Request failed', requestId, error);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务暂时不可用，请重试', requestId });
  }
}
