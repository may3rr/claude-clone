import {
  ChatContentBlock,
  ChatMessage,
  ClaudeRequestBlock,
  ClaudeRequestMessage,
  ComposerAttachment,
  ComposerSubmission,
  createMessageId,
  createTextBlock,
  getMessageText,
  isAttachmentRefBlock,
} from '@/lib/chat-types';
import {
  deleteAttachment,
  getStoredAttachmentDataUrl,
  getStoredAttachment,
  saveComposerAttachment,
} from '@/lib/attachment-store';

function buildDraftBlocks(
  text: string,
  attachmentBlocks: ChatContentBlock[]
): ChatContentBlock[] {
  const blocks = [...attachmentBlocks];
  const trimmed = text.trim();

  if (trimmed) {
    blocks.push(createTextBlock(trimmed));
  }

  return blocks;
}

export async function createUserMessageFromComposer(
  sessionId: string,
  draft: ComposerSubmission,
  messageId = createMessageId()
): Promise<ChatMessage> {
  const attachmentBlocks: ChatContentBlock[] = [];

  try {
    for (const attachment of draft.attachments) {
      const block = await saveComposerAttachment({
        sessionId,
        messageId,
        attachment,
      });
      attachmentBlocks.push(block);
    }
  } catch (error) {
    for (const block of attachmentBlocks) {
      if (isAttachmentRefBlock(block)) {
        void deleteAttachment(block.attachmentId);
      }
    }
    throw error;
  }

  return {
    id: messageId,
    role: 'user',
    content: buildDraftBlocks(draft.text, attachmentBlocks),
  };
}

export async function buildComposerSubmissionFromMessage(
  message: ChatMessage
): Promise<ComposerSubmission> {
  const attachments = await Promise.all(
    message.content
      .filter(isAttachmentRefBlock)
      .map(async (block): Promise<ComposerAttachment> => ({
        id: block.attachmentId,
        source: 'existing',
        attachmentType: block.attachmentType,
        mediaType: block.mediaType,
        name: block.name,
        size: block.size,
        previewUrl:
          block.attachmentType === 'image'
            ? (await getStoredAttachmentDataUrl(block.attachmentId)) ?? undefined
            : undefined,
      }))
  );

  return {
    text: getMessageText(message),
    attachments,
  };
}

export function getAttachmentIdsFromMessage(message: ChatMessage) {
  return message.content
    .filter(isAttachmentRefBlock)
    .map((block) => block.attachmentId);
}

export function getAttachmentIdsFromMessages(messages: ChatMessage[]) {
  return messages.flatMap(getAttachmentIdsFromMessage);
}

async function hydrateBlock(block: ChatContentBlock): Promise<ClaudeRequestBlock> {
  if (block.type === 'text') {
    return {
      type: 'text',
      text: block.text,
    };
  }

  const attachment = await getStoredAttachment(block.attachmentId);
  if (!attachment) {
    throw new Error(`附件 ${block.name} 已丢失，请重新上传`);
  }

  return {
    type: attachment.attachmentType,
    ...(attachment.attachmentType === 'document'
      ? {
          title: attachment.name,
        }
      : {}),
    source: {
      type: 'base64',
      media_type: attachment.mediaType,
      data: attachment.data,
    },
  };
}

export async function hydrateMessagesForApi(
  messages: ChatMessage[]
): Promise<ClaudeRequestMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      content: await Promise.all(message.content.map(hydrateBlock)),
    }))
  );
}
