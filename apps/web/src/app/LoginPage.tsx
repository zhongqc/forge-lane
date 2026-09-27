import { useState, type FormEvent } from 'react';
import { ArrowRight, Layers3 } from 'lucide-react';
import { api } from '../lib/api';
import { ErrorNotice } from '../components/ui';
import { APP_VERSION } from '../../../../packages/shared/src/version';
export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, 'POST', data);
      onLogin();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          Forge Lane
        </div>
        <div>
          <span className="eyebrow">BUILT FOR THE WAY YOU BUILD</span>
          <h1>
            让想法前进。
            <br />
            让协作发生。
          </h1>
          <p>
            从第一个想法，到最后一次发布。
            <br />
            一个清晰、专注的研发工作空间。
          </p>
          <div className="auth-flow">
            <span>想法</span>
            <i>→</i>
            <span>开发</span>
            <i>→</i>
            <span>交付 ✓</span>
          </div>
        </div>
        <small>少一点流程摩擦，多一点创造。</small>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <span className="eyebrow">YOUR NEXT GREAT THING</span>
          <h2>{register ? '从这里开始构建' : '欢迎回来'}</h2>
          <p className="muted">
            {register ? '创建属于你和团队的工作空间。' : '登录工作空间，继续推进重要的事。'}
          </p>
          {register && (
            <label>
              你的姓名
              <input name="name" required maxLength={60} autoComplete="name" />
            </label>
          )}
          <label>
            邮箱
            <input name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={128}
              required
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder="至少 10 个字符"
            />
          </label>
          <ErrorNotice error={error} />
          <button className="primary auth-submit" disabled={busy}>
            {busy ? '请稍候…' : register ? '创建并开始使用' : '登录工作区'}
            <ArrowRight size={17} />
          </button>
          <p className="auth-switch">
            {register ? '已经有账号？' : '第一次使用？'}{' '}
            <button
              type="button"
              onClick={() => {
                setRegister(!register);
                setError(null);
              }}
            >
              {register ? '登录' : '创建工作区'}
            </button>
          </p>
        </form>
        <span className="app-version" aria-label={`版本 ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      </section>
    </main>
  );
}
