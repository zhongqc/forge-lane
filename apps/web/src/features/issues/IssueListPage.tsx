import { useState } from 'react';
import { Search, ArrowUpDown, ArrowUpRight } from 'lucide-react';
import { TypeIcon, Avatar, PriorityIcon, MultiSelect } from '../../components/ui';
import type { BoardData, Issue } from '../../../../../packages/shared/src/contracts';
export function IssueListPage({
  data,
  onOpen,
  epics = false,
}: {
  data: BoardData;
  onOpen: (i: Issue) => void;
  epics?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [types, setTypes] = useState('');
  const [ascending, setAscending] = useState(false);
  const issues = data.issues
    .filter(
      (i) =>
        (epics ? i.type === 'EPIC' : true) &&
        (!status || status.split(',').includes(i.statusId)) &&
        (!assignee || assignee.split(',').includes(i.assigneeId ?? '')) &&
        (!types || types.split(',').includes(i.type)) &&
        `${i.key} ${i.title} ${i.description}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => (ascending ? a.number - b.number : b.number - a.number));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{epics ? 'CONNECT WORK TO PURPOSE' : 'EVERY DETAIL, IN VIEW'}</div>
          <h1>
            {epics ? 'Epics' : '所有事项'} <span>{issues.length}</span>
          </h1>
          <p>{epics ? '把长期目标拆解为可交付的工作。' : '每一项工作，都能找到清晰的归属。'}</p>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索事项…" />
        </div>
        <MultiSelect
          label="状态筛选"
          value={status}
          onChange={setStatus}
          options={data.statuses.map((s) => ({ value: s.id, label: s.name }))}
        />
        <MultiSelect
          label="负责人筛选"
          value={assignee}
          onChange={setAssignee}
          options={data.members.map((m) => ({ value: m.id, label: m.name }))}
        />
        {!epics && (
          <MultiSelect
            label="类型筛选"
            value={types}
            onChange={setTypes}
            options={['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'].map((t) => ({ value: t, label: t }))}
          />
        )}
        <button className="secondary small" onClick={() => setAscending(!ascending)}>
          <ArrowUpDown size={13} />
          {ascending ? '最早创建' : '最新创建'}
        </button>
      </div>
      {epics ? (
        <div className="epic-grid">
          {issues.map((i) => (
            <button className="epic-card" key={i.id} onClick={() => onOpen(i)}>
              <header>
                <TypeIcon type="EPIC" />
                <span className="issue-key">{i.key}</span>
                <ArrowUpRight size={17} />
              </header>
              <h2>{i.title}</h2>
              <p>{i.description.replace(/[#*`]/g, '').slice(0, 100) || '添加描述，让团队理解这个目标。'}</p>
              <footer>
                <span>{data.issues.filter((c) => c.epicId === i.id).length} 个关联事项</span>
                <Avatar actor={i.assignee} small />
              </footer>
            </button>
          ))}
        </div>
      ) : (
        <div className="issue-table">
          <div className="table-header">
            <span>事项</span>
            <span>Epic</span>
            <span>状态</span>
            <span>优先级</span>
            <span>负责人</span>
            <span>Sprint</span>
          </div>
          {issues.map((i) => (
            <button className="table-row" key={i.id} onClick={() => onOpen(i)}>
              <span>
                <TypeIcon type={i.type} />
                <span className="issue-key">{i.key}</span>
                <strong>{i.title}</strong>
              </span>
              <span className="muted">{i.epic?.title ?? '—'}</span>
              <span>
                <i className="status-pill">{i.status.name}</i>
              </span>
              <span>
                <PriorityIcon priority={i.priority} />
              </span>
              <span>
                <Avatar actor={i.assignee} small />
                {i.assignee?.name ?? '未分配'}
              </span>
              <span className="muted">
                {data.sprints.find((s) => s.id === i.effectiveSprintId)?.name ?? 'Backlog'}
              </span>
            </button>
          ))}
        </div>
      )}
      {!issues.length && (
        <div className="sprint-empty">{search ? '没有匹配的事项' : '还没有事项，创建第一项工作吧。'}</div>
      )}
    </>
  );
}
