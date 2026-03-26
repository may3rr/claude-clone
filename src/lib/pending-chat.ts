import { ChatMessage } from '@/lib/chat-types';

const KEY_PREFIX = 'pending_chat_message:';

interface PendingChatMessage {
  model: string;
  message: ChatMessage;
}

function getStorageKey(sessionId: string) {
  return `${KEY_PREFIX}${sessionId}`;
}

export function setPendingChatMessage(
  sessionId: string,
  payload: PendingChatMessage
) {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  sessionStorage.setItem(getStorageKey(sessionId), JSON.stringify(payload));
}

export function takePendingChatMessage(sessionId: string) {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const key = getStorageKey(sessionId);
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }

  sessionStorage.removeItem(key);
  try {
    return JSON.parse(raw) as PendingChatMessage;
  } catch {
    return null;
  }
}
