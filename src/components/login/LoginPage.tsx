'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveStoredAuthState } from '@/lib/auth-events';

export default function LoginPage() {
  const router = useRouter();
  const [shortname, setShortname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const input = shortname.trim().toLowerCase();

    if (!input) {
      setError('请输入你的缩写');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortname: input, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '登录失败');
        setLoading(false);
        return;
      }

      saveStoredAuthState({
        shortname: data.shortname,
        displayName: data.displayName,
        role: data.role,
      });
      router.push('/');
    } catch {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Claude logo */}
        <div className="flex items-center justify-center w-16 h-16">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            className="w-14 h-14"
            aria-label="Claude"
          >
            <path
              d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"
              fill="hsl(15 63.1% 59.6%)"
            />
          </svg>
        </div>

        <h1 className="text-[1.75rem] font-normal font-serif text-text-100 text-center leading-snug">
          欢迎使用 Claude
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
          <input
            type="text"
            value={shortname}
            onChange={(e) => setShortname(e.target.value)}
            placeholder="id"
            className="w-full px-4 py-3 rounded-xl border border-border-300/20 bg-bg-000 text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-1 focus:ring-border-300/30 text-center font-serif"
            autoFocus
            autoComplete="username"
            spellCheck={false}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="w-full px-4 py-3 rounded-xl border border-border-300/20 bg-bg-000 text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-1 focus:ring-border-300/30 text-center font-serif"
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-accent-brand text-white font-medium font-serif hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
