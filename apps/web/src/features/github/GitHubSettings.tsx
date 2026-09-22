import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { ErrorNotice } from '../../components/ui';
import type { BoardData } from '../../../../../packages/shared/src/contracts';
import type {
  GitHubSettings as Settings,
  GitHubRepository,
  GitHubRule,
} from '../../../../../packages/shared/src/github';
import { githubUrl } from './IssueDevelopment';
const events: { event: GitHubRule['event']; label: string }[] = [
  { event: 'OPENED', label: 'PR 打开时' },
  { event: 'REVIEW_REQUESTED', label: '请求评审时' },
  { event: 'MERGED', label: '所有关联 PR 合并时' },
];
export function GitHubSettings({ data }: { data: BoardData }) {
  const qc = useQueryClient();
  const path = `/projects/${data.project.id}/github`;
  const query = useQuery({
    queryKey: ['github', data.project.id],
    queryFn: () => api<Settings>(path),
    refetchInterval: (query) => (query.state.data?.repositories.some((r) => r.syncing) ? 3000 : false),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState('');
  async function save(suffix: string, body: unknown, method: string, success: string) {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await api(path + suffix, method, body);
      await qc.invalidateQueries({ queryKey: ['github', data.project.id] });
      await qc.invalidateQueries({ queryKey: ['development'] });
      setMessage(success);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const settings = query.data;
  return (
    <section className="settings-card github-settings">
      <h2>
        <GitBranch size={19} /> GitHub
      </h2>
      <p className="muted">
        在分支名、PR 标题或正文、提交消息中包含事项编号（如 {data.project.key}-123），即可自动关联开发进展。
      </p>
      <ErrorNotice error={query.error || error} />
      {query.isError && (
        <button className="secondary" onClick={() => void query.refetch()}>
          重新加载
        </button>
      )}
      {query.isPending && (
        <p className="muted" role="status">
          正在加载 GitHub 连接…
        </p>
      )}
      {message && (
        <p className="success-notice" role="status">
          {message}
        </p>
      )}
      {settings && (
        <>
          <details className="github-setup" open={!settings.configured || !settings.webhookConfigured}>
            <summary>
              {settings.configured && settings.webhookConfigured
                ? 'GitHub App 已配置 · 查看连接指引'
                : '配置 GitHub App'}
            </summary>
            <p>由部署管理员在服务端配置 GitHub App ID、私钥和 Webhook secret。密钥无需填写到此页面。</p>
            <p>
              App 仓库权限：Metadata、Contents、Pull requests 只读。订阅
              pull_request、push、installation_repositories、installation 事件。
            </p>
            <p>
              部署管理员还需通过 GITHUB_INSTALLATION_PROJECTS 指定项目允许连接的安装 ID，
              连接仓库前请先配置此授权映射。
            </p>
            <label>
              当前项目 ID
              <input value={data.project.id} readOnly onFocus={(e) => e.target.select()} />
            </label>
            <label>
              授权映射格式（将 123456 替换为实际 Installation ID）
              <input
                value={JSON.stringify({ [data.project.id]: ['123456'] })}
                readOnly
                onFocus={(e) => e.target.select()}
              />
            </label>
            <label>
              Webhook 地址
              <input value={settings.webhookUrl} readOnly onFocus={(e) => e.target.select()} />
            </label>
            <p className="muted">
              Webhook 需能被 GitHub 访问，Content type 选择 application/json，并使用服务端配置的同一 secret。
            </p>
            {settings.appUrl && githubUrl(settings.appUrl) && (
              <a href={settings.appUrl} target="_blank" rel="noreferrer">
                安装 GitHub App <ExternalLink size={12} />
              </a>
            )}
            {!settings.webhookConfigured && (
              <p className="error-notice">Webhook 尚未配置，自动同步暂不可用。</p>
            )}
          </details>
          {settings.configured && (
            <form
              className="github-connect"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                if (
                  await save(
                    '',
                    {
                      fullName: (f.get('fullName') as string).trim(),
                      installationId: (f.get('installationId') as string).trim(),
                    },
                    'POST',
                    '仓库已连接，首次同步已排队。',
                  )
                )
                  form.reset();
              }}
            >
              <label>
                仓库
                <input
                  name="fullName"
                  placeholder="owner/repo"
                  pattern="[^\/\s]+/[^\/\s]+"
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Installation ID
                <input
                  name="installationId"
                  placeholder="如 123456"
                  pattern="[0-9]+"
                  inputMode="numeric"
                  required
                  disabled={busy}
                />
                <small>可在 GitHub App 安装设置页面的地址末尾找到。</small>
              </label>
              <button className="primary" disabled={busy}>
                连接仓库
              </button>
            </form>
          )}
          {!settings.repositories.length && (
            <p className="muted">尚未连接仓库。安装 App 并授予仓库访问权限后，即可添加连接。</p>
          )}
          {settings.repositories.map((repo) => (
            <Repository
              key={repo.id}
              repo={repo}
              statuses={data.statuses}
              busy={busy}
              save={save}
              configured={settings.configured}
            />
          ))}
        </>
      )}
    </section>
  );
}
function Repository({
  repo,
  statuses,
  busy,
  save,
  configured,
}: {
  repo: GitHubRepository;
  statuses: BoardData['statuses'];
  busy: boolean;
  configured: boolean;
  save: (suffix: string, body: unknown, method: string, success: string) => Promise<boolean>;
}) {
  return (
    <article className="github-repository">
      <div className="github-repository-heading">
        <strong>{repo.fullName}</strong>
        <span className="muted">{repo.enabled ? '已连接' : '已停用 · 历史关联保留'}</span>
      </div>
      <div className="github-sync-row">
        <span className="muted" role="status">
          {repo.syncing
            ? '同步中…'
            : repo.lastSyncedAt
              ? `上次同步：${new Date(repo.lastSyncedAt).toLocaleString('zh-CN')}`
              : '尚未完成首次同步'}
        </span>
        <button
          className="secondary small"
          disabled={busy || repo.syncing || !repo.enabled || !configured}
          onClick={() => void save(`/${repo.id}/sync`, {}, 'POST', '同步已排队。')}
        >
          <RefreshCw size={13} className={repo.syncing ? 'spin' : ''} />
          立即同步
        </button>
        <button
          className="text-button"
          disabled={busy || (!repo.enabled && !configured)}
          onClick={() =>
            void save(
              `/${repo.id}`,
              { enabled: !repo.enabled },
              'PATCH',
              repo.enabled ? '连接已停用，历史关联已保留。' : '连接已启用。',
            )
          }
        >
          {repo.enabled ? '停用连接' : '启用连接'}
        </button>
      </div>
      {repo.lastError && <ErrorNotice error={repo.lastError} />}
      <details>
        <summary>状态自动化规则</summary>
        <p className="muted">
          默认关闭，仅推进所选来源状态的事项。首次导入不触发规则；合并规则要求该事项所有关联 PR 均已合并。Epic
          不参与关联。
        </p>
        <Rules
          key={JSON.stringify(repo.rules)}
          repo={repo}
          statuses={statuses}
          disabled={busy || !repo.enabled}
          save={save}
        />
      </details>
    </article>
  );
}
function Rules({
  repo,
  statuses,
  disabled,
  save,
}: {
  repo: GitHubRepository;
  statuses: BoardData['statuses'];
  disabled: boolean;
  save: (suffix: string, body: unknown, method: string, success: string) => Promise<boolean>;
}) {
  const [rules, setRules] = useState<GitHubRule[]>(
    events.map(
      ({ event }) =>
        repo.rules.find((r) => r.event === event) ?? {
          event,
          enabled: false,
          fromStatusIds: [],
          targetStatusId: '',
        },
    ),
  );
  function change(index: number, value: Partial<GitHubRule>) {
    setRules((current) => current.map((r, i) => (i === index ? { ...r, ...value } : r)));
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(`/${repo.id}`, { rules }, 'PATCH', '自动化规则已保存。');
      }}
    >
      <fieldset disabled={disabled} className="github-rules">
        {rules.map((rule, index) => (
          <div className="github-rule" key={rule.event}>
            <label className="github-check">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => change(index, { enabled: e.target.checked })}
              />
              {events[index].label}
            </label>
            <div className="github-rule-fields">
              <fieldset disabled={!rule.enabled}>
                <legend>允许的来源状态（可多选）</legend>
                <div className="github-status-options">
                  {statuses.map((status) => (
                    <label className="github-check" key={status.id}>
                      <input
                        type="checkbox"
                        checked={rule.fromStatusIds.includes(status.id)}
                        onChange={(e) =>
                          change(index, {
                            fromStatusIds: e.target.checked
                              ? [...rule.fromStatusIds, status.id]
                              : rule.fromStatusIds.filter((id) => id !== status.id),
                          })
                        }
                      />
                      {status.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                目标状态
                <select
                  value={rule.targetStatusId}
                  disabled={!rule.enabled}
                  required={rule.enabled}
                  onChange={(e) => change(index, { targetStatusId: e.target.value })}
                >
                  <option value="">选择状态</option>
                  {statuses.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
        <button
          className="secondary"
          disabled={rules.some((r) => r.enabled && (!r.fromStatusIds.length || !r.targetStatusId))}
        >
          保存规则
        </button>
      </fieldset>
    </form>
  );
}
