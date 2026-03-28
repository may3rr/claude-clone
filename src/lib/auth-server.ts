import { cookies } from 'next/headers';
import { COOKIE_NAME, type JwtPayload, verifyToken } from '@/lib/jwt';

export async function getUserFromCookies(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}
