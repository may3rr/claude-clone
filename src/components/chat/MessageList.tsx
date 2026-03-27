import MessageBubble from './MessageBubble';
import ThinkingLoader from './ThinkingLoader';
import { ChatMessage } from '@/lib/chat-types';

export type SearchResultItem = {
  title: string;
  url: string;
  content: string;
};

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  searchQuery?: string | null;
  searchResults?: SearchResultItem[] | null;
  onRetry?: (messageIndex: number) => void;
  onEdit?: (messageIndex: number) => void;
  editingMessageId?: string | null;
}

export default function MessageList({
  messages,
  isLoading = false,
  searchQuery = null,
  searchResults = null,
  onRetry,
  onEdit,
  editingMessageId = null,
}: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const isWaitingForAssistant =
    isLoading && (!lastMessage || lastMessage.role === 'user');

  return (
    <div className="pt-6">
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
              searchQuery={isLatestAssistant ? searchQuery : undefined}
              searchResults={isLatestAssistant ? searchResults : undefined}
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
          <div className="group mb-8">
            <div className="flex items-center gap-2.5">
              <ThinkingLoader isThinking size={26} className="text-text-400" />
              {searchQuery && (
                <span className="text-sm text-text-400 animate-pulse">
                  Searching...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
