import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { History, Users, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { api } from '../../lib/api';
import { ErrorNotice, Modal, SelectField, Loading } from '../../components/ui';
import type { BoardData, SprintOverview as Overview } from '../../../../../packages/shared/src/contracts';
function OverviewContent({
  id,
  refresh,
  showIssues = false,
}: {
  id: string;
  refresh?: unknown;
  showIssues?: boolean;
}) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['sprint-overview', id],
    queryFn: () => api<Overview>(`/sprints/${id}/overview`),
  });
  const { refetch } = query;
  useEffect(() => {
    void refetch();
  }, [refresh, refetch]);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} />;
  const data = query.data!;
  return (
    <div className="sprint-overview-content">
      {showIssues && (
        <>
          <p className="sprint-goal">{data.sprint.goal || '未设置 Sprint 目标'}</p>
          <p className="muted">
            {data.sprint.startAt
              ? new Date(data.sprint.startAt).toLocaleDateString('zh-CN')
              : '未记录开始日期'}{' '}
            — {data.sprint.endAt ? new Date(data.sprint.endAt).toLocaleDateString('zh-CN') : '未记录结束日期'}
            {data.snapshotAt ? ' · 结束时快照' : ''}
          </p>
        </>
      )}
      {!data.completeSnapshot && (
        <p className="sprint-history-warning" role="note">
          这期 Sprint 完成时尚未保存快照。以下仅包含目前仍关联的事项及其当前字段，不代表当时完整结果。
        </p>
      )}
      <p className="muted">
        按 Story / Task / Bug 统计，不重复计算子任务；未估点不等于 0 点。
        {!showIssues && '统计整个 Sprint，不受看板筛选影响。'}
      </p>
      <div className="sprint-points-scroll">
        <table className="sprint-points-table" aria-label="成员 Story Point 统计">
          <thead>
            <tr>
              <th>成员</th>
              <th>事项</th>
              <th>总 SP</th>
              <th>已完成 SP</th>
              <th>剩余 SP</th>
              <th>未估点事项</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.actorId ?? 'unassigned'}>
                <th scope="row">{m.name}</th>
                <td>{m.issues}</td>
                <td>{m.total}</td>
                <td>{m.completed}</td>
                <td>{m.remaining}</td>
                <td>{m.unestimated || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.issues.length && <p className="muted">这期 Sprint 暂无可统计事项。</p>}
      {showIssues && (
        <div className="sprint-history-issues">
          <h3>事项 · {data.issues.length}</h3>
          {data.issues.map((i) => (
            <button key={i.id} onClick={() => void navigate(`/issues/${i.key}`)}>
              <span>{i.key}</span>
              <strong>{i.title}</strong>
              <span>{i.assigneeName}</span>
              <span>{i.estimate === null ? '未估点' : `${i.estimate} SP`}</span>
              <span className={i.done ? 'sprint-done' : ''}>
                {i.statusName}
                {!i.done && data.completeSnapshot ? ' · 未完成' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function CurrentSprintPoints({
  data,
  presentation = 'inline',
}: {
  data: BoardData;
  presentation?: 'inline' | 'drawer';
}) {
  const [open, setOpen] = useState(false);
  const sprint = data.sprints.find((s) => s.status === 'ACTIVE');
  if (!sprint) return null;
  if (presentation === 'drawer')
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            className="filter-chip sprint-points-button"
            aria-label="成员 Story Points"
            title="查看当前 Sprint 的成员 Story Points"
          >
            <Users size={14} /> Story Points
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="issue-drawer sprint-points-drawer">
            <header className="drawer-top">
              <Dialog.Title>成员 Story Points</Dialog.Title>
              <Dialog.Close asChild>
                <button className="icon-button" aria-label="关闭成员统计">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </header>
            <div className="sprint-points-body">
              <Dialog.Description className="sprint-points-context">{sprint.name}</Dialog.Description>
              {open && <OverviewContent id={sprint.id} refresh={data.issues} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return (
    <section className="sprint-points-panel">
      <button className="sprint-points-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Users size={15} />
        <strong>{sprint.name}</strong>
        <span>成员 Story Points</span>
        <span className="muted">{open ? '收起' : '查看分配与完成情况'}</span>
      </button>
      {open && <OverviewContent id={sprint.id} refresh={data.issues} />}
    </section>
  );
}
export function SprintHistory({ data }: { data: BoardData }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const history = data.sprints
    .filter((s) => s.status === 'COMPLETED')
    .sort((a, b) => (b.endAt ?? '').localeCompare(a.endAt ?? ''));
  const id = history.some((s) => s.id === selected) ? selected : history[0]?.id;
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        <History size={15} />
        历史 Sprint
      </button>
      <Modal open={open} onOpenChange={setOpen} title="历史 Sprint" wide>
        {history.length ? (
          <>
            <SelectField
              label="选择历史 Sprint"
              value={id ?? ''}
              options={history.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setSelected}
            />
            {open && id && <OverviewContent key={id} id={id} showIssues />}
          </>
        ) : (
          <p className="muted">
            还没有已完成的 Sprint。完成当前 Sprint 后，可在这里查看结束时的事项和成员点数。
          </p>
        )}
      </Modal>
    </>
  );
}
