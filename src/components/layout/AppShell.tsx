'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MenuIcon } from '@/components/icons';
import Sidebar from '@/components/sidebar/Sidebar';
import { migrateLocalStorageToServer, initSessionsCache } from '@/lib/chat-storage';

const SIDEBAR_STATE_KEY = 'claude_sidebar_collapsed';
const EXPANDED_SIDEBAR_WIDTH = 288;
const COLLAPSED_SIDEBAR_WIDTH = 84;

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return localStorage.getItem(SIDEBAR_STATE_KEY) === '1';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Initialize sessions from server (or localStorage fallback)
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) return;

    async function init() {
      await migrateLocalStorageToServer();
      await initSessionsCache();
    }

    void init();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STATE_KEY, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsMobileSidebarOpen(false);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileSidebarOpen]);

  const desktopSidebarWidth = isSidebarCollapsed
    ? COLLAPSED_SIDEBAR_WIDTH
    : EXPANDED_SIDEBAR_WIDTH;

  return (
    <div
      className="flex h-full"
      style={{ ['--desktop-sidebar-width' as string]: `${desktopSidebarWidth}px` }}
    >
      <Sidebar
        collapsed={isSidebarCollapsed}
        mobileOpen={isMobileSidebarOpen}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {!isMobileSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="fixed left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-border-300/10 bg-bg-000/95 text-text-100 shadow-[0_0.25rem_1rem_rgba(0,0,0,0.08)] backdrop-blur-sm transition-colors hover:bg-bg-200 md:hidden"
          aria-label="Open sidebar"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      ) : null}

      <main className="flex h-[100dvh] min-w-0 flex-1 flex-col transition-[padding] duration-300 md:pl-[var(--desktop-sidebar-width)]">
        {children}
      </main>
    </div>
  );
}
