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
  const nextTitle =
    typeof title === 'string' && title.length > 0 ? title : null;
  const messageRecords = messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));

  const [result] = await sql.query(
    `
      WITH upserted_session AS (
        INSERT INTO sessions (id, user_shortname, title)
        VALUES ($1, $2, COALESCE($3, 'New chat'))
        ON CONFLICT (id) DO UPDATE
        SET
          title = COALESCE($3, sessions.title),
          updated_at = now()
        WHERE sessions.user_shortname = $2
        RETURNING id
      ),
      inserted_messages AS (
        INSERT INTO messages (id, session_id, role, content)
        SELECT
          message_rows.id,
          upserted_session.id,
          message_rows.role,
          message_rows.content
        FROM upserted_session
        CROSS JOIN LATERAL jsonb_to_recordset($4::jsonb) AS message_rows(
          id text,
          role text,
          content jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET
          content = EXCLUDED.content,
          role = EXCLUDED.role
        RETURNING 1
      )
      SELECT
        EXISTS (SELECT 1 FROM upserted_session) AS session_written,
        COALESCE((SELECT COUNT(*)::int FROM inserted_messages), 0) AS message_count
    `,
    [
      sessionId,
      user.shortname,
      nextTitle,
      JSON.stringify(messageRecords),
    ]
  );

  if (!result?.session_written) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json({ ok: true, messageCount: result.message_count });
}
