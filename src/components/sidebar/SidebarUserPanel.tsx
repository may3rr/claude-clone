'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BillingSummary } from '@/lib/billing';
import {
  requestBillingRefresh,
  subscribeBillingRefresh,
} from '@/lib/billing-events';
import { getUserByShortname } from '@/lib/users';

const BILLING_REFRESH_THROTTLE_MS = 90_000;
const FOCUS_REFRESH_INTERVAL_MS = 5 * 60_000;

function formatCny(value: number) {
  return `¥${Math.max(value, 0).toFixed(2)}`;
}

export default function SidebarUserPanel({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userShortname, setUserShortname] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef(0);
  const inflightRef = useRef(false);

  const user = useMemo(() => {
    if (!userShortname) return null;
    return getUserByShortname(userShortname);
  }, [userShortname]);

  useEffect(() => {
    setUserShortname(localStorage.getItem('user'));
  }, [pathname]);

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
        const response = await fetch(
          `/api/billing/summary?user=${encodeURIComponent(userShortname)}`,
          {
            cache: 'no-store',
          }
        );

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

  if (!userShortname || !user) {
    return null;
  }

  const spentLabel = summary ? formatCny(summary.spentCny) : '--';
  const remainingLabel = summary ? formatCny(summary.remainingCny) : '--';
  const hintText = isLoading ? '额度同步中' : '点击头像退出';
  const avatarLabel = user.displayName.slice(0, 1) || user.shortname.slice(0, 1).toUpperCase();

  function handleLogout() {
    localStorage.removeItem('user');
    setUserShortname(null);
    setSummary(null);
    requestBillingRefresh(true);
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="border-t border-border-300/10 px-3 py-3">
      <div className={`flex items-center gap-2.5 ${collapsed ? 'md:hidden' : ''}`}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-300/10 bg-bg-000 text-sm text-text-100 transition-colors hover:bg-bg-300"
          title="退出登录"
          aria-label="退出登录"
        >
          {avatarLabel}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-100">
            {user.displayName}
          </div>
          <div className="text-[11px] text-text-400">
            {hintText}
          </div>
        </div>
      </div>

      {collapsed ? (
        <div className="hidden md:flex md:justify-center">
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-300/10 bg-bg-000 text-sm text-text-100 transition-colors hover:bg-bg-300"
            title={`${user.displayName}，点击退出`}
            aria-label={`${user.displayName}，点击退出`}
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
  );
}
