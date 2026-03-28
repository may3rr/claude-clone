import { deleteAttachmentsForSession } from '@/lib/attachment-store';
import { ChatSession, normalizeSessions } from '@/lib/chat-types';

export type { ChatSession } from '@/lib/chat-types';

type SessionSyncMode = 'none' | 'debounced' | 'immediate';

interface SaveSessionOptions {
  sync?: SessionSyncMode;
  replace?: boolean;
}

// --- Local cache backed by the server ---

let cachedSessions: ChatSession[] = [];
let cacheLoaded = false;
let cacheSyncVersion = 0;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notifySessionsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('chat-sessions-updated'));
}

function updateCachedSession(session: ChatSession) {
  const idx = cachedSessions.findIndex((s) => s.id === session.id);

  if (idx >= 0) {
    cachedSessions = cachedSessions.map((s, i) => (i === idx ? session : s));
  } else {
    cachedSessions = [session, ...cachedSessions];
  }

  notifySessionsUpdated();
}

function clearPendingSync(sessionId: string) {
  const pending = syncTimers.get(sessionId);
  if (pending) {
    clearTimeout(pending);
    syncTimers.delete(sessionId);
  }
}

function clearAllPendingSyncs() {
  syncTimers.forEach((pending) => {
    clearTimeout(pending);
  });
  syncTimers.clear();
}

function syncSessionTitleToServer(id: string, title: string) {
  void fetch(`/api/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  }).catch((err) => console.error('[sync] rename failed:', err));
}

function writeSessionToServer(session: ChatSession, replace = false) {
  if (!replace && session.messages.length === 0) {
    void fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        title: session.title,
      }),
    }).catch((err) => console.error('[sync] create failed:', err));
    return;
  }

  const method = replace ? 'PUT' : 'POST';

  void fetch(`/api/sessions/${session.id}/messages`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: session.messages,
      title: session.title,
    }),
  }).catch((err) => console.error('[sync] save failed:', err));
}

// Sync session to server (fire-and-forget)
function syncSessionToServer(
  session: ChatSession,
  { sync = 'debounced', replace = false }: SaveSessionOptions = {}
) {
  clearPendingSync(session.id);

  if (sync === 'none') {
    return;
  }

  if (sync === 'immediate') {
    writeSessionToServer(session, replace);
    return;
  }

  syncTimers.set(
    session.id,
    setTimeout(() => {
      syncTimers.delete(session.id);
      writeSessionToServer(session, replace);
    }, 500)
  );
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
  const requestVersion = cacheSyncVersion;
  const sessions = await loadSessionsFromServer();

  if (requestVersion !== cacheSyncVersion) {
    return;
  }

  cachedSessions = sessions;

  cacheLoaded = true;
  notifySessionsUpdated();
}

// Also try migrating from user-scoped localStorage on first load
export async function migrateLocalStorageToServer() {
  if (typeof window === 'undefined') return;
  try {
    const authCheck = await fetch('/api/auth/me');
    if (!authCheck.ok) {
      return;
    }

    const authState = await authCheck.json() as { shortname?: string };
    const shortname =
      typeof authState.shortname === 'string'
        ? authState.shortname.trim().toLowerCase()
        : '';
    if (!shortname) {
      return;
    }

    const raw = localStorage.getItem(`chat_sessions:${shortname}`);
    if (!raw) {
      return;
    }

    const localSessions = normalizeSessions(raw);
    if (localSessions.length === 0) {
      localStorage.removeItem(`chat_sessions:${shortname}`);
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

    if (allSucceeded) {
      localStorage.removeItem(`chat_sessions:${shortname}`);
    }
  } catch {
    return;
  }
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

export function clearSessionsCache() {
  cacheSyncVersion += 1;
  clearAllPendingSyncs();
  cachedSessions = [];
  cacheLoaded = false;
  notifySessionsUpdated();
}

export async function refreshSessionsCache() {
  const requestVersion = cacheSyncVersion + 1;
  cacheSyncVersion = requestVersion;
  clearAllPendingSyncs();
  cachedSessions = [];
  cacheLoaded = false;
  notifySessionsUpdated();

  const sessions = await loadSessionsFromServer();
  if (requestVersion !== cacheSyncVersion) {
    return;
  }

  cachedSessions = sessions;

  cacheLoaded = true;
  notifySessionsUpdated();
}

export function saveSession(
  session: ChatSession,
  options: SaveSessionOptions = {}
) {
  updateCachedSession(session);
  syncSessionToServer(session, options);
}

export function deleteSession(id: string) {
  clearPendingSync(id);
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
    syncSessionTitleToServer(id, title);
  }
}

export function saveSessionTitle(id: string, title: string) {
  syncSessionTitleToServer(id, title);
}

export function createNewSession(): ChatSession {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}
