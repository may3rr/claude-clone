import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';

// POST /api/sessions/[id]/messages — save messages (bulk upsert)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const { messages, title } = await req.json();

  if (!Array.isArray(messages)) {
    return Response.json({ error: 'Invalid messages' }, { status: 400 });
  }

  const sql = getDb();

  // Ensure session exists
  await sql`
    INSERT INTO sessions (id, user_shortname, title)
    VALUES (${sessionId}, ${user.shortname}, ${title || 'New chat'})
    ON CONFLICT (id) DO UPDATE SET updated_at = now()
  `;

  // Update title if provided
  if (title) {
    await sql`
      UPDATE sessions SET title = ${title}, updated_at = now()
      WHERE id = ${sessionId} AND user_shortname = ${user.shortname}
    `;
  }

  // Upsert messages
  for (const msg of messages) {
    await sql`
      INSERT INTO messages (id, session_id, role, content)
      VALUES (${msg.id}, ${sessionId}, ${msg.role}, ${JSON.stringify(msg.content)})
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        role = EXCLUDED.role
    `;
  }

  return Response.json({ ok: true });
}
