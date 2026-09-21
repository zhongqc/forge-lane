import { Injectable, Inject } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Db } from './db.js';
import { fail } from './errors.js';
import type { Prisma } from '../../../../packages/db/src/client.js';
import type { ActorContext } from '../../../../packages/shared/src/contracts.js';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
@Injectable()
export class CommandService {
  constructor(@Inject(Db) private db: Db) {}
  async run<T>(
    c: ActorContext,
    route: string,
    key: string | undefined,
    body: unknown,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (key && key.length > 128) fail(400, '幂等键过长');
    return this.db.client.$transaction(
      async (tx) => {
        // A workspace-scoped command lock protects lifecycle/rank/relationship decisions across every writer.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c.workspaceId},0))`;
        const requestHash = createHash('sha256').update(canonical(body)).digest('hex');
        if (key) {
          const prev = await tx.idempotencyRecord.findUnique({
            where: { actorId_route_key: { actorId: c.actorId, route, key } },
          });
          if (prev) {
            if (prev.requestHash !== requestHash)
              fail(409, '幂等键已被另一个请求使用', 'IDEMPOTENCY_CONFLICT');
            return prev.response as T;
          }
        }
        const result = await fn(tx);
        if (key)
          await tx.idempotencyRecord.create({
            data: {
              actorId: c.actorId,
              route,
              key,
              requestHash,
              response: JSON.parse(JSON.stringify(result)),
            },
          });
        return result;
      },
      { timeout: 15000 },
    );
  }
}
