import { useQuery } from '@tanstack/react-query';
import { unwrap } from './task-ui';
import { useState } from 'react';
import type { Project } from '../../../../packages/contracts/src/index';
import { useDirty, useTaskMutation } from './task-ui';
export function ProjectSettings({
  project,
  onClose,
  onDirty,
  refresh,
  settingsVersion,
}: {
  project: Project;
  settingsVersion: number;
  onClose: () => void;
  onDirty: (v: boolean) => void;
  refresh: () => Promise<unknown>;
}) {
  const [base, setBase] = useState(project);
  const [latest, setLatest] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState('');
  const [checking, setChecking] = useState(false);
  const diagnostics = useQuery({
    queryKey: ['project-check', base.id, project.version, settingsVersion],
    queryFn: async () => unwrap(await window.forge.checkProject(base.id)),
  });
  const [name, setName] = useState(base.name),
    [description, setDescription] = useState(base.description),
    [dirty, setDirty] = useState(false);
  const mutation = useTaskMutation(refresh);
  useDirty(dirty || mutation.busy, onDirty);
  const close = () => {
    if (!mutation.busy && (!dirty || window.confirm('有未保存内容，是否放弃并离开？'))) onClose();
  };
  return (
    <section className="panel">
      <h2>项目设置</h2>
      <section className="notice">
        <h3>仓库与身份</h3>
        <button
          disabled={diagnostics.isFetching || checking}
          onClick={async () => {
            setChecking(true);
            try {
              unwrap(await window.forge.checkProject(base.id, true));
              await diagnostics.refetch();
              setLoadError('');
            } catch (e) {
              setLoadError(String(e));
            } finally {
              setChecking(false);
            }
          }}
        >
          {diagnostics.isFetching || checking ? '检测中…' : '重新检测仓库'}
        </button>
        {diagnostics.data ? (
          <>
            <p>
              {diagnostics.data.status} · {new Date(diagnostics.data.checkedAt).toLocaleString()}
            </p>
            <p>
              远端：{diagnostics.data.remote ?? '未配置'} · 默认分支：
              {diagnostics.data.defaultBranch ?? '未知'}
            </p>
            <p>
              GitHub 身份：{diagnostics.data.githubLogin ?? '尚未验证'} · 权限：
              {diagnostics.data.repositoryPermission ?? '未知'}
            </p>
            <p>{diagnostics.data.detail}</p>
          </>
        ) : (
          <p>尚未检测。可先管理本地任务；外部执行保持关闭。</p>
        )}
        {diagnostics.isError && <p role="alert">{diagnostics.error.message}</p>}
      </section>
      {mutation.error && (
        <p role="alert" className="error">
          {mutation.error}
        </p>
      )}
      <section className="notice">
        <button
          disabled={mutation.busy}
          onClick={async () => {
            try {
              setLatest(unwrap(await window.forge.snapshot()).projects.find((p) => p.id === base.id) ?? null);
              setLoadError('');
              await refresh();
            } catch (e) {
              setLoadError(String(e));
            }
          }}
        >
          读取最新项目设置
        </button>
        {loadError && <p role="alert">{loadError}</p>}
        {latest && (
          <>
            <p>
              版本 {latest.version} · {latest.name}
            </p>
            <pre>{latest.description}</pre>
            <button
              onClick={() => {
                setBase(latest);
                setLatest(null);
              }}
            >
              以最新版本继续编辑当前草稿
            </button>
          </>
        )}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(
            {
              method: 'project.update',
              projectId: base.id,
              expectedVersion: base.version,
              name,
              description,
            },
            () => {
              setDirty(false);
              onClose();
            },
          );
        }}
      >
        <fieldset disabled={mutation.busy}>
          <label>
            项目名称
            <input
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
              }}
              required
              maxLength={200}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            项目描述
            <textarea
              rows={5}
              maxLength={20000}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <p className="path">仓库：{base.repositoryPath}</p>
          <p className="path">Git 公共目录：{base.gitCommonDir}</p>
          <p>
            工具路径、主题与字号继承全局设置。当前仅支持本地管理；Agent 模型、setup
            与授权在执行能力接入后提供。
          </p>
          <div className="task-toolbar">
            <button className="primary" disabled={!name.trim()}>
              保存项目设置
            </button>
            <button type="button" onClick={close}>
              返回看板
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
