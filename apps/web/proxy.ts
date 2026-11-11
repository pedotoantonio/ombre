import { NextResponse, type NextRequest } from 'next/server';
import { notFoundSegment, readAddress } from '@ombre/shared';

/**
 * An address that matches no page gets the not-found page of its language, rendered on the
 * server, with status 404. Known addresses pass through untouched.
 */
export function proxy(request: NextRequest) {
  const { locale, known } = readAddress(request.nextUrl.pathname);
  if (known) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/${locale}/${notFoundSegment}`, request.url), { status: 404 });
}

export const config = {
  // Pages only: framework files, form actions and anything that looks like a file pass through.
  matcher: ['/((?!_next/|azioni/|.*\\.[^/]*$).*)'],
};
