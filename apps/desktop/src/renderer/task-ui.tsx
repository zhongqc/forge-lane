import { useEffect, useRef, useState } from 'react';
import type { Reply } from '../../../../packages/contracts/src/index';
import type { TaskCommand } from '../../../../packages/contracts/src/tasks';
export function unwrap<T>(reply: Reply<T>): T {
  if (!reply.ok) throw new Error(`${reply.error.code}: ${reply.error.message}`);
  return reply.data;
}
type Input<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export function useTaskMutation(refresh: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const receipt = useRef<{ signature: string; id: string } | null>(null);
  const locked = useRef(false);
  async function run(input: Input<TaskCommand>, done?: () => void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const signature = JSON.stringify(input);
    if (receipt.current?.signature !== signature) receipt.current = { signature, id: crypto.randomUUID() };
    try {
      const result = unwrap(
        await window.forge.mutateTask({ ...input, requestId: receipt.current.id } as TaskCommand),
      );
      receipt.current = null;
      done?.();
      setMessage('已保存');
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，输入已保留');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, run };
}
export function useDirty(dirty: boolean, onDirty: (value: boolean) => void) {
  useEffect(() => {
    onDirty(dirty);
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => {
      onDirty(false);
      window.removeEventListener('beforeunload', before);
    };
  }, [dirty, onDirty]);
}
export const actionNames = {
  backlog: '移至 Backlog',
  todo: '移至 Todo',
  start: '开始任务',
  accept: '验收完成',
  cancel: '取消任务',
  archive: '归档任务',
} as const;
