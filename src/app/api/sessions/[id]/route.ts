import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';

// GET /api/sessions/[id] — get session with messages
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const sql = getDb();

  const sessions = await sql`
    SELECT id, title, created_at
    FROM sessions
    WHERE id = ${id} AND user_shortname = ${user.shortname}
  `;

  if (sessions.length === 0) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const messages = await sql`
    SELECT id, role, content
    FROM messages
    WHERE session_id = ${id}
    ORDER BY created_at ASC
  `;

  return Response.json({
    ...sessions[0],
    messages,
  });
}

// PUT /api/sessions/[id] — rename session
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { title } = await req.json();

  const sql = getDb();
  const rows = await sql`
    INSERT INTO sessions (id, user_shortname, title)
    VALUES (${id}, ${user.shortname}, ${title || 'New chat'})
    ON CONFLICT (id) DO UPDATE
    SET
      title = ${title},
      updated_at = now()
    WHERE sessions.user_shortname = ${user.shortname}
    RETURNING id
  `;

  if (rows.length === 0) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

// DELETE /api/sessions/[id] — delete session and its messages
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const sql = getDb();

  // Messages are cascade-deleted
  await sql`
    DELETE FROM sessions
    WHERE id = ${id} AND user_shortname = ${user.shortname}
  `;

  return Response.json({ ok: true });
}
