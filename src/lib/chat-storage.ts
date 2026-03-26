import { deleteAttachmentsForSession } from '@/lib/attachment-store';
import { ChatSession, normalizeSessions } from '@/lib/chat-types';

export type { ChatSession } from '@/lib/chat-types';

const EMPTY_SESSIONS: ChatSession[] = [];
let cachedSessionsRaw: string | null = null;
let cachedSessions: ChatSession[] = EMPTY_SESSIONS;

function notifySessionsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('chat-sessions-updated'));
}

export function getSessionsSnapshot(): ChatSession[] {
  if (typeof window === 'undefined') return EMPTY_SESSIONS;

  const sessionsRaw = localStorage.getItem('chat_sessions');
  if (sessionsRaw === cachedSessionsRaw) {
    return cachedSessions;
  }

  cachedSessionsRaw = sessionsRaw;
  cachedSessions = normalizeSessions(sessionsRaw);
  return cachedSessions;
}

export function getServerSessionsSnapshot(): ChatSession[] {
  return EMPTY_SESSIONS;
}

export function getAllSessions(): ChatSession[] {
  return [...getSessionsSnapshot()];
}

export function getSession(id: string): ChatSession | null {
  return getAllSessions().find(s => s.id === id) || null;
}

export function saveSession(session: ChatSession) {
  const sessions = getAllSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  const shouldNotify =
    idx < 0 || sessions[idx]?.title !== session.title;
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  if (shouldNotify) {
    notifySessionsUpdated();
  }
}

export function deleteSession(id: string) {
  const sessions = getAllSessions().filter(s => s.id !== id);
  localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  notifySessionsUpdated();
  void deleteAttachmentsForSession(id);
}

export function renameSession(id: string, title: string) {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === id);
  if (session) {
    session.title = title;
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    notifySessionsUpdated();
  }
}

export function createNewSession(): ChatSession {
  return {
    id: Date.now().toString(),
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}
