'use client';

import { useState } from 'react';
import {
  CopyIcon,
  EditIcon,
  RetryIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@/components/icons';

interface MessageActionsProps {
  content: string;
  variant?: 'assistant' | 'user';
  onRetry?: () => void;
  onEdit?: () => void;
}

export default function MessageActions({
  content,
  variant = 'assistant',
  onRetry,
  onEdit,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? (
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </button>

      {variant === 'assistant' && onRetry ? (
        <button
          onClick={onRetry}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title="Retry"
        >
          <RetryIcon className="h-4 w-4" />
        </button>
      ) : null}

      {variant === 'user' && onEdit ? (
        <button
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
          title="Edit message"
        >
          <EditIcon className="h-4 w-4" />
        </button>
      ) : null}

      {variant === 'assistant' ? (
        <>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
            title="Thumbs up"
          >
            <ThumbsUpIcon className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-400 transition-colors hover:bg-bg-300 hover:text-text-100"
            title="Thumbs down"
          >
            <ThumbsDownIcon className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
