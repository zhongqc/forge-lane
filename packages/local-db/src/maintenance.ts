import { existsSync, readdirSync, readFileSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ForgeError } from '../../contracts/src/index';

export function inspectDatabase(path: string, migrations: string): { pending: boolean; exists: boolean } {
  const expected = readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!expected.length) throw new ForgeError('MIGRATION_ASSETS', '安装包缺少数据库迁移文件');
  if (!existsSync(path)) return { pending: true, exists: false };
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('quick_check', { simple: true }) !== 'ok')
      throw new ForgeError('DATABASE_CORRUPT', '数据库完整性检查失败');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    if (!tables.length) return { pending: true, exists: true };
    if (!tables.some((table) => table.name === '_prisma_migrations'))
      throw new ForgeError('SCHEMA_UNKNOWN', '数据库没有可识别的迁移历史，已停止写入');
    const applied = db
      .prepare(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at, migration_name',
      )
      .all() as { migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown }[];
    for (const [index, row] of applied.entries()) {
      if (!expected.includes(row.migration_name))
        throw new ForgeError('SCHEMA_NEWER', '数据库包含较新或未知迁移，请使用匹配的应用版本');
      if (!row.finished_at || row.rolled_back_at)
        throw new ForgeError('MIGRATION_INCOMPLETE', '数据库迁移未完成，需要维护；原库已保留');
      const checksum = createHash('sha256')
        .update(readFileSync(join(migrations, row.migration_name, 'migration.sql')))
        .digest('hex');
      if (checksum !== row.checksum || row.migration_name !== expected[index])
        throw new ForgeError('MIGRATION_MISMATCH', '数据库迁移校验不匹配，已停止写入');
    }
    if (!applied.length && tables.length > 1)
      throw new ForgeError('SCHEMA_UNKNOWN', '数据库缺少已完成的迁移记录');
    return { exists: true, pending: applied.length < expected.length };
  } finally {
    db.close();
  }
}
export async function backupDatabase(path: string, destination: string): Promise<void> {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
}

// Prisma 7.10's schema engine requires the SQLite file to exist on this target.
// Exclusive creation never truncates an existing DB; all schema changes remain Prisma-owned.
export function createDatabaseFile(path: string): void {
  try {
    closeSync(openSync(path, 'wx', 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}
