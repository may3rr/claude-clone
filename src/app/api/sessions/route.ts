import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';

// GET /api/sessions — list all sessions for current user
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, title, created_at
    FROM sessions
    WHERE user_shortname = ${user.shortname}
    ORDER BY updated_at DESC
  `;

  return Response.json(rows);
}

// POST /api/sessions — create a new session
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, title } = await req.json();

  if (!id) {
    return Response.json({ error: 'Missing session id' }, { status: 400 });
  }

  const sql = getDb();
  await sql`
    INSERT INTO sessions (id, user_shortname, title)
    VALUES (${id}, ${user.shortname}, ${title || 'New chat'})
    ON CONFLICT (id) DO NOTHING
  `;

  return Response.json({ id, title: title || 'New chat' });
}
