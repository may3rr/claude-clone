export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

const tavilyKeys = (process.env.TAVILY_API_KEYS ?? process.env.TAVILY_API_KEY ?? '').split(',').filter(Boolean);

async function trySearch(key: string, query: string): Promise<Response> {
  return fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: true,
    }),
  });
}

export async function searchWeb(query: string): Promise<TavilyResponse> {
  // Shuffle keys so load is distributed randomly
  const shuffled = [...tavilyKeys].sort(() => Math.random() - 0.5);

  for (const key of shuffled) {
    try {
      const response = await trySearch(key, query);
      if (response.ok) {
        return (await response.json()) as TavilyResponse;
      }
      const suffix = key.slice(-4);
      console.warn(`[Search] Key ...${suffix} failed: ${response.status}, trying next`);
    } catch (err) {
      const suffix = key.slice(-4);
      console.warn(`[Search] Key ...${suffix} error:`, err);
    }
  }

  throw new Error('搜索服务暂时不可用，所有 API Key 均已失效');
}

export function formatSearchResults(data: TavilyResponse): string {
  const parts: string[] = [`Search results for: "${data.query}"`];

  if (data.answer) {
    parts.push(`\nQuick answer: ${data.answer}`);
  }

  parts.push('\nSources:');
  for (const result of data.results) {
    parts.push(`\n[${result.title}](${result.url})\n${result.content}`);
  }

  return parts.join('\n');
}
