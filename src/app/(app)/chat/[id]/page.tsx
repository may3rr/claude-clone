'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import MessageList from '@/components/chat/MessageList';
import ChatInput from '@/components/input/ChatInput';
import {
  ComposerSubmission,
  createMessageId,
  createTextBlock,
} from '@/lib/chat-types';
import { buildComposerSubmissionFromMessage } from '@/lib/chat-message-utils';
import { takePendingChatMessage } from '@/lib/pending-chat';

export default function ChatPage() {
  const autoScrollGuardThreshold = 160;
  const manualScrollDebounceMs = 250;
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const {
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
  } = useChat({ sessionId });
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [draftSeed, setDraftSeed] = useState<{
    key: string;
    submission: ComposerSubmission;
  } | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const didSendFirstMessage = useRef(false);
  const hasSession = Boolean(session);
  const autoScrollEnabled = useRef(true);
  const forceScrollToBottom = useRef(true);
  const lastScrollTop = useRef(0);
  const lastTouchY = useRef<number | null>(null);
  const lastManualScrollAt = useRef(0);

  function disableAutoScroll() {
    autoScrollEnabled.current = false;
    lastManualScrollAt.current = performance.now();
  }

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    const el = messageListRef.current;
    if (!el) {
      return;
    }
    const scrollElement: HTMLDivElement = el;

    lastScrollTop.current = scrollElement.scrollTop;

    function handleScroll() {
      const currentScrollTop = scrollElement.scrollTop;
      const isScrollingUp = currentScrollTop < lastScrollTop.current;

      if (isScrollingUp) {
        disableAutoScroll();
      }

      lastScrollTop.current = currentScrollTop;
    }

    function handleWheel(event: WheelEvent) {
      if (event.deltaY < 0) {
        disableAutoScroll();
      }
    }

    function handleTouchStart(event: TouchEvent) {
      lastTouchY.current = event.touches[0]?.clientY ?? null;
    }

    function handleTouchMove(event: TouchEvent) {
      const currentTouchY = event.touches[0]?.clientY;
      if (
        typeof currentTouchY === 'number' &&
        typeof lastTouchY.current === 'number' &&
        currentTouchY > lastTouchY.current
      ) {
        disableAutoScroll();
      }

      lastTouchY.current = currentTouchY ?? null;
    }

    function handleTouchEnd() {
      lastTouchY.current = null;
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    scrollElement.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      scrollElement.removeEventListener('wheel', handleWheel);
      scrollElement.removeEventListener('touchstart', handleTouchStart);
      scrollElement.removeEventListener('touchmove', handleTouchMove);
      scrollElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [hasSession, sessionId]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el || !autoScrollEnabled.current) {
      if (!el || !forceScrollToBottom.current) {
        return;
      }
    }

    const currentDistanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const recentlyScrolledByUser =
      performance.now() - lastManualScrollAt.current < manualScrollDebounceMs;
    const shouldFollow =
      forceScrollToBottom.current ||
      (autoScrollEnabled.current &&
        !recentlyScrolledByUser &&
        currentDistanceFromBottom <= autoScrollGuardThreshold);

    if (!shouldFollow) {
      return;
    }

    el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
    forceScrollToBottom.current = false;
  }, [
    autoScrollGuardThreshold,
    isLoading,
    manualScrollDebounceMs,
    searchQuery,
    searchResults,
    session?.messages,
  ]);

  useEffect(() => {
    autoScrollEnabled.current = true;
    forceScrollToBottom.current = true;
    lastScrollTop.current = 0;
    lastTouchY.current = null;
    lastManualScrollAt.current = 0;
  }, [sessionId]);

  useEffect(() => {
    if (isSessionPending || session) {
      return;
    }

    router.replace('/');
  }, [isSessionPending, router, session]);

  // 如果从首页带了 firstMessage 参数，自动发送第一条消息
  useEffect(() => {
    if (!session || didSendFirstMessage.current) return;

    const pendingMessage = takePendingChatMessage(sessionId);
    if (pendingMessage && session.messages.length === 0) {
      didSendFirstMessage.current = true;
      setSelectedModel(pendingMessage.model);
      void sendPreparedMessage(pendingMessage.message, pendingMessage.model);
      return;
    }

    const firstMessage = searchParams.get('firstMessage');
    const model = searchParams.get('model') || selectedModel;
    if (firstMessage && session.messages.length === 0) {
      didSendFirstMessage.current = true;
      setSelectedModel(model);
      void sendPreparedMessage(
        {
          id: createMessageId(),
          role: 'user',
          content: [createTextBlock(firstMessage)],
        },
        model
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleEdit(messageIndex: number) {
    if (!session || isLoading) {
      return;
    }

    const message = session.messages[messageIndex];
    if (!message || message.role !== 'user') {
      return;
    }

    const submission = await buildComposerSubmissionFromMessage(message);
    setEditingIndex(messageIndex);
    setDraftSeed({
      key: `${message.id}:${Date.now()}`,
      submission,
    });
    clearError();
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setDraftSeed(null);
    clearError();
  }

  async function handleSubmit(payload: ComposerSubmission, model: string) {
    autoScrollEnabled.current = true;
    forceScrollToBottom.current = true;
    lastManualScrollAt.current = 0;
    if (editingIndex !== null) {
      const saved = await editMessage(editingIndex, payload, model);
      if (saved) {
        handleCancelEdit();
      }
      return saved;
    }

    return sendMessage(payload, model);
  }

  if (isSessionPending || !session) {
    return (
      <div className="flex items-center justify-center h-full text-text-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <MessageList
          messages={session.messages}
          isLoading={isLoading}
          searchQuery={searchQuery}
          searchResults={searchResults}
          onRetry={(index) => {
            autoScrollEnabled.current = true;
            forceScrollToBottom.current = true;
            lastManualScrollAt.current = 0;
            return retryMessage(index, selectedModel);
          }}
          onEdit={handleEdit}
          editingMessageId={
            editingIndex !== null ? session.messages[editingIndex]?.id ?? null : null
          }
        />
      </div>
      <ChatInput
        key={draftSeed?.key ?? 'compose'}
        onSubmit={(payload) => handleSubmit(payload, selectedModel)}
        isLoading={isLoading}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        errorMessage={errorMessage}
        onClearError={clearError}
        draftSeed={draftSeed}
        mode={editingIndex !== null ? 'edit' : 'compose'}
        onCancelEdit={handleCancelEdit}
        sticky={false}
      />
    </div>
  );
}
