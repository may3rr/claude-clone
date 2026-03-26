import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';
import { hash } from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return Response.json({ error: '请先登录' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: '仅管理员可重置密码' }, { status: 403 });
    }

    const { targetUser, newPassword } = await req.json();

    if (!targetUser || !newPassword) {
      return Response.json({ error: '请指定目标用户和新密码' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: '新密码至少 6 位' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT shortname FROM users WHERE shortname = ${targetUser.trim().toLowerCase()}
    `;

    if (rows.length === 0) {
      return Response.json({ error: '目标用户不存在' }, { status: 404 });
    }

    const newHash = await hash(newPassword, 10);
    await sql`
      UPDATE users SET password_hash = ${newHash}, updated_at = now()
      WHERE shortname = ${targetUser.trim().toLowerCase()}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[auth/reset-password]', error);
    return Response.json({ error: '重置密码失败' }, { status: 500 });
  }
}
