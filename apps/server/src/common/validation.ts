import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { fail } from './errors.js';
export function parse<T extends object>(type: new () => T, input: unknown): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '请求格式错误');
  const dto = plainToInstance(type, input);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length)
    fail(400, errors.map((e) => Object.values(e.constraints ?? {}).join('、')).join('；'), 'INVALID_INPUT');
  for (const key of Object.keys(dto))
    if ((dto as Record<string, unknown>)[key] === undefined) delete (dto as Record<string, unknown>)[key];
  return dto;
}
