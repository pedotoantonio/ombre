import { NextResponse, type NextRequest } from 'next/server';
import { notFoundSegment, readAddress } from '@ombre/shared';

/**
 * An address that matches no page gets the not-found page of its language, rendered on the
 * server, with status 404. Known addresses pass through untouched.
 *
 * The public payment links /paga/{token} and /en/pay/{token} (spec §4.3) are checked
 * here too: an unusable token — malformed, unknown, expired, cancelled, already paid —
 * is rewritten to the polite page of this section with status 404. The page itself
 * cannot answer that way: notFound() renders its boundary only through scripts on a
 * dynamic route, and the polite message must reach the visitor as plain HTML (§5).
 */

const payLink = /^\/(?:paga|en\/pay)\/([^/]+)$/;
/** The shape of a signed token; anything else is refused without asking the API. */
const payToken = /^[A-Za-z0-9._-]{10,200}$/;
/** Internal segment of the polite page; reached directly, it answers 404 all the same. */
const unavailableSegment = 'non-disponibile';

async function payLinkUsable(request: NextRequest, token: string): Promise<boolean> {
  if (!payToken.test(token)) return false;
  // The confirmation after a successful payment: the link itself is dead by then.
  if (request.nextUrl.searchParams.get('esito') === 'ok') return true;
  try {
    const api = (process.env.OMBRE_API_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
    const answer = await fetch(`${api}/v1/pay-requests/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      // The visitor's address keeps the API's request limit per client, as on the page itself.
      headers: { 'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '' },
      signal: AbortSignal.timeout(5000),
    });
    return answer.status !== 404;
  } catch {
    // API unreachable: let the page through, so it answers with its own service error.
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const pay = payLink.exec(pathname);
  if (pay) {
    const locale = pathname.startsWith('/en/') ? 'en' : 'it';
    const polite = () => NextResponse.rewrite(new URL(`/${locale}/paga/${unavailableSegment}`, request.url), { status: 404 });
    if (pay[1] === unavailableSegment) return polite();
    return (await payLinkUsable(request, pay[1] ?? '')) ? NextResponse.next() : polite();
  }
  const { locale, known } = readAddress(pathname);
  if (known) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/${locale}/${notFoundSegment}`, request.url), { status: 404 });
}

export const config = {
  // Pages only: framework files, form actions, data routes and anything that looks like a file pass
  // through. The payment links are matched apart, because their tokens contain a dot.
  matcher: ['/((?!_next/|azioni/|dati/|.*\\.[^/]*$).*)', '/paga/:path*', '/en/pay/:path*'],
};
