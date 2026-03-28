import { getDb } from '@/lib/db';
import { signToken, buildSetCookieHeader } from '@/lib/jwt';
import { compare } from 'bcryptjs';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

function getClientKey(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_LOGIN_ATTEMPTS;
}

export async function POST(req: Request) {
  try {
    const clientKey = getClientKey(req);
    if (isRateLimited(clientKey)) {
      return Response.json({ error: '请求过于频繁，请稍后重试' }, { status: 429 });
    }

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

    loginAttempts.delete(clientKey);

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
