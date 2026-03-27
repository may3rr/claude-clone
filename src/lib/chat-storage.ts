import { deleteAttachmentsForSession } from '@/lib/attachment-store';
import { ChatSession, normalizeSessions } from '@/lib/chat-types';

export type { ChatSession } from '@/lib/chat-types';

// --- Local cache backed by the server ---

let cachedSessions: ChatSession[] = [];
let cacheLoaded = false;

function notifySessionsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('chat-sessions-updated'));
}

// Sync session to server (fire-and-forget)
function syncSessionToServer(session: ChatSession) {
  void fetch(`/api/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: session.messages,
      title: session.title,
    }),
  }).catch((err) => console.error('[sync] save failed:', err));
}

// Load sessions from server
export async function loadSessionsFromServer(): Promise<ChatSession[]> {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((row: { id: string; title: string; created_at: string }) => ({
      id: row.id,
      title: row.title,
      messages: [],
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// Load a single session with messages from server
export async function loadSessionFromServer(id: string): Promise<ChatSession | null> {
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      title: data.title,
      messages: data.messages || [],
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

// Initialize cache from server, fallback to localStorage
export async function initSessionsCache() {
  if (cacheLoaded) return;
  const sessions = await loadSessionsFromServer();

  if (sessions.length > 0) {
    cachedSessions = sessions;
  } else if (typeof window !== 'undefined') {
    // Fallback: load from localStorage if server returned nothing
    const raw = localStorage.getItem('chat_sessions');
    cachedSessions = normalizeSessions(raw);
  }

  cacheLoaded = true;
  notifySessionsUpdated();
}

// Also try migrating from localStorage on first load
export async function migrateLocalStorageToServer() {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem('chat_sessions');
  if (!raw) return;

  const localSessions = normalizeSessions(raw);
  if (localSessions.length === 0) return;

  // Check if we're actually authenticated first
  try {
    const authCheck = await fetch('/api/auth/me');
    if (!authCheck.ok) {
      // Not authenticated — keep localStorage intact, load from it
      cachedSessions = localSessions;
      cacheLoaded = true;
      notifySessionsUpdated();
      return;
    }
  } catch {
    cachedSessions = localSessions;
    cacheLoaded = true;
    notifySessionsUpdated();
    return;
  }

  // Upload each local session to server, track success
  let allSucceeded = true;
  for (const session of localSessions) {
    try {
      const res = await fetch(`/api/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: session.messages,
          title: session.title,
        }),
      });
      if (!res.ok) allSucceeded = false;
    } catch {
      allSucceeded = false;
    }
  }

  // Only clear localStorage if ALL uploads succeeded
  if (allSucceeded) {
    localStorage.removeItem('chat_sessions');
  }

  // Refresh cache
  cacheLoaded = false;
  await initSessionsCache();
}

// --- Public API (same interface as before) ---

const EMPTY_SESSIONS: ChatSession[] = [];

export function getSessionsSnapshot(): ChatSession[] {
  if (typeof window === 'undefined') return EMPTY_SESSIONS;
  return cachedSessions;
}

export function getServerSessionsSnapshot(): ChatSession[] {
  return EMPTY_SESSIONS;
}

export function getAllSessions(): ChatSession[] {
  return [...cachedSessions];
}

export function getSession(id: string): ChatSession | null {
  return cachedSessions.find(s => s.id === id) || null;
}

export function saveSession(session: ChatSession) {
  const idx = cachedSessions.findIndex(s => s.id === session.id);

  if (idx >= 0) {
    cachedSessions = cachedSessions.map((s, i) => (i === idx ? session : s));
  } else {
    cachedSessions = [session, ...cachedSessions];
  }

  notifySessionsUpdated();
  syncSessionToServer(session);
}

export function deleteSession(id: string) {
  cachedSessions = cachedSessions.filter(s => s.id !== id);
  notifySessionsUpdated();
  void deleteAttachmentsForSession(id);

  // Delete from server
  void fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    .catch((err) => console.error('[sync] delete failed:', err));
}

export function renameSession(id: string, title: string) {
  const session = cachedSessions.find(s => s.id === id);
  if (session) {
    cachedSessions = cachedSessions.map(s =>
      s.id === id ? { ...s, title } : s
    );
    notifySessionsUpdated();

    // Sync rename to server
    void fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch((err) => console.error('[sync] rename failed:', err));
  }
}

export function createNewSession(): ChatSession {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}
