import { getApiKeyForUser, isValidUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { user, messages, model, stream = true } = await req.json();

    if (!isValidUser(user)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const apiKey = getApiKeyForUser(user);
    if (!apiKey) {
      console.error(`[API] API Key not found for user: ${user}`);
      return new Response('API Key not found', { status: 500 });
    }

    console.log(`[API] Calling gpt.ge for user ${user} with model ${model}`);

    const response = await fetch(process.env.GPT_GE_API_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        max_tokens: 8192,
        temperature: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] gpt.ge error: ${response.status} ${response.statusText}`, errorText);
      return new Response(`API Error: ${response.status} ${response.statusText} - ${errorText}`, { status: 500 });
    }

    // 流式：直接转发 ReadableStream
    if (stream && response.body) {
      console.log(`[API] Streaming response to client`);
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 非流式：返回 JSON
    const data = await response.json();
    console.log(`[API] Non-stream response sent`);
    return Response.json(data);
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return new Response(`Internal Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}
