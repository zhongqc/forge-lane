import 'dotenv/config';
import { PrismaClient } from '../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
export function createDatabase(
  url = process.env.DATABASE_URL ?? 'postgresql://forge:forge_local@localhost:55432/forge',
) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
export { Prisma } from '../generated/client.js';
export type Database = ReturnType<typeof createDatabase>;
