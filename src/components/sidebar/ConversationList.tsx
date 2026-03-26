'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  getServerSessionsSnapshot,
  getSessionsSnapshot,
  deleteSession,
  renameSession,
  ChatSession,
} from '@/lib/chat-storage';
import { MoreIcon } from '@/components/icons';

function subscribeSessions(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('chat-sessions-updated', onStoreChange);
  window.addEventListener('storage', onStoreChange);

  return () => {
    window.removeEventListener('chat-sessions-updated', onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export default function ConversationList({ collapsed = false }: { collapsed?: boolean }) {
  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    getServerSessionsSnapshot
  );
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpenId]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  function handleMenuToggle(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpenId(prev => (prev === id ? null : id));
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setMenuOpenId(null);
    deleteSession(id);
    if (pathname === `/chat/${id}`) {
      router.push('/');
    }
  }

  function handleStartRename(e: React.MouseEvent, session: ChatSession) {
    e.stopPropagation();
    setMenuOpenId(null);
    setRenamingId(session.id);
    setRenameValue(session.title);
  }

  function handleRenameSubmit(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== sessions.find(s => s.id === id)?.title) {
      renameSession(id, trimmed);
    }
    setRenamingId(null);
  }

  if (sessions.length === 0) {
    return (
      <nav className={`flex-1 overflow-y-auto px-2 py-2 ${collapsed ? 'md:hidden' : ''}`}>
        <p className="px-2 py-1.5 text-xs text-text-400">No conversations yet</p>
      </nav>
    );
  }

  return (
    <nav className={`flex-1 overflow-y-auto px-2 py-2 ${collapsed ? 'md:hidden' : ''}`}>
      <p
        className="mb-1 px-2 py-1.5 text-[0.7rem] font-normal text-text-400 tracking-[0.02em]"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        Recents
      </p>
      <ul className="space-y-0.5">
        {sessions.map((session) => {
          const isActive = pathname === `/chat/${session.id}`;
          const isRenaming = renamingId === session.id;
          return (
            <li key={session.id} className="group relative">
              <div
                className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-bg-300 text-text-100'
                    : 'text-text-400 hover:bg-bg-200 hover:text-text-100'
                }`}
                onClick={() => !isRenaming && router.push(`/chat/${session.id}`)}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(session.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 min-w-0 bg-transparent text-text-100 text-sm outline-none border-b border-text-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate flex-1 min-w-0">{session.title}</span>
                )}
                {!isRenaming && (
                  <button
                    onClick={(e) => handleMenuToggle(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md hover:bg-bg-400 text-text-400 transition-opacity"
                    title="More options"
                  >
                    <MoreIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Dropdown menu */}
              {menuOpenId === session.id && (
                <div
                  ref={menuRef}
                  className="absolute right-2 top-full z-50 mt-1 w-36 rounded-lg bg-bg-200 border border-border-300/20 shadow-lg py-1"
                >
                  <button
                    onClick={(e) => handleStartRename(e, session)}
                    className="w-full text-left px-3 py-1.5 text-sm text-text-200 hover:bg-bg-300 transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-bg-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
