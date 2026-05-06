import { getApiKeyForUser } from '@/lib/auth';
import { getClaudeSystemPrompt } from '@/lib/claude-system-prompts';
import { getUserFromRequest } from '@/lib/jwt';

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
      messages,
      system: getClaudeSystemPrompt(model),
      max_tokens: 8192,
      temperature: 1,
    };

    // Non-streaming path is used by title generation, so don't expose web search.
    if (!stream) {
      const response = await fetch(process.env.GPT_GE_API_URL!, {
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

    // Streaming path — pipe through directly
    const response = await fetch(process.env.GPT_GE_API_URL!, {
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
            // Only forward text deltas, skip any tool_use blocks
            if (event.type === 'content_block_start') {
              controller.enqueue(emit(event));
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                controller.enqueue(emit(event));
              }
            } else if (event.type === 'content_block_stop') {
              controller.enqueue(emit(event));
            } else if (event.type === 'message_start') {
              controller.enqueue(emit(event));
            } else if (event.type === 'message_delta') {
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
