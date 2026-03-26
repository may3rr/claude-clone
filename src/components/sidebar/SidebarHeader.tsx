'use client';

import Link from 'next/link';
import { Noto_Serif_SC } from 'next/font/google';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClaudeWordmarkIcon,
  CloseIcon,
  PlusIcon,
} from '@/components/icons';

const pepperFont = Noto_Serif_SC({
  weight: ['600'],
  subsets: ['latin'],
  preload: false,
});

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}

export default function SidebarHeader({
  collapsed,
  onToggleCollapsed,
  onCloseMobile,
}: SidebarHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3">
      <Link
        href="/"
        aria-label="辣椒炒肉的 Claude"
        className={`rounded-lg px-2 py-1.5 text-text-100 transition-colors hover:bg-bg-300/60 ${
          collapsed ? 'md:hidden' : ''
        }`}
      >
        <span className="flex items-center gap-1 text-[0.95rem] leading-none">
          <span className={pepperFont.className}>辣椒炒肉的</span>
          <ClaudeWordmarkIcon className="h-[0.95rem] w-auto shrink-0 translate-y-[0.5px]" />
        </span>
      </Link>

      <div className={`hidden items-center gap-1 md:flex ${collapsed ? 'mx-auto' : ''}`}>
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title="New chat"
        >
          <PlusIcon className="w-4 h-4" />
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-1 md:hidden">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title="New chat"
        >
          <PlusIcon className="w-4 h-4" />
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
