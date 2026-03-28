'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveStoredAuthState } from '@/lib/auth-events';
import {
  THINKING_SPRITE_DEFAULT_FPS,
  THINKING_SPRITE_FRAME_COUNT,
  THINKING_SPRITE_PATH,
  THINKING_SPRITE_VIEWBOX,
} from '@/lib/generated-thinking-sprite';

const LOGO_SIZE = 56;
const GREETING_ENTRANCE_DELAY_MS = 900;
const GREETING_INTERVAL_MS = 4000;
const GREETING_EXIT_DURATION_MS = 500;

const GREETINGS = [
  'How can I help you today?',
  '每一天都是新的开始',
  "What's on your mind?",
  '说出你的想法，我在听',
  "Let's create something together",
  '准备好探索了吗？',
  "I'm here to help",
  '美好的事情即将发生',
  "Tell me what you're working on",
  '今天想完成什么？',
  'Ready when you are',
  '让我们开始吧',
  'What would you like to explore?',
  '思考使人自由',
  'Good ideas start with a conversation',
  '灵感就在转角处',
] as const;

type GreetingPhase = 'hidden' | 'visible' | 'exiting';

export default function LoginPage() {
  const router = useRouter();
  const [shortname, setShortname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [spriteFrame, setSpriteFrame] = useState(0);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [greetingPhase, setGreetingPhase] = useState<GreetingPhase>('hidden');
  const cycleTimeoutRef = useRef<number | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const frameInterval = window.setInterval(() => {
      setSpriteFrame((currentFrame) => (currentFrame + 1) % THINKING_SPRITE_FRAME_COUNT);
    }, 1000 / THINKING_SPRITE_DEFAULT_FPS);

    return () => {
      window.clearInterval(frameInterval);
    };
  }, []);

  useEffect(() => {
    setGreetingIndex(Math.floor(Math.random() * GREETINGS.length));

    const revealTimeout = window.setTimeout(() => {
      setGreetingPhase('visible');
    }, GREETING_ENTRANCE_DELAY_MS);

    function scheduleCycle(delay: number) {
      cycleTimeoutRef.current = window.setTimeout(() => {
        setGreetingPhase('exiting');
        exitTimeoutRef.current = window.setTimeout(() => {
          setGreetingIndex((currentIndex) => (currentIndex + 1) % GREETINGS.length);
          setGreetingPhase('visible');
          scheduleCycle(GREETING_INTERVAL_MS);
        }, GREETING_EXIT_DURATION_MS);
      }, delay);
    }

    scheduleCycle(GREETING_ENTRANCE_DELAY_MS + GREETING_INTERVAL_MS);

    return () => {
      window.clearTimeout(revealTimeout);
      if (cycleTimeoutRef.current !== null) {
        window.clearTimeout(cycleTimeoutRef.current);
      }
      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

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
      router.replace('/');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  const greetingClassName =
    greetingPhase === 'visible'
      ? 'translate-y-0 opacity-100'
      : greetingPhase === 'exiting'
        ? '-translate-y-1.5 opacity-0'
        : 'translate-y-1.5 opacity-0';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-100 px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(207,111,73,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0)_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(71,60,54,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(71,60,54,0.04)_1px,transparent_1px)] [background-size:100%_26px,26px_100%]" />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-10 rounded-[2rem] border border-border-300/8 bg-white/65 px-7 py-10 shadow-[0_1.5rem_4rem_rgba(85,60,40,0.08)] backdrop-blur-xl">
        <div className="flex flex-col items-center gap-7">
          <div className="flex flex-col items-center gap-6">
            <div className="relative h-14 w-14 overflow-hidden">
              <svg
                aria-label="Claude"
                className="absolute left-0 top-0 block h-[840px] w-14 max-w-none will-change-transform"
                viewBox={THINKING_SPRITE_VIEWBOX}
                style={{ transform: `translateY(-${spriteFrame * LOGO_SIZE}px)` }}
              >
                <path d={THINKING_SPRITE_PATH} fill="hsl(15 63.1% 59.6%)" />
              </svg>
            </div>

            <div className="flex min-h-[4.5rem] items-center justify-center px-3 text-center">
              <p
                className={`greeting-transition whitespace-pre-line font-serif text-[1.125rem] leading-relaxed text-text-400 transition-all duration-[600ms] ${greetingClassName}`}
              >
                {GREETINGS[greetingIndex]}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="font-serif text-[1.85rem] font-normal leading-none text-text-100">
              欢迎回来
            </h1>
            <p className="text-sm text-text-400">
              先登录，再继续刚才的对话。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3.5">
          <input
            type="text"
            value={shortname}
            onChange={(e) => setShortname(e.target.value)}
            placeholder="id"
            className="w-full rounded-[0.95rem] border border-border-300/12 bg-bg-000/90 px-4 py-3 text-center font-serif text-[0.98rem] text-text-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-all placeholder:text-text-400/70 focus:border-border-300/22 focus:shadow-[0_0_0_3px_rgba(45,31,23,0.05)]"
            autoFocus
            autoComplete="username"
            spellCheck={false}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="w-full rounded-[0.95rem] border border-border-300/12 bg-bg-000/90 px-4 py-3 text-center font-serif text-[0.98rem] text-text-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-all placeholder:text-text-400/70 focus:border-border-300/22 focus:shadow-[0_0_0_3px_rgba(45,31,23,0.05)]"
            autoComplete="current-password"
          />

          {error && (
            <p aria-live="polite" className="text-center text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-[0.95rem] bg-accent-brand py-3 font-serif text-[0.98rem] font-medium text-white transition-all hover:opacity-90 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
