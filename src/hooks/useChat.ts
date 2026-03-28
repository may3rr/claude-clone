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
  saveSessionTitle,
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

type PersistSessionOptions = Parameters<typeof saveSession>[1];

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
  const [isSessionPending, setIsSessionPending] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    Array<{ title: string; url: string; content: string }> | null
  >(null);
  const sessionRef = useRef<ChatSession | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Try local cache first — set immediately to avoid "Loading…" flash
    const cached = getSession(sessionId);
    if (cached) {
      sessionRef.current = cached;
      setSession(cached);
    } else {
      sessionRef.current = null;
      setSession(null);
    }

    if (cached && cached.messages.length > 0) {
      // Has messages locally — no need to hit server
      setIsSessionPending(false);
      return;
    }

    setIsSessionPending(true);

    // Load from server (new session or messages not in cache yet)
    void loadSessionFromServer(sessionId).then((serverSession) => {
      if (cancelled) {
        return;
      }

      if (serverSession) {
        sessionRef.current = serverSession;
        setSession(serverSession);
        saveSession(serverSession, { sync: 'none' });
      }

      setIsSessionPending(false);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function persistSession(
    nextSession: ChatSession,
    options?: PersistSessionOptions
  ) {
    sessionRef.current = nextSession;
    startTransition(() => {
      setSession(nextSession);
    });
    saveSession(nextSession, options);
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
    stream: boolean,
    signal?: AbortSignal
  ) {
    const hydratedMessages = await hydrateMessagesForApi(messages);
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: hydratedMessages,
        model,
        stream,
      }),
      signal,
    });
  }

  async function streamAssistantReply(
    baseSession: ChatSession,
    baseMessages: ChatMessage[],
    model: string,
    replace = false
  ) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await requestChat(baseMessages, model, true, controller.signal);
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
    let latestDraftSession: ChatSession | null = null;

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
          const data = JSON.parse(payload) as {
            type?: string;
            query?: string;
            results?: Array<{ title: string; url: string; content: string }>;
          };
          if (data.type === 'search_used' && data.query) {
            setSearchQuery(data.query);
            continue;
          }
          if (data.type === 'search_results' && data.results) {
            setSearchResults(data.results);
            continue;
          }
          const chunk = extractChunkText(data);
          if (chunk) {
            assistantContent += chunk;
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      }

      latestDraftSession = buildAssistantDraft(
        baseSession,
        baseMessages,
        assistantMessageId,
        assistantContent
      );
      persistSession(latestDraftSession, { sync: 'none' });
    }

    if (latestDraftSession) {
      const latestSession =
        getSession(sessionId) ?? sessionRef.current ?? latestDraftSession;
      persistSession({
        ...latestSession,
        messages: latestDraftSession.messages,
      }, {
        sync: 'immediate',
        replace,
      });
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
        persistSession({ ...latestSession, title }, { sync: 'none' });
        saveSessionTitle(currentSession.id, title);
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
    setSearchQuery(null);
    setSearchResults(null);
    const baseSession = sessionRef.current;
    const updatedSession = {
      ...baseSession,
      messages: [...baseSession.messages, message],
    };

    persistSession(updatedSession, { sync: 'immediate' });
    setIsLoading(true);

    if (baseSession.messages.length === 0) {
      void generateTitle(message, model, updatedSession);
    }

    try {
      await streamAssistantReply(
        updatedSession,
        updatedSession.messages,
        model
      );
      requestBillingRefresh();
    } catch (error) {
      console.error('Chat error:', error);
      setErrorMessage(getErrorMessage(error));
      return false;
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
    persistSession(trimmedSession, {
      sync: 'immediate',
      replace: true,
    });
    void deleteAttachments(discardedAttachmentIds);
    setIsLoading(true);

    try {
      await streamAssistantReply(
        trimmedSession,
        messagesBeforeRetry,
        model,
        true
      );
      requestBillingRefresh();
    } catch (error) {
      console.error('Retry error:', error);
      setErrorMessage(getErrorMessage(error));
      return false;
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

      persistSession(trimmedSession, {
        sync: 'immediate',
        replace: true,
      });
      await deleteAttachments([
        ...new Set([...removedAttachmentIds, ...discardedAttachmentIds]),
      ]);
      setIsLoading(true);

      if (messageIndex === 0) {
        void generateTitle(updatedMessage, model, trimmedSession);
      }

      try {
        await streamAssistantReply(
          trimmedSession,
          nextMessages,
          model,
          true
        );
        requestBillingRefresh();
      } catch (error) {
        console.error('Edit resend error:', error);
        setErrorMessage(getErrorMessage(error));
        return false;
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
    isSessionPending,
    isLoading,
    errorMessage,
    searchQuery,
    searchResults,
    clearError,
    sendMessage,
    sendPreparedMessage,
    retryMessage,
    editMessage,
  };
}
