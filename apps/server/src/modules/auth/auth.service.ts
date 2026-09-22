import { Injectable, Inject } from '@nestjs/common';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import type { RegisterDto, LoginDto } from './auth.dto.js';
@Injectable()
export class AuthService {
  constructor(@Inject(Db) private db: Db) {}
  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, 12);
    const user = await this.db.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, actor: { create: { name: input.name.trim() } } },
        include: { actor: true },
      });
      await tx.workspace.create({
        data: {
          name: input.workspaceName?.trim() || '我的工作区',
          slug: randomUUID(),
          members: { create: { actorId: user.actor!.id, role: 'ADMIN' } },
        },
      });
      return user;
    });
    return this.session(user.id);
  }
  async login(input: LoginDto) {
    const user = await this.db.client.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: { actor: true },
    });
    if (!user || !user.actor?.active || !(await compare(input.password, user.passwordHash)))
      fail(401, '邮箱或密码不正确', 'INVALID_CREDENTIALS');
    return this.session(user.id);
  }
  private async session(userId: string) {
    const token = randomBytes(32).toString('hex');
    await this.db.client.session.create({
      data: { id: this.digest(token), userId, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    return token;
  }
  digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  async current(token: string | undefined, workspaceId?: string) {
    if (!token) fail(401, '请先登录', 'UNAUTHENTICATED');
    const session = await this.db.client.session.findUnique({
      where: { id: this.digest(token) },
      include: {
        user: { include: { actor: { include: { memberships: { include: { workspace: true } } } } } },
      },
    });
    if (!session || session.expiresAt < new Date() || !session.user.actor?.active)
      fail(401, '登录已过期，请重新登录', 'UNAUTHENTICATED');
    const actor = session.user.actor;
    const membership = actor.memberships.find((m) => m.workspaceId === workspaceId) ?? actor.memberships[0];
    if (!membership) fail(403, '没有工作区访问权限');
    return {
      actor: { id: actor.id, name: actor.name, color: actor.color, kind: actor.kind },
      workspace: membership.workspace,
      role: membership.role,
      email: session.user.email,
    };
  }
  async bearer(raw: string) {
    const token = await this.db.client.apiToken.findUnique({
      where: { digest: this.digest(raw) },
      include: { actor: true, workspace: true },
    });
    if (!token || token.revokedAt || token.expiresAt <= new Date() || !token.actor.active)
      fail(401, '令牌已失效', 'UNAUTHENTICATED');
    const member = await this.db.client.workspaceMember.findUnique({
      where: { workspaceId_actorId: { workspaceId: token.workspaceId, actorId: token.actorId } },
    });
    if (!member) fail(401, '令牌已失效', 'UNAUTHENTICATED');
    return {
      actor: { id: token.actor.id, name: token.actor.name, color: token.actor.color, kind: token.actor.kind },
      workspace: token.workspace,
      token: {
        id: token.id,
        name: token.name,
        projectIds: token.projectIds,
        scopes: token.scopes,
        expiresAt: token.expiresAt,
      },
    };
  }
  async logout(token?: string) {
    if (token) await this.db.client.session.deleteMany({ where: { id: this.digest(token) } });
  }
}
