'use client';

import { useParams, useSearchParams } from 'next/navigation';
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
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  const {
    session,
    isLoading,
    errorMessage,
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [session?.messages]);

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
    if (editingIndex !== null) {
      const saved = await editMessage(editingIndex, payload, model);
      if (saved) {
        handleCancelEdit();
      }
      return saved;
    }

    return sendMessage(payload, model);
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-text-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={messageListRef} className="flex-1 overflow-y-auto">
        <MessageList
          messages={session.messages}
          isLoading={isLoading}
          onRetry={(index) => retryMessage(index, selectedModel)}
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
      />
    </div>
  );
}
