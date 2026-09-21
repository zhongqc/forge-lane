import { createDatabase } from './client.js';
import { hash } from 'bcryptjs';
import { DEFAULT_COLUMNS } from '../../../apps/server/src/modules/project/project.service.js';
const db = createDatabase();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10)
  throw new Error('请设置至少 10 位的 SEED_PASSWORD。演示账户不会在生产自动创建。');
const email = process.env.SEED_EMAIL ?? 'demo@forge.local';
try {
  if (await db.user.findUnique({ where: { email } })) {
    console.log('演示账户已存在，未覆盖已有数据。');
  } else
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await hash(password, 12),
          actor: { create: { name: '林予安', color: '#8f81b8' } },
        },
        include: { actor: true },
      });
      const actor = user.actor!;
      const workspace = await tx.workspace.create({
        data: {
          name: 'Acme Studio',
          slug: `acme-${Date.now()}`,
          members: { create: { actorId: actor.id, role: 'ADMIN' } },
        },
      });
      const actors = [actor];
      for (const [name, color] of [
        ['陈念', '#bd8a78'],
        ['周行', '#7ea29f'],
        ['苏禾', '#829db7'],
      ]) {
        const a = await tx.actor.create({
          data: {
            name,
            color,
            kind: 'HUMAN',
            memberships: { create: { workspaceId: workspace.id, role: 'MEMBER' } },
          },
        });
        actors.push(a);
      }
      const project = await tx.project.create({
        data: {
          key: 'APP',
          name: 'Mobile App',
          workspaceId: workspace.id,
          description: '让连接更自然，让每一次升级更可靠。',
          issueCounter: 18,
          members: {
            create: actors.map((a) => ({
              actorId: a.id,
              role: a.id === actor.id ? ('ADMIN' as const) : ('MEMBER' as const),
            })),
          },
        },
      });
      const statuses = [];
      let order = 0;
      for (const [index, col] of DEFAULT_COLUMNS.entries()) {
        const c = await tx.boardColumn.create({
          data: { projectId: project.id, name: col.name, sortOrder: index },
        });
        for (const [name, category] of col.statuses) {
          const s = await tx.status.create({
            data: { projectId: project.id, name, category, sortOrder: order++ },
          });
          statuses.push(s);
          await tx.boardColumnStatus.create({
            data: { projectId: project.id, columnId: c.id, statusId: s.id, sortOrder: s.sortOrder },
          });
        }
      }
      const sprint = await tx.sprint.create({
        data: {
          projectId: project.id,
          name: 'Sprint 01 · 更好的连接',
          goal: '完善设备升级体验，提升连接稳定性',
          status: 'ACTIVE',
          startAt: new Date(),
          endAt: new Date(Date.now() + 14 * 86400000),
        },
      });
      await tx.sprint.create({
        data: { projectId: project.id, name: 'Sprint 02 · 体验打磨', goal: '收敛反馈，打磨产品细节' },
      });
      const epic1 = await tx.issue.create({
        data: {
          projectId: project.id,
          number: 1,
          type: 'EPIC',
          title: 'OTA 固件升级',
          description: '让用户安心、顺畅地完成每一次设备升级。',
          statusId: statuses[2].id,
          reporterId: actor.id,
          assigneeId: actor.id,
        },
      });
      const epic2 = await tx.issue.create({
        data: {
          projectId: project.id,
          number: 2,
          type: 'EPIC',
          title: '连接体验优化',
          description: '提升蓝牙连接的可靠性与响应速度。',
          statusId: statuses[2].id,
          reporterId: actor.id,
          assigneeId: actors[2].id,
        },
      });
      const fixtures = [
        ['STORY', '支持设备固件在线升级', 0, 1, 'HIGH', 5],
        ['TASK', '梳理固件版本兼容策略', 0, 0, 'MEDIUM', 3],
        ['BUG', '修复低电量升级提示缺失', 1, 1, 'HIGH', 2],
        ['STORY', '展示实时升级进度与预计时间', 2, 1, 'MEDIUM', 5],
        ['TASK', '实现固件完整性校验', 2, 1, 'HIGH', 3],
        ['BUG', '蓝牙重连后状态未及时刷新', 2, 2, 'URGENT', 2],
        ['TASK', '统一设备连接错误码', 3, 2, 'LOW', 3],
        ['STORY', '增加升级失败后的重试入口', 3, 1, 'MEDIUM', 5],
        ['BUG', '修复 App 切至后台导致 OTA 中断', 4, 1, 'HIGH', 3],
        ['STORY', '优化首次配对引导流程', 5, 2, 'MEDIUM', 5],
        ['TASK', '补充蓝牙断连场景回归测试', 5, 2, 'LOW', 2],
        ['STORY', '设备列表支持下拉刷新', 7, 2, 'MEDIUM', 3],
        ['TASK', '完善升级日志埋点', 7, 1, 'LOW', 2],
        ['TASK', '评估多设备并发连接方案', 0, 2, 'NONE', null],
        ['STORY', '允许用户查看历史固件版本', 0, 1, 'LOW', null],
        ['TASK', '整理团队研发流程说明', 1, 0, 'NONE', 1],
      ] as const;
      for (const [index, [type, title, status, epic, priority, estimate]] of fixtures.entries()) {
        const i = await tx.issue.create({
          data: {
            projectId: project.id,
            number: index + 3,
            type,
            title,
            description:
              index === 0
                ? '## 背景\n\n用户需要在 App 内方便地完成设备固件升级，无需额外工具。\n\n## 验收标准\n\n- [ ] 检查当前固件版本与可用更新\n- [ ] 升级前验证设备电量与连接状态\n- [ ] 展示升级进度，支持失败重试\n\n> 升级过程中保持连接，避免设备进入休眠。\n\n```typescript\nawait device.upgrade(firmware);\n```'
                : '',
            statusId: statuses[status].id,
            priority,
            assigneeId: index === 1 || index === 13 ? null : actors[index % 4].id,
            reporterId: actor.id,
            epicId: epic === 1 ? epic1.id : epic === 2 ? epic2.id : null,
            sprintId: index < 13 ? sprint.id : null,
            estimate,
            boardOrder: (index + 1) * 1000,
            backlogOrder: (index + 1) * 1000,
          },
        });
        await tx.activity.create({
          data: {
            workspaceId: workspace.id,
            projectId: project.id,
            issueId: i.id,
            actorId: actor.id,
            actorNameSnapshot: actor.name,
            source: 'SYSTEM',
            type: 'CREATED',
            requestId: `seed-${i.id}`,
            issueVersion: 1,
            payload: { title: i.title, type: i.type },
          },
        });
        await tx.descriptionRevision.create({
          data: { issueId: i.id, actorId: actor.id, version: 1, markdown: i.description },
        });
      }
      for (const [name, color] of [
        ['前端', '#8d7dbc'],
        ['设备', '#72a095'],
        ['体验优化', '#c79675'],
      ])
        await tx.label.create({ data: { projectId: project.id, name, color } });
    });
  console.log(`演示工作区已就绪，登录邮箱：${email}`);
} finally {
  await db.$disconnect();
}
