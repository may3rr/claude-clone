'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BillingSummary } from '@/lib/billing';
import {
  requestBillingRefresh,
  subscribeBillingRefresh,
} from '@/lib/billing-events';

const BILLING_REFRESH_THROTTLE_MS = 90_000;
const FOCUS_REFRESH_INTERVAL_MS = 5 * 60_000;

function formatCny(value: number) {
  return `¥${Math.max(value, 0).toFixed(2)}`;
}

function readStoredUserValue(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(key)?.trim();
  return value ? value : null;
}

export default function SidebarUserPanel({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userShortname, setUserShortname] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef(0);
  const inflightRef = useRef(false);

  // Menu & password modal state
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserShortname(readStoredUserValue('user'));
    setDisplayName(readStoredUserValue('user_display_name'));
  }, [pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    async function loadBillingSummary(force = false) {
      if (!userShortname || inflightRef.current) return;

      const now = Date.now();
      if (!force && now - lastFetchedAtRef.current < BILLING_REFRESH_THROTTLE_MS) {
        return;
      }

      inflightRef.current = true;
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch('/api/billing/summary', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Billing summary error: ${response.status}`);
        }

        const data: BillingSummary = await response.json();
        setSummary(data);
        lastFetchedAtRef.current = Date.now();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '额度获取失败');
      } finally {
        inflightRef.current = false;
        setIsLoading(false);
      }
    }

    if (!userShortname) {
      setSummary(null);
      setLoadError(null);
      lastFetchedAtRef.current = 0;
      return;
    }

    loadBillingSummary(true);

    const unsubscribe = subscribeBillingRefresh(({ force }) => {
      void loadBillingSummary(force);
    });

    const handleFocus = () => {
      if (Date.now() - lastFetchedAtRef.current >= FOCUS_REFRESH_INTERVAL_MS) {
        void loadBillingSummary(false);
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [userShortname]);

  if (!userShortname) {
    return null;
  }

  const spentLabel = summary ? formatCny(summary.spentCny) : '--';
  const remainingLabel = summary ? formatCny(summary.remainingCny) : '--';
  const resolvedName = displayName || userShortname;
  const avatarLabel = resolvedName.slice(0, 1).toUpperCase();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('user');
    localStorage.removeItem('user_display_name');
    localStorage.removeItem('user_role');
    setUserShortname(null);
    setDisplayName(null);
    setSummary(null);
    requestBillingRefresh(true);
    router.push('/login');
    router.refresh();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);

    if (!oldPw || !newPw) {
      setPwError('请填写完整');
      return;
    }
    if (newPw.length < 6) {
      setPwError('新密码至少 6 位');
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || '修改失败');
      } else {
        setPwSuccess(true);
        setOldPw('');
        setNewPw('');
        setTimeout(() => {
          setPwModalOpen(false);
          setPwSuccess(false);
        }, 1500);
      }
    } catch {
      setPwError('网络错误');
    } finally {
      setPwLoading(false);
    }
  }

  function openPasswordModal() {
    setMenuOpen(false);
    setPwError('');
    setPwSuccess(false);
    setOldPw('');
    setNewPw('');
    setPwModalOpen(true);
  }

  return (
    <>
      <div className="border-t border-border-300/10 px-3 py-3">
        {/* User info row */}
        <div className={`relative flex items-center gap-2.5 ${collapsed ? 'md:hidden' : ''}`} ref={menuRef}>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-300/10 bg-bg-000 text-sm text-text-100"
          >
            {avatarLabel}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate text-sm font-medium text-text-100">
              {resolvedName}
            </div>
            <div className="text-[11px] text-text-400">
              {isLoading ? '额度同步中' : '设置'}
            </div>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-1 w-full rounded-lg border border-border-300/20 bg-bg-200 py-1 shadow-lg">
              <button
                onClick={openPasswordModal}
                className="w-full px-3 py-2 text-left text-sm text-text-200 hover:bg-bg-300 transition-colors"
              >
                修改密码
              </button>
              <button
                onClick={handleLogout}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-bg-300 transition-colors"
              >
                退出登录
              </button>
            </div>
          )}
        </div>

        {collapsed ? (
          <div className="hidden md:flex md:justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-300/10 bg-bg-000 text-sm text-text-100 transition-colors hover:bg-bg-300"
              title={resolvedName}
              aria-label={resolvedName}
            >
              {avatarLabel}
            </button>
          </div>
        ) : null}

        <div
          className={`mt-3 grid grid-cols-2 gap-3 border-t border-border-300/10 pt-3 ${
            collapsed ? 'md:hidden' : ''
          }`}
        >
          <div>
            <div className="text-[11px] text-text-400">已花费</div>
            <div className="mt-1 text-sm text-text-100">{spentLabel}</div>
          </div>
          <div>
            <div className="text-[11px] text-text-400">剩余</div>
            <div className="mt-1 text-sm text-text-100">{remainingLabel}</div>
          </div>
        </div>

        {loadError ? (
          <p className={`mt-2 text-[11px] text-text-400 ${collapsed ? 'md:hidden' : ''}`}>
            额度暂时未同步
          </p>
        ) : null}
      </div>

      {/* Change password modal */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-sm mx-4 rounded-2xl border border-border-300/20 bg-bg-000 p-6 shadow-xl">
            <h2 className="text-lg font-medium text-text-100 mb-4">修改密码</h2>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <input
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                placeholder="当前密码"
                className="w-full px-3 py-2.5 rounded-xl border border-border-300/20 bg-bg-100 text-text-100 placeholder:text-text-400 text-sm focus:outline-none focus:ring-1 focus:ring-border-300/30"
                autoFocus
                autoComplete="current-password"
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="新密码（至少 6 位）"
                className="w-full px-3 py-2.5 rounded-xl border border-border-300/20 bg-bg-100 text-text-100 placeholder:text-text-400 text-sm focus:outline-none focus:ring-1 focus:ring-border-300/30"
                autoComplete="new-password"
              />

              {pwError && (
                <p className="text-sm text-red-500">{pwError}</p>
              )}
              {pwSuccess && (
                <p className="text-sm text-green-500">密码已修改</p>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPwModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border-300/20 text-sm text-text-200 hover:bg-bg-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="flex-1 py-2.5 rounded-xl bg-accent-brand text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {pwLoading ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
