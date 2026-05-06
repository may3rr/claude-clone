import { getApiKeyForUser } from '@/lib/auth';
import { getClaudeSystemPrompt } from '@/lib/claude-system-prompts';
import {
  ClaudeRequestBlock,
  ClaudeRequestMessage,
} from '@/lib/chat-types';
import { getUserFromRequest } from '@/lib/jwt';
import { extractPdfTextFromBase64 } from '@/lib/pdf-text';

interface SSEEvent {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    text?: string;
  };
}

function getConfiguredApiUrl() {
  const apiUrl = process.env.GPT_GE_API_URL;
  if (!apiUrl) {
    throw new Error('GPT_GE_API_URL not set');
  }
  return apiUrl;
}

function isPdfDocumentBlock(
  block: ClaudeRequestBlock
): block is Extract<ClaudeRequestBlock, { type: 'document' }> {
  return block.type === 'document' && block.source.media_type === 'application/pdf';
}

async function expandPdfDocumentBlock(
  block: Extract<ClaudeRequestBlock, { type: 'document' }>
): Promise<ClaudeRequestBlock[]> {
  const fallbackTitle = block.title?.trim() || 'uploaded.pdf';

  try {
    const extracted = await extractPdfTextFromBase64(block.source.data);
    const headerLines = [
      `PDF attachment: ${fallbackTitle}`,
      `Total pages: ${extracted.pageCount}`,
    ];

    if (!extracted.text) {
      return [
        {
          type: 'text',
          text: `${headerLines.join('\n')}\nNo readable PDF text could be extracted.`,
        },
      ];
    }

    const trailer = extracted.truncated
      ? '\n\n[PDF text truncated before sending to the upstream model.]'
      : '';

    return [
      {
        type: 'text',
        text: `${headerLines.join('\n')}\n\n${extracted.text}${trailer}`,
      },
    ];
  } catch (error) {
    console.error('[API] PDF extraction failed:', error);
    return [
      {
        type: 'text',
        text: `PDF attachment: ${fallbackTitle}\nPDF text extraction failed before the upstream request.`,
      },
    ];
  }
}

async function prepareMessagesForUpstream(
  messages: ClaudeRequestMessage[]
): Promise<ClaudeRequestMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      const content = await Promise.all(
        message.content.map(async (block) => {
          if (!isPdfDocumentBlock(block)) {
            return [block];
          }

          return expandPdfDocumentBlock(block);
        })
      );

      return {
        ...message,
        content: content.flat(),
      };
    })
  );
}

/** Parse an SSE stream into individual JSON events. */
async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        yield JSON.parse(payload) as SSEEvent;
      } catch {
        // skip malformed
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const jwtUser = await getUserFromRequest(req);
    if (!jwtUser) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages, model, stream = true } = await req.json();
    const userShortname = jwtUser.shortname;
    const upstreamMessages = await prepareMessagesForUpstream(messages);

    const apiKey = getApiKeyForUser(userShortname);
    if (!apiKey) {
      console.error(`[API] API Key not found for user: ${userShortname}`);
      return new Response('API Key not found', { status: 500 });
    }

    console.log(
      `[API] Calling gpt.ge for user ${userShortname} with model ${model}`
    );

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const apiBody = {
      model,
      messages: upstreamMessages,
      system: getClaudeSystemPrompt(model),
      max_tokens: 8192,
      temperature: 1,
    };

    // Non-streaming path is used by title generation.
    if (!stream) {
      const response = await fetch(getConfiguredApiUrl(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...apiBody, stream: false }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(
          `API Error: ${response.status} - ${errorText}`,
          { status: 500 }
        );
      }

      return Response.json(await response.json());
    }

    // Streaming path — pipe through directly, no tool interception
    const response = await fetch(getConfiguredApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...apiBody,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[API] gpt.ge error: ${response.status}`,
        errorText
      );
      return new Response(
        `API Error: ${response.status} ${response.statusText} - ${errorText}`,
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();
    const emit = (event: object) =>
      encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

    const outputStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of parseSSE(response.body!)) {
            // Only forward text deltas and essential stream events
            if (event.type === 'content_block_start') {
              controller.enqueue(emit(event));
            } else if (event.type === 'content_block_delta') {
              // Skip tool_use deltas, only forward text
              if (event.delta?.type === 'text_delta') {
                controller.enqueue(emit(event));
              }
            } else if (event.type === 'content_block_stop') {
              controller.enqueue(emit(event));
            } else if (event.type === 'message_start') {
              controller.enqueue(emit(event));
            } else if (event.type === 'message_delta') {
              controller.enqueue(emit(event));
            } else if (event.type === 'message_stop') {
              controller.enqueue(emit(event));
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[API] Stream processing error:', err);
          const errMsg =
            err instanceof Error ? err.message : '服务异常，请稍后重试';
          controller.enqueue(
            emit({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: `\n\n> ⚠️ ${errMsg}` },
            })
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(outputStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return new Response(
      `Internal Error: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
}
