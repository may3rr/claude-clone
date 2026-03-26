import { getUserFromRequest } from '@/lib/jwt';

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return Response.json({
    shortname: user.shortname,
    displayName: user.displayName,
    role: user.role,
  });
}
