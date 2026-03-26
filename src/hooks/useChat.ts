'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { requestBillingRefresh } from '@/lib/billing-events';
import {
  deleteAttachments,
} from '@/lib/attachment-store';
import {
  buildTitlePrompt,
  ChatMessage,
  ChatSession,
  ComposerSubmission,
  createAssistantMessage,
  createMessageId,
  createTextBlock,
} from '@/lib/chat-types';
import {
  getSession,
  saveSession,
  loadSessionFromServer,
} from '@/lib/chat-storage';
import {
  createUserMessageFromComposer,
  getAttachmentIdsFromMessage,
  getAttachmentIdsFromMessages,
  hydrateMessagesForApi,
} from '@/lib/chat-message-utils';

interface UseChatOptions {
  sessionId: string;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '消息发送失败，请稍后重试';
}

function extractChunkText(data: unknown) {
  if (!data || typeof data !== 'object') {
    return '';
  }

  const event = data as {
    type?: string;
    delta?: {
      text?: string;
    };
    choices?: Array<{
      delta?: {
        content?: string;
      };
    }>;
  };

  const openAiChunk =
    Array.isArray(event.choices) &&
    typeof event.choices[0]?.delta?.content === 'string'
      ? event.choices[0].delta.content
      : '';

  if (openAiChunk) {
    return openAiChunk;
  }

  const anthropicChunk =
    event.type === 'content_block_delta' &&
    typeof event.delta?.text === 'string'
      ? event.delta.text
      : '';

  return anthropicChunk;
}

export function useChat({ sessionId }: UseChatOptions) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionRef = useRef<ChatSession | null>(null);

  useEffect(() => {
    // Try local cache first, then load full session from server
    const cached = getSession(sessionId);
    if (cached && cached.messages.length > 0) {
      sessionRef.current = cached;
      setSession(cached);
    } else {
      // Load from server (messages may not be in cache)
      void loadSessionFromServer(sessionId).then((serverSession) => {
        if (serverSession) {
          sessionRef.current = serverSession;
          setSession(serverSession);
          // Update local cache
          saveSession(serverSession);
        } else if (cached) {
          // Fallback to cached (new session with no messages yet)
          sessionRef.current = cached;
          setSession(cached);
        }
      });
    }
  }, [sessionId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  function persistSession(nextSession: ChatSession) {
    sessionRef.current = nextSession;
    startTransition(() => {
      setSession(nextSession);
    });
    saveSession(nextSession);
  }

  function clearError() {
    setErrorMessage(null);
  }

  function buildAssistantDraft(
    baseSession: ChatSession,
    baseMessages: ChatSession['messages'],
    assistantMessageId: string,
    assistantContent: string
  ) {
    const latestSession = getSession(sessionId) ?? sessionRef.current ?? baseSession;
    const assistantMessage = {
      ...createAssistantMessage(assistantContent),
      id: assistantMessageId,
    };

    return {
      ...latestSession,
      messages: [...baseMessages, assistantMessage],
    };
  }

  async function requestChat(
    messages: ChatMessage[],
    model: string,
    stream: boolean
  ) {
    const hydratedMessages = await hydrateMessagesForApi(messages);
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: localStorage.getItem('user'),
        messages: hydratedMessages,
        model,
        stream,
      }),
    });
  }

  async function streamAssistantReply(
    baseSession: ChatSession,
    baseMessages: ChatMessage[],
    model: string
  ) {
    const response = await requestChat(baseMessages, model, true);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    let assistantContent = '';
    const assistantMessageId = createMessageId();
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const data = JSON.parse(payload);
          const chunk = extractChunkText(data);
          if (chunk) {
            assistantContent += chunk;
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      }

      persistSession(
        buildAssistantDraft(
          baseSession,
          baseMessages,
          assistantMessageId,
          assistantContent
        )
      );
    }
  }

  async function generateTitle(
    message: ChatMessage,
    model: string,
    currentSession: ChatSession
  ) {
    const prompt = buildTitlePrompt(message);
    if (!prompt) {
      return;
    }

    try {
      const response = await requestChat(
        [
          {
            id: createMessageId(),
            role: 'user',
            content: [createTextBlock(prompt)],
          },
        ],
        model || 'claude-sonnet-4-6',
        false
      );

      if (response.ok) {
        const data = await response.json();
        const rawTitle =
          data.choices?.[0]?.message?.content?.trim() ||
          data.content?.[0]?.text?.trim() ||
          '';
        const title =
          rawTitle
            .split('\n')[0]
            .replace(/^[\s"'“”‘’《》]+|[\s"'“”‘’《》]+$/g, '')
            .trim() || currentSession.title;

        const latestSession =
          getSession(currentSession.id) ?? sessionRef.current ?? currentSession;
        persistSession({ ...latestSession, title });
        requestBillingRefresh();
      }
    } catch (error) {
      console.error('Title generation error:', error);
    }
  }

  async function sendPreparedMessage(message: ChatMessage, model: string) {
    if (!sessionRef.current) {
      return false;
    }

    clearError();
    const baseSession = sessionRef.current;
    const updatedSession = {
      ...baseSession,
      messages: [...baseSession.messages, message],
    };

    persistSession(updatedSession);
    setIsLoading(true);

    if (baseSession.messages.length === 0) {
      void generateTitle(message, model, updatedSession);
    }

    try {
      await streamAssistantReply(updatedSession, updatedSession.messages, model);
      requestBillingRefresh();
    } catch (error) {
      console.error('Chat error:', error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }

    return true;
  }

  async function sendMessage(draft: ComposerSubmission, model: string) {
    if (!sessionRef.current) {
      return false;
    }

    try {
      const userMessage = await createUserMessageFromComposer(sessionId, draft);
      return await sendPreparedMessage(userMessage, model);
    } catch (error) {
      console.error('Compose error:', error);
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  async function retryMessage(assistantIndex: number, model: string) {
    if (!sessionRef.current) {
      return false;
    }

    clearError();
    const messagesBeforeRetry = sessionRef.current.messages.slice(0, assistantIndex);
    let lastUserMessage: ChatMessage | undefined;
    for (let i = messagesBeforeRetry.length - 1; i >= 0; i -= 1) {
      if (messagesBeforeRetry[i]?.role === 'user') {
        lastUserMessage = messagesBeforeRetry[i];
        break;
      }
    }
    if (!lastUserMessage) {
      return false;
    }

    const trimmedSession = {
      ...sessionRef.current,
      messages: messagesBeforeRetry,
    };
    const discardedAttachmentIds = getAttachmentIdsFromMessages(
      sessionRef.current.messages.slice(assistantIndex + 1)
    );
    persistSession(trimmedSession);
    void deleteAttachments(discardedAttachmentIds);
    setIsLoading(true);

    try {
      await streamAssistantReply(trimmedSession, messagesBeforeRetry, model);
      requestBillingRefresh();
    } catch (error) {
      console.error('Retry error:', error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }

    return true;
  }

  async function editMessage(
    messageIndex: number,
    draft: ComposerSubmission,
    model: string
  ) {
    if (!sessionRef.current) {
      return false;
    }

    const currentSession = sessionRef.current;
    const targetMessage = currentSession.messages[messageIndex];
    if (!targetMessage || targetMessage.role !== 'user') {
      return false;
    }

    try {
      const updatedMessage = await createUserMessageFromComposer(
        sessionId,
        draft,
        targetMessage.id
      );

      const nextAttachmentIds = new Set(getAttachmentIdsFromMessage(updatedMessage));
      const removedAttachmentIds = getAttachmentIdsFromMessage(targetMessage).filter(
        (id) => !nextAttachmentIds.has(id)
      );
      const discardedAttachmentIds = getAttachmentIdsFromMessages(
        currentSession.messages.slice(messageIndex + 1)
      );

      clearError();
      const nextMessages = [
        ...currentSession.messages.slice(0, messageIndex),
        updatedMessage,
      ];
      const trimmedSession = {
        ...currentSession,
        messages: nextMessages,
      };

      persistSession(trimmedSession);
      await deleteAttachments([
        ...new Set([...removedAttachmentIds, ...discardedAttachmentIds]),
      ]);
      setIsLoading(true);

      if (messageIndex === 0) {
        void generateTitle(updatedMessage, model, trimmedSession);
      }

      try {
        await streamAssistantReply(trimmedSession, nextMessages, model);
        requestBillingRefresh();
      } catch (error) {
        console.error('Edit resend error:', error);
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsLoading(false);
      }

      return true;
    } catch (error) {
      console.error('Edit compose error:', error);
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  return {
    session,
    isLoading,
    errorMessage,
    clearError,
    sendMessage,
    sendPreparedMessage,
    retryMessage,
    editMessage,
  };
}
