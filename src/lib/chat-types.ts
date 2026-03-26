export type ChatRole = 'user' | 'assistant';
export type AttachmentKind = 'image' | 'document';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface AttachmentRefBlock {
  type: 'attachment_ref';
  attachmentId: string;
  attachmentType: AttachmentKind;
  mediaType: string;
  name: string;
  size: number;
}

export type ChatContentBlock = TextBlock | AttachmentRefBlock;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: ChatContentBlock[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

interface ClaudeBase64Source {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface ClaudeImageBlock {
  type: 'image';
  source: ClaudeBase64Source;
}

export interface ClaudeDocumentBlock {
  type: 'document';
  source: ClaudeBase64Source;
}

export type ClaudeRequestBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeDocumentBlock;

export interface ClaudeRequestMessage {
  role: ChatRole;
  content: ClaudeRequestBlock[];
}

export interface StoredAttachment {
  id: string;
  sessionId: string;
  messageId: string;
  attachmentType: AttachmentKind;
  mediaType: string;
  name: string;
  size: number;
  data: string;
  createdAt: string;
}

export interface ComposerAttachment {
  id: string;
  source: 'new' | 'existing';
  attachmentType: AttachmentKind;
  mediaType: string;
  name: string;
  size: number;
  previewUrl?: string;
  file?: File;
}

export interface ComposerSubmission {
  text: string;
  attachments: ComposerAttachment[];
}

interface LegacyChatMessage {
  id?: string;
  role: ChatRole;
  content: string | ChatContentBlock[];
}

interface LegacyChatSession {
  id: string;
  title: string;
  messages?: LegacyChatMessage[];
  createdAt?: string;
}

export function createMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTextBlock(text: string): TextBlock {
  return { type: 'text', text };
}

export function createAssistantMessage(text: string): ChatMessage {
  return {
    id: createMessageId(),
    role: 'assistant',
    content: text ? [createTextBlock(text)] : [],
  };
}

export function isTextBlock(block: ChatContentBlock): block is TextBlock {
  return block.type === 'text';
}

export function isAttachmentRefBlock(
  block: ChatContentBlock
): block is AttachmentRefBlock {
  return block.type === 'attachment_ref';
}

export function getMessageText(message: Pick<ChatMessage, 'content'>): string {
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export function getMessageAttachmentNames(
  message: Pick<ChatMessage, 'content'>
): string[] {
  return message.content
    .filter(isAttachmentRefBlock)
    .map((block) => block.name);
}

export function buildFallbackTitle(message: Pick<ChatMessage, 'content'>) {
  const text = getMessageText(message);
  if (text) {
    return text.slice(0, 24).trim();
  }

  const attachmentNames = getMessageAttachmentNames(message);
  if (attachmentNames.length > 0) {
    return attachmentNames.join('、').slice(0, 24);
  }

  return 'New chat';
}

export function buildTitlePrompt(message: Pick<ChatMessage, 'content'>) {
  const text = getMessageText(message);
  const attachmentNames = getMessageAttachmentNames(message);

  if (!text && attachmentNames.length === 0) {
    return null;
  }

  const attachmentLine =
    attachmentNames.length > 0
      ? `附件：${attachmentNames.join('、')}`
      : '';
  const textLine = text ? `内容：${text}` : '';

  return [
    '请用最多5个字为以下对话生成一个简洁的标题，只返回标题，不要其他内容。',
    attachmentLine,
    textLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeContent(content: LegacyChatMessage['content']): ChatContentBlock[] {
  if (typeof content === 'string') {
    return content ? [createTextBlock(content)] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.reduce<ChatContentBlock[]>((normalized, block) => {
    if (!block || typeof block !== 'object') {
      return normalized;
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      normalized.push(createTextBlock(block.text));
      return normalized;
    }

    if (
      block.type === 'attachment_ref' &&
      typeof block.attachmentId === 'string' &&
      (block.attachmentType === 'image' || block.attachmentType === 'document')
    ) {
      normalized.push({
        type: 'attachment_ref',
        attachmentId: block.attachmentId,
        attachmentType: block.attachmentType,
        mediaType:
          typeof block.mediaType === 'string'
            ? block.mediaType
            : block.attachmentType === 'image'
              ? 'image/jpeg'
              : 'application/pdf',
        name:
          typeof block.name === 'string' && block.name.trim()
            ? block.name
            : 'Attachment',
        size:
          typeof block.size === 'number' && Number.isFinite(block.size)
            ? block.size
            : 0,
      });
    }

    return normalized;
  }, []);
}

function normalizeMessage(message: LegacyChatMessage, index: number): ChatMessage {
  return {
    id:
      typeof message.id === 'string' && message.id.trim()
        ? message.id
        : `legacy_${index}`,
    role: message.role,
    content: normalizeContent(message.content),
  };
}

export function normalizeSession(session: LegacyChatSession): ChatSession {
  return {
    id: session.id,
    title:
      typeof session.title === 'string' && session.title.trim()
        ? session.title
        : 'New chat',
    messages: Array.isArray(session.messages)
      ? session.messages.map(normalizeMessage)
      : [],
    createdAt:
      typeof session.createdAt === 'string' && session.createdAt.trim()
        ? session.createdAt
        : new Date().toISOString(),
  };
}

export function normalizeSessions(sessionsRaw: string | null): ChatSession[] {
  if (!sessionsRaw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sessionsRaw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((session): session is LegacyChatSession => {
      return Boolean(session && typeof session === 'object' && session.id);
    })
    .map(normalizeSession);
}
