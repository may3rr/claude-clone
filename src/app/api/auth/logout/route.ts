import { buildClearCookieHeader } from '@/lib/jwt';

export async function POST() {
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': buildClearCookieHeader(),
      },
    }
  );
}
