import * as Popover from '@radix-ui/react-popover';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Avatar, ErrorNotice } from './ui';
import type { Actor } from '../../../../packages/shared/src/contracts';

export function AccountMenu({ account }: { account?: { actor: Actor; email: string; role: string } }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function upload(file: File) {
    setError(undefined);
    if (file.size > 2 * 1024 * 1024) {
      setError(new Error('头像不能超过 2 MB'));
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/me/avatar', { method: 'POST', body, credentials: 'same-origin' });
      const result = await response.json();
      if (response.status === 401) window.dispatchEvent(new Event('forge:auth-expired'));
      if (!response.ok) throw new ApiError(response.status, result.message || '头像上传失败', result.code);
      await qc.invalidateQueries();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="account-trigger" aria-label="账号菜单" title={account?.actor.name}>
          <Avatar actor={account?.actor} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="account-menu" align="end" sideOffset={8} aria-label="账号信息">
          <strong>{account?.actor.name}</strong>
          <span>{account?.email}</span>
          <small>{account?.role === 'ADMIN' ? '工作区管理员' : '团队成员'}</small>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="选择头像"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <button className="account-avatar-upload" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} /> {busy ? '正在上传…' : '更换头像'}
          </button>
          <small>JPG、PNG、WebP，最大 2 MB，自动居中裁切</small>
          <ErrorNotice error={error} />
          <button
            className="account-logout"
            disabled={busy}
            onClick={() =>
              void api('/auth/logout', 'POST').then(() => {
                qc.clear();
                window.location.assign('/');
              })
            }
          >
            <LogOut size={15} /> 退出登录
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
