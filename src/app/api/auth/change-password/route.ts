import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';
import { compare, hash } from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return Response.json({ error: '请先登录' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    if (!oldPassword || !newPassword) {
      return Response.json({ error: '请输入旧密码和新密码' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: '新密码至少 6 位' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT password_hash FROM users WHERE shortname = ${user.shortname}
    `;

    if (rows.length === 0) {
      return Response.json({ error: '用户不存在' }, { status: 404 });
    }

    const valid = await compare(oldPassword, rows[0].password_hash);
    if (!valid) {
      return Response.json({ error: '旧密码错误' }, { status: 401 });
    }

    const newHash = await hash(newPassword, 10);
    await sql`
      UPDATE users SET password_hash = ${newHash}, updated_at = now()
      WHERE shortname = ${user.shortname}
    `;

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[auth/change-password]', error);
    return Response.json({ error: '修改密码失败' }, { status: 500 });
  }
}
