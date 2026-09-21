import { expect, it } from 'vitest';
import pg from 'pg';
it('enforces the active sprint uniqueness constraint in PostgreSQL', async () => {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://forge:forge_local@localhost:55432/forge',
  });
  await client.connect();
  try {
    const result = await client.query("SELECT indexname FROM pg_indexes WHERE indexname='Sprint_one_active'");
    expect(result.rows).toHaveLength(1);
  } finally {
    await client.end();
  }
});
