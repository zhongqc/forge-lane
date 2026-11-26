import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.FORGE_DATABASE_URL ?? 'file:/tmp/forge-unused-development.sqlite' },
});
