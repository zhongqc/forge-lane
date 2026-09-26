import { AccountMenu } from '../components/AccountMenu';
import { NotificationInbox } from '../features/mentions/NotificationInbox';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Layers3,
  LayoutDashboard,
  ListTodo,
  List,
  Settings,
  Zap,
  Plus,
  ChevronDown,
  PanelLeftClose,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { SelectField, ErrorNotice, Loading, Modal } from '../components/ui';
import { LoginPage } from './LoginPage';
import { BoardPage } from '../features/board/BoardPage';
import { BacklogPage } from '../features/backlog/BacklogPage';
import { IssueListPage } from '../features/issues/IssueListPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { IssueDrawer } from '../features/issues/IssueDrawer';
import { CreateIssueDialog } from '../features/issues/CreateIssueDialog';
import type { Actor, BoardData, Project, Issue, IssueType } from '../../../../packages/shared/src/contracts';
import webPackage from '../../package.json';
interface Me {
  actor: Actor;
  workspace: { id: string; name: string };
  role: string;
  email: string;
}
const nav = [
  { id: 'board', name: '看板', icon: LayoutDashboard },
  { id: 'backlog', name: 'Backlog', icon: ListTodo },
  { id: 'issues', name: '所有事项', icon: List },
  { id: 'epics', name: 'Epics', icon: Zap },
  { id: 'settings', name: '项目设置', icon: Settings },
];
export function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [projectId, setProjectId] = useState('');
  const [lastView, setView] = useState('board');
  const viewMatch = /^\/projects\/[^/]+\/(board|backlog|issues|epics|settings)/.exec(location.pathname);
  const view = viewMatch?.[1] ?? lastView;
  const projectKey =
    /^\/projects\/([^/]+)/.exec(location.pathname)?.[1] ??
    /^\/issues\/([A-Z][A-Z0-9]+)-/.exec(location.pathname)?.[1];
  const [createProject, setCreateProject] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projectError, setProjectError] = useState<unknown>();
  const [createIssue, setCreateIssue] = useState<{
    statusId?: string;
    type?: IssueType;
    sprintId?: string;
  } | null>(null);
  const [sidebar, setSidebar] = useState(true);
  useEffect(() => {
    const expired = () => {
      qc.clear();
      window.location.reload();
    };
    window.addEventListener('forge:auth-expired', expired);
    return () => window.removeEventListener('forge:auth-expired', expired);
  }, [qc]);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false });
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    enabled: !!me.data,
    queryFn: () => api<{ workspace: { id: string; name: string } }[]>('/workspaces'),
    retry: false,
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    enabled: !!me.data,
  });
  const selected =
    projects.data?.find((p) => p.key === projectKey) ??
    projects.data?.find((p) => p.id === projectId) ??
    projects.data?.[0];
  const board = useQuery({
    queryKey: ['board', selected?.id],
    queryFn: () => api<BoardData>(`/projects/${selected!.id}/board`),
    enabled: !!selected,
    refetchInterval: 30000,
  });
  const openGlobalCreate = useCallback(() => {
    if (!board.data?.permissions.canWrite) return;
    setCreateIssue({
      type: view === 'epics' ? 'EPIC' : 'TASK',
      sprintId: view === 'board' ? board.data.sprints.find((s) => s.status === 'ACTIVE')?.id : undefined,
    });
  }, [board.data, view]);
  const match = /^\/issues\/([^/]+)$/.exec(location.pathname);
  const issueKey = match?.[1];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.matches('input,textarea,[contenteditable="true"]') ||
        el.closest('[contenteditable="true"]') ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && board.data?.permissions.canWrite) {
        e.preventDefault();
        openGlobalCreate();
      }
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search-input input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [board.data, openGlobalCreate]);
  if (me.isPending) return <Loading />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401)
      return (
        <LoginPage
          onLogin={() => {
            qc.clear();
            window.location.reload();
          }}
        />
      );
    return (
      <div className="fatal-state">
        <ErrorNotice error={me.error} />
        <button className="primary" onClick={() => void me.refetch()}>
          重新连接
        </button>
      </div>
    );
  }
  async function submitProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setProjectError(null);
    try {
      const p = await api<Project>('/projects', 'POST', Object.fromEntries(new FormData(e.currentTarget)));
      await qc.invalidateQueries({ queryKey: ['projects'] });
      setProjectId(p.id);
      setCreateProject(false);
      setView('board');
    } catch (e) {
      setProjectError(e);
    } finally {
      setCreating(false);
    }
  }
  const open = (i: Issue) => navigate(`/issues/${i.key}`, { state: { background: location.pathname } });
  return (
    <div className={`app-shell ${!sidebar ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={18} />
          </span>
          Forge Lane
          <button className="icon-button" aria-label="收起侧边栏" onClick={() => setSidebar(false)}>
            <PanelLeftClose size={15} />
          </button>
        </div>
        <div className="workspace-picker">
          <span className="workspace-avatar">{me.data?.workspace.name.slice(0, 1)}</span>
          <span>
            <strong>{me.data?.workspace.name}</strong>
          </span>
        </div>
        {(workspaces.data?.length ?? 0) > 1 && (
          <SelectField
            label="切换工作区"
            value={me.data?.workspace.id}
            options={workspaces.data!.map((m) => ({ value: m.workspace.id, label: m.workspace.name }))}
            onChange={(workspaceId) =>
              void api('/workspaces/select', 'POST', { workspaceId }).then(() => window.location.reload())
            }
          />
        )}
        <div className="sidebar-label projects-label">
          项目
          <button
            className="icon-button"
            aria-label="创建项目"
            disabled={me.data?.role !== 'ADMIN'}
            onClick={() => setCreateProject(true)}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="project-switcher">
          {projects.data?.map((p) => (
            <button
              key={p.id}
              className={selected?.id === p.id ? 'active' : ''}
              onClick={() => {
                setProjectId(p.id);
                setView('board');
                void navigate(`/projects/${p.key}`);
              }}
            >
              <span>{p.key.slice(0, 1)}</span>
              {p.name}
              {selected?.id === p.id && <ChevronDown size={13} />}
            </button>
          ))}
        </div>
        {selected && (
          <nav>
            {nav
              .filter((n) => n.id !== 'settings' || board.data?.permissions?.canAdmin)
              .map((n) => (
                <button
                  key={n.id}
                  className={view === n.id ? 'active' : ''}
                  onClick={() => {
                    setView(n.id);
                    void navigate(`/projects/${selected.key}/${n.id}`);
                  }}
                >
                  <n.icon size={16} />
                  {n.name}
                  {n.id === 'board' && <span className="nav-dot" />}
                </button>
              ))}
          </nav>
        )}
        <small className="sidebar-version">v{webPackage.version}</small>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          {!sidebar && (
            <button className="icon-button" onClick={() => setSidebar(true)} aria-label="展开侧边栏">
              <Layers3 size={18} />
            </button>
          )}
          <span>{me.data?.workspace.name}</span>
          <span className="breadcrumb-slash">/</span>
          <strong>{selected?.name ?? '项目'}</strong>
          <span className="breadcrumb-slash">/</span>
          <span>{nav.find((n) => n.id === view)?.name}</span>
          <div className="toolbar-spacer" />
          <small className="mobile-version">v{webPackage.version}</small>
          <NotificationInbox />
          <button
            className="primary global-create"
            aria-label="创建事项"
            disabled={!board.data?.permissions.canWrite}
            onClick={openGlobalCreate}
            title={!selected ? '请先创建项目' : '在当前项目创建事项（C）'}
          >
            <Plus size={15} /> 创建 <kbd>C</kbd>
          </button>
          <AccountMenu account={me.data} />
        </header>
        {selected && (
          <nav className="mobile-nav" aria-label="项目导航">
            {nav
              .filter((n) => n.id !== 'settings' || board.data?.permissions?.canAdmin)
              .map((n) => (
                <button
                  key={n.id}
                  className={view === n.id ? 'active' : ''}
                  onClick={() => {
                    setView(n.id);
                    void navigate(`/projects/${selected.key}/${n.id}`);
                  }}
                >
                  <n.icon size={15} />
                  {n.name}
                </button>
              ))}
          </nav>
        )}
        <main className="main-content">
          {projects.isPending ? (
            <Loading />
          ) : projects.error ? (
            <ErrorNotice error={projects.error} />
          ) : !selected ? (
            <div className="welcome">
              <span className="welcome-icon">
                <Layers3 size={36} />
              </span>
              <span className="eyebrow">A NEW CHAPTER STARTS HERE</span>
              <h1>
                给你的下一个想法
                <br />
                一个开始的地方。
              </h1>
              <p>创建项目，组织工作，和团队一起推进每个重要的细节。</p>
              <button className="primary" onClick={() => setCreateProject(true)}>
                <Plus size={16} />
                创建项目
              </button>
            </div>
          ) : board.isPending ? (
            <Loading />
          ) : board.error ? (
            <ErrorNotice error={board.error} />
          ) : board.data ? (
            <>
              {view === 'board' ? (
                <BoardPage
                  key={board.data.project.id}
                  data={board.data}
                  actorId={me.data!.actor.id}
                  onOpen={open}
                />
              ) : view === 'backlog' ? (
                <BacklogPage
                  data={board.data}
                  onOpen={open}
                  onCreate={(sprintId) => setCreateIssue({ sprintId })}
                />
              ) : view === 'settings' ? (
                board.data.permissions.canAdmin ? (
                  <SettingsPage data={board.data} />
                ) : (
                  <p>只有项目管理员可以修改设置。</p>
                )
              ) : (
                <IssueListPage data={board.data} onOpen={open} epics={view === 'epics'} />
              )}
            </>
          ) : null}
        </main>
      </div>
      <Modal open={createProject} onOpenChange={setCreateProject} title="创建项目">
        <form onSubmit={submitProject}>
          <p className="muted">每个项目拥有独立的看板、工作流和迭代。</p>
          <label>
            项目名称
            <input name="name" autoFocus required maxLength={80} placeholder="例如：Mobile App" />
          </label>
          <label>
            项目标识
            <input
              name="key"
              required
              minLength={2}
              maxLength={12}
              pattern="[A-Z][A-Z0-9]{1,11}"
              placeholder="例如：APP"
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
              }}
            />
            <small>2–12 位大写字母或数字，字母开头。事项编号如 APP-1。</small>
          </label>
          <ErrorNotice error={projectError} />
          <footer className="modal-footer">
            <button className="secondary" type="button" onClick={() => setCreateProject(false)}>
              取消
            </button>
            <button className="primary" disabled={creating}>
              {creating ? '创建中…' : '创建项目'}
            </button>
          </footer>
        </form>
      </Modal>
      {createIssue && board.data && (
        <CreateIssueDialog
          key={`${createIssue.statusId}-${createIssue.type}`}
          data={board.data}
          open
          statusId={createIssue.statusId}
          initialType={createIssue.type}
          initialSprintId={createIssue.sprintId}
          onClose={() => setCreateIssue(null)}
        />
      )}
      {issueKey && (
        <IssueDrawer
          key={issueKey}
          issueKey={issueKey}
          data={board.data}
          onClose={() => navigate(selected ? `/projects/${selected.key}/${view}` : '/')}
          onOpen={open}
        />
      )}
    </div>
  );
}
