import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthService } from '../auth/auth.service.js';
import { Db } from '../../common/db.js';
import { AccessService } from '../auth/access.service.js';
function escape(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function installShell(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance();
  const dir = resolve('apps/web/dist');
  if (!existsSync(resolve(dir, 'index.html'))) return;
  const html = readFileSync(resolve(dir, 'index.html'), 'utf8');
  server.use('/assets', express.static(resolve(dir, 'assets'), { immutable: true, maxAge: '1y' }));
  server.get('/{*path}', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) return next();
    let title = 'Forge Lane · 研发工作空间',
      description = '让每一次协作都有清晰的下一步。';
    const match = /^\/issues\/([A-Z][A-Z0-9]+)-(\d+)$/.exec(req.path);
    if (match) {
      try {
        const auth = app.get(AuthService);
        const me = await auth.current(req.cookies?.forge_session, req.cookies?.forge_workspace);
        const db = app.get(Db);
        const [i] = await db.client.$queryRaw<{ projectId: string; title: string; description: string }[]>`
          SELECT i."projectId", i.title, left(i.description, 240) AS description
          FROM "Issue" i JOIN "Project" p ON p.id = i."projectId"
          WHERE p.key = ${match[1]} AND p."workspaceId" = ${me.workspace.id}::uuid AND i.number = ${Number(match[2])}
          LIMIT 1`;
        if (i) {
          await app.get(AccessService).project(
            {
              actorId: me.actor.id,
              actorName: me.actor.name,
              workspaceId: me.workspace.id,
              source: 'WEB',
              requestId: 'preview',
            },
            i.projectId,
          );
          title = `${match[1]}-${match[2]} · ${i.title}`;
          description = i.description.replace(/[#*`>[\]]/g, '').slice(0, 180);
        }
      } catch {
        /* Private preview stays generic. */
      }
    }
    res
      .set('Cache-Control', 'private, no-store')
      .type('html')
      .send(
        html.replace(
          '<title>Forge Lane</title>',
          `<title>${escape(title)}</title><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape((process.env.APP_URL ?? 'http://localhost:3001') + req.path)}">`,
        ),
      );
  });
}
