'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  CloseIcon,
  DocumentIcon,
  ImageIcon,
  PlusIcon,
  SendIcon,
} from '@/components/icons';
import {
  AttachmentKind,
  ComposerAttachment,
  ComposerSubmission,
} from '@/lib/chat-types';

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-6': 'Claude Opus 4.6',
};

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
const MAX_ATTACHMENT_COUNT = 8;
const MAX_FUNCTION_BODY_BYTES = 4.5 * 1024 * 1024;
const BASE64_EXPANSION_RATIO = 4 / 3;
const JSON_BODY_HEADROOM_BYTES = 512 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = Math.floor(
  (MAX_FUNCTION_BODY_BYTES - JSON_BODY_HEADROOM_BYTES) / BASE64_EXPANSION_RATIO
);

interface ChatInputProps {
  onSubmit?: (payload: ComposerSubmission, model: string) => Promise<boolean> | boolean;
  isLoading?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  errorMessage?: string | null;
  onClearError?: () => void;
  draftSeed?: {
    key: string;
    submission: ComposerSubmission;
  } | null;
  mode?: 'compose' | 'edit';
  onCancelEdit?: () => void;
  sticky?: boolean;
}

function createAttachmentId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function revokePreviewUrl(previewUrl?: string) {
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }
}

function getAttachmentKind(file: File): {
  attachmentType: AttachmentKind;
  mediaType: string;
} | null {
  if (file.type === 'application/pdf') {
    return {
      attachmentType: 'document',
      mediaType: file.type,
    };
  }

  if (file.type.startsWith('image/')) {
    return {
      attachmentType: 'image',
      mediaType: file.type,
    };
  }

  return null;
}

export default function ChatInput({
  onSubmit,
  isLoading = false,
  selectedModel = 'claude-sonnet-4-6',
  onModelChange,
  errorMessage,
  onClearError,
  draftSeed = null,
  mode = 'compose',
  onCancelEdit,
  sticky = true,
}: ChatInputProps) {
  const [value, setValue] = useState(() => draftSeed?.submission.text ?? '');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(
    () => draftSeed?.submission.attachments ?? []
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);

  const totalAttachmentBytes = attachments.reduce(
    (sum, attachment) => sum + attachment.size,
    0
  );
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSend = hasContent && !isLoading;
  const composerError = localError || errorMessage || null;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        revokePreviewUrl(attachment.previewUrl);
      }
    };
  }, []);

  function clearErrors() {
    setLocalError(null);
    onClearError?.();
  }

  function cleanupRejectedAttachments(
    nextAttachments: ComposerAttachment[],
    message: string
  ) {
    setLocalError(message);
    for (const attachment of nextAttachments) {
      revokePreviewUrl(attachment.previewUrl);
    }
  }

  function clearComposer() {
    setValue('');
    setAttachments((current) => {
      for (const attachment of current) {
        revokePreviewUrl(attachment.previewUrl);
      }
      return [];
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleRemoveAttachment(id: string) {
    clearErrors();
    setAttachments((current) => {
      const next = current.filter((attachment) => attachment.id !== id);
      const removed = current.find((attachment) => attachment.id === id);
      revokePreviewUrl(removed?.previewUrl);
      return next;
    });
  }

  function appendFiles(files: File[]) {
    clearErrors();
    if (files.length === 0) {
      return;
    }

    if (attachments.length + files.length > MAX_ATTACHMENT_COUNT) {
      setLocalError(`最多上传 ${MAX_ATTACHMENT_COUNT} 个附件`);
      return;
    }

    const nextAttachments: ComposerAttachment[] = [];
    let nextTotalBytes = totalAttachmentBytes;

    for (const file of files) {
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        cleanupRejectedAttachments(nextAttachments, '只支持 PDF、PNG、JPG、WEBP、GIF');
        return;
      }

      const kind = getAttachmentKind(file);
      if (!kind) {
        cleanupRejectedAttachments(nextAttachments, '暂不支持该文件类型');
        return;
      }

      nextTotalBytes += file.size;
      if (nextTotalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        cleanupRejectedAttachments(
          nextAttachments,
          `附件总大小不能超过 ${formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}，否则服务器会拒绝处理`
        );
        return;
      }

      nextAttachments.push({
        id: createAttachmentId(),
        source: 'new',
        file,
        attachmentType: kind.attachmentType,
        mediaType: kind.mediaType,
        name: file.name,
        size: file.size,
        previewUrl:
          kind.attachmentType === 'image' ? URL.createObjectURL(file) : undefined,
      });
    }

    setAttachments((current) => [...current, ...nextAttachments]);
  }

  async function handleSubmit() {
    if (!canSend || !onSubmit) return;

    clearErrors();
    const consumed = await onSubmit(
      {
        text: value.trim(),
        attachments,
      },
      selectedModel
    );

    if (consumed) {
      clearComposer();
    }
  }

  function handleCancelEdit() {
    clearComposer();
    clearErrors();
    onCancelEdit?.();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    appendFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isLoading) return;
    setIsDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isLoading) return;
    setIsDragActive(false);
    appendFiles(Array.from(e.dataTransfer.files));
  }

  const shellClassName = sticky
    ? 'sticky bottom-0 z-10 pt-6 pb-6 bg-gradient-to-t from-bg-100 via-bg-100/95 to-transparent'
    : 'z-10 pt-6 pb-6 bg-gradient-to-t from-bg-100 via-bg-100/95 to-transparent';

  return (
    <div className={shellClassName}>
      <div className="max-w-3xl mx-auto px-4">
        <div
          className={`rounded-[20px] border bg-bg-000 shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.06)] transition-colors ${
            isDragActive
              ? 'border-[color:var(--color-accent-brand)]'
              : 'border-border-300/10'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {mode === 'edit' ? (
            <div className="flex items-center justify-between gap-3 border-b border-border-300/10 px-4 py-2.5 text-xs text-text-400">
              <span>Editing message. Saving will regenerate everything after this turn.</span>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-text-400 transition-colors hover:text-text-100"
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES.join(',')}
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isLoading}
          />

          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-b border-border-300/10 px-3 pt-3 pb-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex max-w-full items-center gap-2 rounded-2xl border border-border-300/10 bg-bg-100 px-2.5 py-2"
                >
                  {attachment.attachmentType === 'image' && attachment.previewUrl ? (
                    <Image
                      src={attachment.previewUrl}
                      alt={attachment.name}
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-300 text-text-400">
                      <DocumentIcon className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="truncate text-xs text-text-100">
                      {attachment.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-text-400">
                      {attachment.attachmentType === 'image' ? (
                        <ImageIcon className="h-3.5 w-3.5" />
                      ) : (
                        <DocumentIcon className="h-3.5 w-3.5" />
                      )}
                      <span>{formatFileSize(attachment.size)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-text-400 transition-colors hover:bg-bg-200 hover:text-text-100"
                    disabled={isLoading}
                    aria-label={`移除 ${attachment.name}`}
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              clearErrors();
              setValue(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            placeholder={
              isLoading
                ? 'Claude is thinking…'
                : attachments.length > 0
                  ? 'Add a question about your files…'
                  : 'Message Claude…'
            }
            disabled={isLoading}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base md:text-sm text-text-100 placeholder:text-text-400 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '52px', maxHeight: '200px' }}
          />

          <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-300/20 text-text-400 transition-colors hover:bg-bg-200 hover:text-text-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Attach file"
                disabled={isLoading}
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              <span className="truncate text-[11px] text-text-400">
                PDF, PNG, JPG, WEBP, GIF
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <select
                value={selectedModel}
                onChange={(e) => {
                  clearErrors();
                  onModelChange?.(e.target.value);
                }}
                disabled={isLoading}
                className="text-xs text-text-400 bg-transparent border-none focus:outline-none cursor-pointer hover:text-text-100 transition-colors disabled:opacity-50"
              >
                {Object.entries(MODEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSend}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                  canSend
                    ? 'bg-text-100 text-bg-000 hover:opacity-80'
                    : 'bg-bg-300 text-text-400 cursor-not-allowed'
                }`}
                title={mode === 'edit' ? 'Save and resend' : 'Send message'}
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {composerError ? (
          <p className="mt-3 text-center text-xs text-[hsl(7_65%_46%)]">
            {composerError}
          </p>
        ) : (
          <p className="text-center text-xs text-text-400 mt-3">
            {mode === 'edit'
              ? '保存后会从这条消息开始重新发送给 Claude。'
              : 'Claude can make mistakes. Please double-check responses.'}
          </p>
        )}
      </div>
    </div>
  );
}
