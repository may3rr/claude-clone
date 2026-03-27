'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useEffect, useState } from 'react';
import { Children, isValidElement } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { DocumentIcon, ImageIcon, SearchIcon, ChevronDownIcon } from '@/components/icons';
import type { SearchResultItem } from './MessageList';
import { getStoredAttachmentDataUrl } from '@/lib/attachment-store';
import {
  AttachmentRefBlock,
  ChatMessage,
  getMessageText,
  isAttachmentRefBlock,
  isTextBlock,
} from '@/lib/chat-types';
import MessageActions from './MessageActions';
import ThinkingLoader from './ThinkingLoader';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  onEdit?: () => void;
  showThinkingIndicator?: boolean;
  showAssistantMarker?: boolean;
  searchQuery?: string | null;
  searchResults?: SearchResultItem[] | null;
  isEditing?: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SearchSourcesPanel({ results }: { results: SearchResultItem[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-400 hover:text-text-200 transition-colors"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span>Searched · {results.length} sources</span>
        <ChevronDownIcon
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border-300/10 bg-bg-200 px-3 py-2.5 text-xs transition-colors hover:bg-bg-300"
            >
              <div className="mb-1 font-medium text-text-100 line-clamp-1">
                {r.title}
              </div>
              <div className="text-text-400 line-clamp-2 leading-relaxed">
                {r.content}
              </div>
              <div className="mt-1.5 text-[10px] text-text-500 truncate">
                {getDomain(r.url)}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function renderCode({ inline, className, children }: MarkdownCodeProps) {
  const language = className?.replace(/^language-/, '') || '';
  const text = String(children).replace(/\n$/, '');
  const shouldRenderInline =
    inline === true || (!className && !text.includes('\n'));

  if (shouldRenderInline) {
    return (
      <code className="rounded-md bg-bg-300 px-1.5 py-0.5 font-mono text-[0.85em]">
        {text}
      </code>
    );
  }

  return (
    <pre className="my-4 overflow-x-auto rounded-xl border border-border-300/10 bg-bg-300">
      {language && (
        <div className="border-b border-border-300/10 px-4 py-2 text-xs font-medium text-text-400">
          {language}
        </div>
      )}
      <code className="block whitespace-pre px-4 py-3 text-sm font-mono text-text-100">
        {text}
      </code>
    </pre>
  );
}

function renderMarkdown(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => {
          const hasBlockChild = Children.toArray(children).some((child) => {
            if (!isValidElement(child)) {
              return false;
            }

            return child.type === 'pre' || child.type === renderCode;
          });

          if (hasBlockChild) {
            return <div className="my-3 first:mt-0 last:mb-0">{children}</div>;
          }

          return (
            <p className="my-3 first:mt-0 last:mb-0 break-words">{children}</p>
          );
        },
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[hsl(18_65%_45%)] underline underline-offset-2 hover:text-[hsl(18_65%_35%)]"
          >
            {children}
          </a>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text-100">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-2 border-border-300/15 pl-4 text-text-400">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => (
          <h1 className="mt-6 mb-3 text-2xl font-semibold first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-5 mb-3 text-xl font-semibold first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h3>
        ),
        hr: () => <hr className="my-5 border-border-300/10" />,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-border-300/10">
            <table className="min-w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-bg-300/70">{children}</thead>,
        th: ({ children }) => (
          <th className="border-b border-border-300/10 px-3 py-2 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-border-300/10 px-3 py-2 align-top">
            {children}
          </td>
        ),
        code: renderCode,
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function UserAttachmentCard({ block }: { block: AttachmentRefBlock }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const isImage = block.attachmentType === 'image';

  useEffect(() => {
    let cancelled = false;

    if (!isImage) {
      return undefined;
    }

    void getStoredAttachmentDataUrl(block.attachmentId)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [block.attachmentId, isImage]);

  return (
    <div className="w-full rounded-2xl border border-border-300/10 bg-bg-000 px-3 py-3 shadow-[0_0.15rem_0.8rem_rgba(0,0,0,0.04)]">
      {isImage ? (
        <div className="space-y-2">
          {dataUrl ? (
            <Image
              src={dataUrl}
              alt={block.name}
              width={960}
              height={720}
              unoptimized
              className="max-h-64 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl bg-bg-300 text-text-400">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-text-400">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="truncate">{block.name}</span>
            <span>·</span>
            <span>{formatFileSize(block.size)}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-300 text-text-400">
            <DocumentIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm text-text-100">{block.name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-400">
              <DocumentIcon className="h-3.5 w-3.5" />
              <span>PDF</span>
              <span>·</span>
              <span>{formatFileSize(block.size)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderUserMessage(
  message: ChatMessage,
  onEdit?: () => void,
  isEditing = false
) {
  const messageText = getMessageText(message);

  return (
    <div className="group mb-6 flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-2">
        {message.content.map((block, index) => {
          if (isTextBlock(block)) {
            return (
              <div
                key={`${message.id}-text-${index}`}
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-text-100 whitespace-pre-wrap ${
                  isEditing
                    ? 'bg-bg-200 ring-1 ring-[color:var(--color-accent-brand)]/35'
                    : 'bg-bg-300'
                }`}
              >
                {block.text}
              </div>
            );
          }

          if (isAttachmentRefBlock(block)) {
            return (
              <UserAttachmentCard
                key={`${message.id}-attachment-${block.attachmentId}`}
                block={block}
              />
            );
          }

          return null;
        })}

        {message.content.length > 0 ? (
          <MessageActions
            content={messageText}
            variant="user"
            onEdit={onEdit}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  onRetry,
  onEdit,
  showThinkingIndicator = false,
  showAssistantMarker = false,
  searchQuery,
  searchResults,
  isEditing = false,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return renderUserMessage(message, onEdit, isEditing);
  }

  const assistantText = getMessageText(message);
  const isSearching = !!searchQuery && showThinkingIndicator && !assistantText;
  const hasResults = !!searchResults && searchResults.length > 0;

  return (
    <div className="group mb-8">
      {isSearching && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-text-400 animate-pulse">
          <SearchIcon className="h-3.5 w-3.5" />
          <span>Searching...</span>
        </div>
      )}
      {!isSearching && hasResults && <SearchSourcesPanel results={searchResults} />}
      {!isSearching && searchQuery && !hasResults && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-text-400">
          <SearchIcon className="h-3.5 w-3.5" />
          <span>Searched</span>
        </div>
      )}
      <div
        className="text-text-100 text-[0.9375rem] leading-[1.65rem]"
        style={{ fontFamily: 'Georgia, \"Times New Roman\", serif' }}
      >
        {assistantText ? renderMarkdown(assistantText) : null}
      </div>
      {showAssistantMarker ? (
        <div className="mt-3 flex items-center gap-2">
          <ThinkingLoader
            isThinking={showThinkingIndicator}
            size={26}
            className="text-text-400"
          />
        </div>
      ) : null}
      {assistantText ? (
        <MessageActions content={assistantText} onRetry={onRetry} />
      ) : null}
    </div>
  );
}
