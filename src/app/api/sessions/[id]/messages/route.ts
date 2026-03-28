import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';

function parseMessagePayload(body: unknown) {
  const payload = body as {
    messages?: Array<{
      id: string;
      role: string;
      content: unknown;
    }>;
    title?: string;
  };

  if (!Array.isArray(payload.messages)) {
    return null;
  }

  return {
    nextTitle:
      typeof payload.title === 'string' && payload.title.length > 0
        ? payload.title
        : null,
    messageRecords: payload.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  };
}

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
  const payload = parseMessagePayload(await req.json());
  if (!payload) {
    return Response.json({ error: 'Invalid messages' }, { status: 400 });
  }

  const sql = getDb();
  const { nextTitle, messageRecords } = payload;

  const [result] = await sql.query(
    `
      WITH incoming_messages AS (
        SELECT
          message_rows.id,
          message_rows.role,
          message_rows.content
        FROM jsonb_to_recordset($4::jsonb) AS message_rows(
          id text,
          role text,
          content jsonb
        )
      ),
      conflicting_messages AS (
        SELECT 1
        FROM messages
        WHERE id IN (SELECT id FROM incoming_messages)
          AND session_id <> $1
        LIMIT 1
      ),
      upserted_session AS (
        INSERT INTO sessions (id, user_shortname, title)
        SELECT $1, $2, COALESCE($3, 'New chat')
        WHERE NOT EXISTS (SELECT 1 FROM conflicting_messages)
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
          incoming_messages.id,
          upserted_session.id,
          incoming_messages.role,
          incoming_messages.content
        FROM upserted_session
        CROSS JOIN incoming_messages
        ON CONFLICT (id) DO UPDATE
        SET
          content = EXCLUDED.content,
          role = EXCLUDED.role
        RETURNING 1
      )
      SELECT
        EXISTS (SELECT 1 FROM upserted_session) AS session_written,
        EXISTS (SELECT 1 FROM conflicting_messages) AS has_conflict,
        COALESCE((SELECT COUNT(*)::int FROM inserted_messages), 0) AS message_count
    `,
    [
      sessionId,
      user.shortname,
      nextTitle,
      JSON.stringify(messageRecords),
    ]
  );

  if (result?.has_conflict) {
    return Response.json({ error: 'Message id conflict' }, { status: 409 });
  }

  if (!result?.session_written) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json({ ok: true, messageCount: result.message_count });
}

// PUT /api/sessions/[id]/messages — replace session messages to match client state
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const payload = parseMessagePayload(await req.json());
  if (!payload) {
    return Response.json({ error: 'Invalid messages' }, { status: 400 });
  }

  const sql = getDb();
  const { nextTitle, messageRecords } = payload;

  const [result] = await sql.query(
    `
      WITH incoming_messages AS (
        SELECT
          message_rows.id,
          message_rows.role,
          message_rows.content
        FROM jsonb_to_recordset($4::jsonb) AS message_rows(
          id text,
          role text,
          content jsonb
        )
      ),
      conflicting_messages AS (
        SELECT 1
        FROM messages
        WHERE id IN (SELECT id FROM incoming_messages)
          AND session_id <> $1
        LIMIT 1
      ),
      upserted_session AS (
        INSERT INTO sessions (id, user_shortname, title)
        SELECT $1, $2, COALESCE($3, 'New chat')
        WHERE NOT EXISTS (SELECT 1 FROM conflicting_messages)
        ON CONFLICT (id) DO UPDATE
        SET
          title = COALESCE($3, sessions.title),
          updated_at = now()
        WHERE sessions.user_shortname = $2
        RETURNING id
      ),
      deleted_messages AS (
        DELETE FROM messages
        WHERE session_id IN (SELECT id FROM upserted_session)
          AND id NOT IN (SELECT id FROM incoming_messages)
          AND NOT EXISTS (SELECT 1 FROM conflicting_messages)
        RETURNING 1
      ),
      upserted_messages AS (
        INSERT INTO messages (id, session_id, role, content)
        SELECT
          incoming_messages.id,
          upserted_session.id,
          incoming_messages.role,
          incoming_messages.content
        FROM upserted_session
        CROSS JOIN incoming_messages
        ON CONFLICT (id) DO UPDATE
        SET
          content = EXCLUDED.content,
          role = EXCLUDED.role
        RETURNING 1
      )
      SELECT
        EXISTS (SELECT 1 FROM upserted_session) AS session_written,
        EXISTS (SELECT 1 FROM conflicting_messages) AS has_conflict,
        COALESCE((SELECT COUNT(*)::int FROM upserted_messages), 0) AS message_count
    `,
    [
      sessionId,
      user.shortname,
      nextTitle,
      JSON.stringify(messageRecords),
    ]
  );

  if (result?.has_conflict) {
    return Response.json({ error: 'Message id conflict' }, { status: 409 });
  }

  if (!result?.session_written) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json({ ok: true, messageCount: result.message_count });
}
