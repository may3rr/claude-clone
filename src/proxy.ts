import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/jwt';

export function proxy(request: NextRequest) {
  const hasAuthToken = Boolean(request.cookies.get(COOKIE_NAME)?.value);
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === '/login';

  if (!hasAuthToken && !isLoginRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasAuthToken && isLoginRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
