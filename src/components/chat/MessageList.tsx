import MessageBubble from './MessageBubble';
import { ChatMessage, createAssistantMessage } from '@/lib/chat-types';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onRetry?: (messageIndex: number) => void;
  onEdit?: (messageIndex: number) => void;
  editingMessageId?: string | null;
}

export default function MessageList({
  messages,
  isLoading = false,
  onRetry,
  onEdit,
  editingMessageId = null,
}: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const isWaitingForAssistant =
    isLoading && (!lastMessage || lastMessage.role === 'user');

  return (
    <div className="overflow-y-auto flex-1 pt-6">
      <div className="max-w-3xl mx-auto px-4 pb-4">
        {messages.map((message, i) => {
          const isLatestAssistant =
            message.role === 'assistant' && i === messages.length - 1;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              showThinkingIndicator={isLatestAssistant && isLoading}
              showAssistantMarker={isLatestAssistant}
              onRetry={
                message.role === 'assistant' && !isLoading
                  ? () => onRetry?.(i)
                  : undefined
              }
              onEdit={
                message.role === 'user' && !isLoading
                  ? () => onEdit?.(i)
                  : undefined
              }
              isEditing={message.id === editingMessageId}
            />
          );
        })}
        {isWaitingForAssistant && (
          <MessageBubble
            message={createAssistantMessage('')}
            showThinkingIndicator
          />
        )}
      </div>
    </div>
  );
}
