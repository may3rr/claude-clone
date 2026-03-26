import { getDb } from '@/lib/db';
import { signToken, buildSetCookieHeader } from '@/lib/jwt';
import { compare } from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { shortname, password } = await req.json();

    if (!shortname || !password) {
      return Response.json({ error: '请输入用户名和密码' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT shortname, display_name, password_hash, role
      FROM users
      WHERE shortname = ${shortname.trim().toLowerCase()}
    `;

    if (rows.length === 0) {
      return Response.json({ error: '用户不存在' }, { status: 401 });
    }

    const user = rows[0];
    const valid = await compare(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: '密码错误' }, { status: 401 });
    }

    const token = await signToken({
      shortname: user.shortname,
      displayName: user.display_name,
      role: user.role,
    });

    return Response.json(
      {
        shortname: user.shortname,
        displayName: user.display_name,
        role: user.role,
      },
      {
        headers: {
          'Set-Cookie': buildSetCookieHeader(token),
        },
      }
    );
  } catch (error) {
    console.error('[auth/login]', error);
    return Response.json({ error: '登录失败' }, { status: 500 });
  }
}
