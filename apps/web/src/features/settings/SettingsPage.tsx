import { useState, type FormEvent } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { GitHubSettings } from '../github/GitHubSettings';
import { api } from '../../lib/api';
import { ErrorNotice, SelectField, Avatar } from '../../components/ui';
import type { BoardData, Actor } from '../../../../../packages/shared/src/contracts';
export function SettingsPage({ data }: { data: BoardData }) {
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: members } = useQuery({
    queryKey: ['members', data.project.id],
    queryFn: () =>
      api<(Actor & { role: string | null; workspaceRole: string })[]>(`/projects/${data.project.id}/members`),
  });
  async function save(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await api(path, method, body);
      await qc.invalidateQueries({ queryKey: ['board', data.project.id] });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['members', data.project.id] });
      setMessage('已保存');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function project(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save(
      `/projects/${data.project.id}`,
      { version: data.project.version, ...Object.fromEntries(new FormData(e.currentTarget)) },
      'PATCH',
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SPACE THAT WORKS FOR YOU</div>
          <h1>项目设置</h1>
          <p>保持流程简单，让团队协作更自然。</p>
        </div>
      </div>
      <ErrorNotice error={error} />
      {message && <div className="success-notice">{message}</div>}
      <div className="settings-content">
        <GitHubSettings key={data.project.id} data={data} />
        <section className="settings-card">
          <h2>基本信息</h2>
          <form onSubmit={project}>
            <label>
              项目名称
              <input name="name" defaultValue={data.project.name} required />
            </label>
            <label>
              项目标识
              <input value={data.project.key} disabled />
              <small>创建后不可更改，用于生成事项编号。</small>
            </label>
            <label>
              项目描述
              <textarea name="description" defaultValue={data.project.description} />
            </label>
            <button className="primary" disabled={busy}>
              保存更改
            </button>
          </form>
        </section>
        <section className="settings-card">
          <h2>成员权限</h2>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const email = new FormData(e.currentTarget).get('email') as string;
              try {
                const member = await api<{ actorId: string }>('/workspace/members', 'POST', {
                  email,
                  role: 'MEMBER',
                });
                await save(`/projects/${data.project.id}/members`, {
                  actorId: member.actorId,
                  role: 'MEMBER',
                });
              } catch (error) {
                setError(error);
              }
            }}
          >
            <input name="email" type="email" required placeholder="已注册成员的邮箱" aria-label="成员邮箱" />
            <button className="secondary">添加成员</button>
          </form>
          {members?.map((m) => (
            <div className="settings-row" key={m.id}>
              <Avatar actor={m} />
              <span>{m.name}</span>
              <SelectField
                disabled={m.workspaceRole === 'ADMIN' || busy}
                label={`${m.name}权限`}
                value={m.workspaceRole === 'ADMIN' ? 'ADMIN' : (m.role ?? '')}
                options={[
                  { value: '', label: '未加入项目' },
                  { value: 'MEMBER', label: '项目成员' },
                  { value: 'VIEWER', label: '只读成员' },
                  { value: 'ADMIN', label: '管理员' },
                ]}
                onChange={(role) =>
                  void save(`/projects/${data.project.id}/members`, { actorId: m.id, role: role || 'NONE' })
                }
              />
            </div>
          ))}
        </section>
        <section className="settings-card">
          <h2>工作流与看板映射</h2>
          <p className="muted">列表示流程阶段，状态表示当前工作的具体位置。</p>
          {data.statuses.map((s) => (
            <div className="settings-row" key={s.id}>
              <span className={`status-dot category-${s.category}`} />
              <input
                key={`${s.id}-${s.name}`}
                aria-label={`状态名称 ${s.name}`}
                defaultValue={s.name}
                maxLength={40}
                disabled={busy}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== s.name)
                    void save(
                      `/projects/${data.project.id}/statuses/${s.id}`,
                      {
                        name,
                        category: s.category,
                        columnId: data.columns.find((c) => c.statuses.some((m) => m.statusId === s.id))!.id,
                        version: data.project.version,
                      },
                      'PATCH',
                    );
                }}
              />
              {[
                { delta: -1, icon: ArrowUp, label: '上移' },
                { delta: 1, icon: ArrowDown, label: '下移' },
              ].map(({ delta, icon: Icon, label }) => (
                <button
                  key={delta}
                  className="icon-button"
                  aria-label={`${label} ${s.name}`}
                  disabled={
                    busy ||
                    data.statuses.indexOf(s) + delta < 0 ||
                    data.statuses.indexOf(s) + delta >= data.statuses.length
                  }
                  onClick={() =>
                    void save(
                      `/projects/${data.project.id}/statuses/${s.id}`,
                      {
                        name: s.name,
                        category: s.category,
                        columnId: data.columns.find((c) => c.statuses.some((m) => m.statusId === s.id))!.id,
                        version: data.project.version,
                        sortOrder: data.statuses.indexOf(s) + delta,
                      },
                      'PATCH',
                    )
                  }
                >
                  <Icon size={13} />
                </button>
              ))}
              <SelectField
                label={`${s.name}所在列`}
                value={data.columns.find((c) => c.statuses.some((m) => m.statusId === s.id))?.id}
                options={data.columns.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(columnId) =>
                  void save(
                    `/projects/${data.project.id}/statuses/${s.id}`,
                    { name: s.name, category: s.category, columnId, version: data.project.version },
                    'PATCH',
                  )
                }
              />
              <button
                className="icon-button"
                aria-label={`删除状态 ${s.name}`}
                onClick={() =>
                  void save(`/projects/${data.project.id}/statuses/${s.id}`, undefined, 'DELETE')
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(`/projects/${data.project.id}/statuses`, {
                version: data.project.version,
                name: f.get('name'),
                category: f.get('category'),
                columnId: data.columns[0].id,
              });
            }}
          >
            <input name="name" placeholder="新状态名称" required />
            <select name="category" aria-label="新状态分类">
              <option value="TODO">待办</option>
              <option value="IN_PROGRESS">进行中</option>
              <option value="DONE">完成</option>
            </select>
            <button className="secondary" disabled={busy}>
              <Plus size={14} />
              添加状态
            </button>
          </form>
        </section>
        <section className="settings-card">
          <h2>标签</h2>
          <div className="label-list">
            {data.labels.map((l) => (
              <span className="label-tag" key={l.id}>
                {l.name}
              </span>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                `/projects/${data.project.id}/labels`,
                Object.fromEntries(new FormData(e.currentTarget)),
              );
            }}
          >
            <input name="name" placeholder="添加项目标签" required maxLength={40} />
            <button className="secondary" disabled={busy}>
              <Plus size={14} />
              添加标签
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
