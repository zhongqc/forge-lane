import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, Prisma } from '../generated/client';
import {
  defaultSettings,
  settingsSchema,
  ForgeError,
  type Project,
  type VersionedSettings,
} from '../../contracts/src/index';
import type { Store } from '../../core/src/ports';

class ConfiguredAdapter extends PrismaBetterSqlite3 {
  override async connect() {
    const connection = await super.connect();
    try {
      for (const sql of [
        'PRAGMA foreign_keys = ON',
        'PRAGMA journal_mode = WAL',
        'PRAGMA busy_timeout = 5000',
      ]) {
        await connection.queryRaw({ sql, args: [], argTypes: [] });
      }
      return connection;
    } catch (error) {
      await connection.dispose();
      throw error;
    }
  }
}
export async function openStore(
  path: string,
): Promise<
  Store & { diagnostics(): Promise<{ foreignKeys: number; journalMode: string; busyTimeout: number }> }
> {
  if (!isAbsolute(path)) throw new ForgeError('DATABASE_PATH', '数据库必须使用绝对路径');
  const db = new PrismaClient({
    adapter: new ConfiguredAdapter({ url: `file:${path}`, timeout: 5000 }),
    transactionOptions: { maxWait: 5000, timeout: 5000 },
  });
  await db.$connect();
  try {
    await db.settings.upsert({
      where: { id: 'global' },
      create: { id: 'global', values: defaultSettings },
      update: {},
    });
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
  // A single serialized writer prevents concurrent interactive SQLite transactions.
  let tail: Promise<unknown> = Promise.resolve();
  function write<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  }
  async function mutate<T>(
    requestId: string,
    input: unknown,
    work: (tx: Prisma.TransactionClient) => Promise<{ result: T; entityId: string; type: string }>,
  ): Promise<T> {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return write(() =>
      db.$transaction(async (tx) => {
        const receipt = await tx.mutation.findUnique({ where: { requestId } });
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            throw new ForgeError('REQUEST_REUSED', '请求编号已用于其他内容，请重新提交');
          return receipt.result as T;
        }
        const { result, entityId, type } = await work(tx);
        const json = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
        await tx.mutation.create({ data: { requestId, fingerprint, result: json } });
        await tx.activityEvent.create({
          data: { eventId: randomUUID(), entityId, type, requestId, payload: json },
        });
        return result;
      }),
    );
  }
  return {
    async snapshot() {
      await tail;
      return db.$transaction(async (tx) => {
        const settings = await tx.settings.findUniqueOrThrow({ where: { id: 'global' } });
        const projects = await tx.project.findMany({ orderBy: { createdAt: 'asc' } });
        return {
          projects: projects.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
          settings: { version: settings.version, values: settingsSchema.parse(settings.values) },
        };
      });
    },
    async lookupProjectImport(input) {
      await tail;
      const receipt = await db.mutation.findUnique({ where: { requestId: input.requestId } });
      if (!receipt) return undefined;
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ method: 'project.import', name: input.name, path: input.path }))
        .digest('hex');
      if (receipt.fingerprint !== fingerprint)
        throw new ForgeError('REQUEST_REUSED', '请求编号已用于其他内容，请重新提交');
      return receipt.result as Project;
    },
    async createProject(input) {
      return mutate<Project>(
        input.requestId,
        { method: 'project.import', name: input.name, path: input.path },
        async (tx) => {
          if (await tx.project.findUnique({ where: { gitCommonDir: input.repository.gitCommonDir } }))
            throw new ForgeError('DUPLICATE_REPOSITORY', '该 Git 仓库已导入；关联 worktree 也属于同一项目');
          const project = await tx.project.create({
            data: { id: randomUUID(), name: input.name, ...input.repository },
          });
          return {
            result: { ...project, createdAt: project.createdAt.toISOString() },
            entityId: project.id,
            type: 'project.imported',
          };
        },
      );
    },
    async saveSettings(input) {
      const values = settingsSchema.parse(input.values);
      return mutate<VersionedSettings>(
        input.requestId,
        { method: 'settings.save', expectedVersion: input.expectedVersion, values },
        async (tx) => {
          const changed = await tx.settings.updateMany({
            where: { id: 'global', version: input.expectedVersion },
            data: { version: { increment: 1 }, values },
          });
          if (changed.count !== 1)
            throw new ForgeError('VERSION_CONFLICT', '设置已发生变化，请重新加载后比较；当前输入已保留');
          return {
            result: { version: input.expectedVersion + 1, values },
            entityId: 'global',
            type: 'settings.saved',
          };
        },
      );
    },
    async diagnostics() {
      const foreign = await db.$queryRawUnsafe<{ foreign_keys: bigint }[]>('PRAGMA foreign_keys');
      const journal = await db.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');
      const busy = await db.$queryRawUnsafe<{ timeout: bigint }[]>('PRAGMA busy_timeout');
      return {
        foreignKeys: Number(foreign[0].foreign_keys),
        journalMode: journal[0].journal_mode,
        busyTimeout: Number(busy[0].timeout),
      };
    },
    async close() {
      await tail;
      await db.$disconnect();
    },
  };
}
