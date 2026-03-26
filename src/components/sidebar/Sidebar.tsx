'use client';

import SidebarHeader from './SidebarHeader';
import ConversationList from './ConversationList';
import SidebarUserPanel from './SidebarUserPanel';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.22)] backdrop-blur-[1px] md:hidden"
          aria-label="Close sidebar"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[18rem] max-w-[85vw] flex-col border-r border-border-300/10 bg-bg-100 transition-[transform,width] duration-300 md:w-[var(--desktop-sidebar-width)] md:max-w-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <SidebarHeader
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          onCloseMobile={onCloseMobile}
        />
        <ConversationList collapsed={collapsed} />
        <SidebarUserPanel collapsed={collapsed} />
      </aside>
    </>
  );
}
