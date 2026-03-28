import { getApiKeyForUser } from '@/lib/auth';
import { getClaudeSystemPrompt } from '@/lib/claude-system-prompts';
import { getUserFromRequest } from '@/lib/jwt';
import { searchWeb, formatSearchResults } from '@/lib/search';

const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description:
    'Search the web for current, up-to-date information. Use this when the question requires recent news, current events, live data, real-time prices, or anything that might have changed recently and you are not confident in your knowledge.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up',
      },
    },
    required: ['query'],
  },
};

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

    // Streaming path — pipe through, intercept tool_use on the fly
    const response = await fetch(getConfiguredApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...apiBody,
        tools: [WEB_SEARCH_TOOL],
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
          // State for tracking tool use
          let stopReason = '';
          let toolUseId = '';
          let toolInputJson = '';
          let collectedText = '';
          let currentBlockType = '';

          // Parse the first stream
          for await (const event of parseSSE(response.body!)) {
            if (event.type === 'content_block_start') {
              currentBlockType = event.content_block?.type ?? '';
              if (currentBlockType === 'tool_use') {
                toolUseId = event.content_block?.id ?? '';
              }
            } else if (event.type === 'content_block_delta') {
              if (
                currentBlockType === 'text' &&
                event.delta?.type === 'text_delta'
              ) {
                // Forward text deltas to client immediately
                controller.enqueue(emit(event));
                collectedText += event.delta.text ?? '';
              } else if (
                currentBlockType === 'tool_use' &&
                event.delta?.type === 'input_json_delta'
              ) {
                // Buffer tool input
                toolInputJson += event.delta.partial_json ?? '';
              }
            } else if (event.type === 'content_block_stop') {
              currentBlockType = '';
            } else if (event.type === 'message_delta') {
              stopReason = event.delta?.stop_reason ?? '';
            }
          }

          // If Claude decided to use the search tool
          if (stopReason === 'tool_use' && toolUseId) {
            let parsedInput: { query?: string };
            try {
              parsedInput = JSON.parse(toolInputJson || '{}');
            } catch {
              parsedInput = {};
            }
            const query = parsedInput.query ?? '';

            console.log(`[API] Web search triggered: "${query}"`);

            // Notify client that search is happening
            controller.enqueue(emit({ type: 'search_used', query }));

            // Execute Tavily search
            const searchData = await searchWeb(query);
            const searchText = formatSearchResults(searchData);

            // Send search results to client for display
            controller.enqueue(
              emit({
                type: 'search_results',
                results: searchData.results.map((r) => ({
                  title: r.title,
                  url: r.url,
                  content: r.content,
                })),
              })
            );

            // Build the full assistant content for the second call
            const assistantContent: object[] = [];
            if (collectedText) {
              assistantContent.push({ type: 'text', text: collectedText });
            }
            assistantContent.push({
              type: 'tool_use',
              id: toolUseId,
              name: 'web_search',
              input: parsedInput,
            });

            const messagesWithResult = [
              ...messages,
              { role: 'assistant', content: assistantContent },
              {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: searchText,
                  },
                ],
              },
            ];

            // Second streaming call with search results
            const finalResponse = await fetch(getConfiguredApiUrl(), {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model,
                messages: messagesWithResult,
                tools: [WEB_SEARCH_TOOL],
                max_tokens: 8192,
                temperature: 1,
                stream: true,
              }),
            });

            if (!finalResponse.ok) {
              const errorText = await finalResponse.text();
              console.error(
                `[API] gpt.ge error (step 2): ${finalResponse.status}`,
                errorText
              );
              controller.close();
              return;
            }

            // Pipe the second stream through, forwarding only text deltas
            let block2Type = '';
            for await (const event2 of parseSSE(finalResponse.body!)) {
              if (event2.type === 'content_block_start') {
                block2Type = event2.content_block?.type ?? '';
              } else if (
                event2.type === 'content_block_delta' &&
                block2Type === 'text' &&
                event2.delta?.type === 'text_delta'
              ) {
                controller.enqueue(emit(event2));
              } else if (event2.type === 'content_block_stop') {
                block2Type = '';
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[API] Stream processing error:', err);
          const errMsg =
            err instanceof Error ? err.message : '搜索服务异常，请稍后重试';
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
