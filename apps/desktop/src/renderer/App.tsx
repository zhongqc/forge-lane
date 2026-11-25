import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  defaultSettings,
  settingsSchema,
  type DesktopBridge,
  type Settings,
  type Reply,
  type EnvironmentCheck,
} from '../../../../packages/contracts/src/index';
declare global {
  interface Window {
    forge: DesktopBridge;
  }
}
function unwrap<T>(reply: Reply<T>): T {
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.data;
}
export function App() {
  const snapshot = useQuery({
    queryKey: ['snapshot'],
    queryFn: async () => unwrap(await window.forge.snapshot()),
  });
  const [page, setPage] = useState<'projects' | 'settings'>('projects');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const values = draft ?? snapshot.data?.settings.values ?? defaultSettings;
  const version = editVersion ?? snapshot.data?.settings.version ?? 1;
  const dirty = draft !== null;
  const discardDraft = () => {
    setDraft(null);
    setEditVersion(null);
  };
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<EnvironmentCheck[] | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const requestId = (input: unknown) => {
    const signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    return request.current.id;
  };
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot.data?.settings.values.theme ?? 'system';
    document.documentElement.style.setProperty(
      '--font-size',
      `${snapshot.data?.settings.values.fontSize ?? 14}px`,
    );
  }, [snapshot.data]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || name || path || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, name, path, busy]);
  const navigate = (next: typeof page) => {
    if (busy || page === next) return;
    if ((dirty || name || path) && !window.confirm('有未保存内容，是否放弃并离开？')) return;
    discardDraft();
    setName('');
    setPath('');
    setPage(next);
    setMessage('');
    setError('');
  };
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败，当前输入已保留');
    } finally {
      setBusy(false);
    }
  };
  if (snapshot.isPending)
    return (
      <main className="startup">
        <div className="brand-icon">F</div>
        <h1>正在打开 Forge</h1>
        <p>检查本地数据库并启动 Core…</p>
      </main>
    );
  if (snapshot.isError)
    return (
      <main className="startup">
        <div className="brand-icon">F</div>
        <h1>需要维护</h1>
        <p role="alert" className="error">
          {snapshot.error.message}
        </p>
        <p>未进入业务写入模式。数据库不会被自动重置，请检查数据目录中的 startup.log。</p>
        <button onClick={() => void snapshot.refetch()}>重新连接</button>
      </main>
    );
  const data = snapshot.data;
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((previous) => ({ ...(previous ?? values), [key]: value }));
    setEditVersion(version);
    setChecks(null);
    setMessage('');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">F</span>
          <span>
            Forge<small>DESKTOP</small>
          </span>
        </div>
        <div className="nav-label">工作空间</div>
        <nav aria-label="主导航">
          <button
            aria-label="项目"
            aria-current={page === 'projects' ? 'page' : undefined}
            onClick={() => navigate('projects')}
          >
            项目<span>{data.projects.length}</span>
          </button>
          <button
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
          >
            设置与环境
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> 本地 Core 已连接<small>技术预览 · 本地基础阶段</small>
        </div>
      </aside>
      <main className="content">
        <header className="page-header">
          <div>
            <div className="eyebrow">{page === 'projects' ? 'WORKSPACE' : 'PREFERENCES'}</div>
            <h1>{page === 'projects' ? '项目工作台' : '设置与环境'}</h1>
            <p>
              {page === 'projects'
                ? '连接本地仓库，为新的工程任务准备工作空间。'
                : '管理本地界面与工具路径。设置由 Core 校验后保存。'}
            </p>
          </div>
          <span className="badge">离线可用</span>
        </header>
        <div aria-live="polite" role="status" className={message ? 'notice success' : ''}>
          {message}
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {page === 'projects' ? (
          <>
            <section className="panel">
              <div className="section-heading">
                <h2>导入 Git 仓库</h2>
                <span className="muted">无需 GitHub 或 Codex 登录</span>
              </div>
              <form
                aria-busy={busy}
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform(async () => {
                    const input = { name, path };
                    unwrap(await window.forge.importProject({ ...input, requestId: requestId(input) }));
                    setName('');
                    setPath('');
                    request.current = null;
                    await snapshot.refetch();
                    setMessage('项目已导入。当前为本地管理模式，尚未配置 Agent 执行。');
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    项目名称
                    <input
                      disabled={busy}
                      required
                      maxLength={200}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：我的产品"
                    />
                  </label>
                  <label>
                    仓库路径
                    <div className="input-action">
                      <input
                        disabled={busy}
                        required
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/Users/you/workspace/project"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const selected = await window.forge.chooseRepository();
                            if (selected) setPath(selected);
                          })
                        }
                      >
                        选择文件夹
                      </button>
                    </div>
                  </label>
                </div>
                <div className="form-footer">
                  <p className="muted">支持本地仓库；关联 worktree 会按同一仓库识别。</p>
                  <button className="primary" disabled={busy || !name.trim() || !path.trim()}>
                    {busy ? '处理中…' : '导入项目'}
                  </button>
                </div>
              </form>
            </section>
            <section aria-label="已导入项目">
              <div className="section-heading">
                <h2>你的项目</h2>
                <span className="muted">{data.projects.length} 个项目</span>
              </div>
              {data.projects.length === 0 ? (
                <div className="empty">
                  <div className="empty-symbol">⌘</div>
                  <h3>从一个本地仓库开始</h3>
                  <p>
                    导入后，项目会保存在这台设备上。
                    <br />
                    缺少外部工具不会影响项目管理。
                  </p>
                </div>
              ) : (
                <div className="project-grid">
                  {data.projects.map((project) => (
                    <article key={project.id} className="project-card">
                      <span className="project-icon">{project.name.slice(0, 1).toUpperCase()}</span>
                      <h3>{project.name}</h3>
                      <p className="path">{project.repositoryPath}</p>
                      <span className="badge">本地项目 · 执行未配置</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="scope-note">
              <strong>当前版本</strong>
              <p>已支持项目导入、持久化设置和工具版本检测。任务看板、规划对话与自动执行将在后续阶段接入。</p>
            </div>
          </>
        ) : (
          <>
            <form
              aria-busy={busy}
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const checked = settingsSchema.safeParse(values);
                  if (!checked.success)
                    throw new Error(checked.error.issues.map((i) => i.message).join('；'));
                  const input = { expectedVersion: version, values };
                  unwrap(await window.forge.saveSettings({ ...input, requestId: requestId(input) }));
                  discardDraft();
                  request.current = null;
                  await snapshot.refetch();
                  setMessage('设置已保存');
                });
              }}
            >
              <section className="panel">
                <h2>外观</h2>
                <div className="form-grid">
                  <label>
                    主题
                    <select
                      disabled={busy}
                      value={values.theme}
                      onChange={(e) => update('theme', e.target.value as Settings['theme'])}
                    >
                      <option value="system">跟随系统</option>
                      <option value="light">浅色</option>
                      <option value="dark">深色</option>
                    </select>
                  </label>
                  <label>
                    界面字号
                    <select
                      disabled={busy}
                      value={values.fontSize}
                      onChange={(e) => update('fontSize', Number(e.target.value))}
                    >
                      {[12, 14, 16, 18, 20, 22, 24].map((size) => (
                        <option value={size} key={size}>
                          {size} px
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>本地工具</h2>
                  <span className="muted">留空则从固定目录与 PATH 查找</span>
                </div>
                {(['git', 'gh', 'codex'] as const).map((tool) => (
                  <label key={tool} className="tool-field">
                    {tool} 可执行文件
                    <div className="input-action">
                      <input
                        disabled={busy}
                        value={values[`${tool}Path`]}
                        onChange={(e) => update(`${tool}Path`, e.target.value)}
                        placeholder="自动查找，或指定绝对路径"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const selected = await window.forge.chooseExecutable();
                            if (selected) update(`${tool}Path`, selected);
                          })
                        }
                      >
                        选择文件
                      </button>
                    </div>
                  </label>
                ))}
                <p className="muted">检测只调用 --version，不运行模型、不登录账号、不修改仓库。</p>
              </section>
              <div className="settings-actions">
                <span className="muted">{dirty ? '有未保存的修改' : `已保存 · 版本 ${version}`}</span>
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={() => {
                    if (window.confirm('放弃未保存的设置？')) {
                      discardDraft();
                      setError('');
                    }
                  }}
                >
                  取消修改
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!dirty || window.confirm('重新加载会放弃当前输入，是否继续？')) {
                      discardDraft();
                      void snapshot.refetch();
                    }
                  }}
                >
                  重新加载
                </button>
                <button className="primary" disabled={busy || !dirty}>
                  {busy ? '保存中…' : '保存设置'}
                </button>
              </div>
            </form>
            <section className="panel">
              <div className="section-heading">
                <h2>环境检查</h2>
                <button
                  disabled={busy || dirty}
                  onClick={() =>
                    void perform(async () => setChecks(unwrap(await window.forge.checkEnvironment())))
                  }
                >
                  重新检测
                </button>
              </div>
              {dirty && <p className="muted">请先保存工具路径，再检测环境。</p>}
              {checks ? (
                <ul className="checks">
                  {checks.map((check) => (
                    <li key={check.tool}>
                      <div>
                        <strong>{check.tool}</strong>
                        <span className={`badge ${check.status}`}>
                          {
                            { passed: '版本可用', failed: '需要配置', unknown: '未能确认', warning: '注意' }[
                              check.status
                            ]
                          }
                        </span>
                      </div>
                      <p>{check.detail}</p>
                      <code>{check.path ?? '尚未找到路径'}</code>
                      <small>{new Date(check.checkedAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">尚未检测。工具未配置时，仍可使用本地项目管理。</p>
              )}
            </section>
            <section className="panel">
              <h2>本地数据</h2>
              <p className="path">{data.dataDirectory}</p>
              <p className="muted">
                SQLite 数据库与迁移前备份保存在此处。应用协议 v{data.protocolVersion}
                。当前尚未提供手动恢复和诊断导出界面。
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
