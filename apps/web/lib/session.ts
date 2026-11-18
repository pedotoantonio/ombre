import { cache } from 'react';
import { cookies } from 'next/headers';
import { config, type MembershipRole } from '@ombre/shared';
import { apiCall } from './api';

export const sessionCookie = 'ombre_session';

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookie)?.value ?? null;
}

export interface Me {
  user: { email: string; name: string; twoFactor: boolean; mustChangePassword: boolean };
  memberships: { beachSlug: string; beachName: string; role: MembershipRole }[];
}

/** The signed-in person, asked once per request however many parts of the page need it. */
export const signedIn = cache(async (): Promise<{ me: Me; token: string } | null> => {
  const token = await sessionToken();
  if (!token) return null;
  const result = await apiCall<Me>('GET', '/v1/me', { token });
  return result.ok ? { me: result.data, token } : null;
});

/** Cookie attributes: never readable by scripts, sent only over HTTPS when the site uses it. */
export function sessionCookieHeader(token: string, expiresAt: string): string {
  const secure = config.siteUrl.startsWith('https://') ? '; Secure' : '';
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * The anonymous cart ticket (D46): ONE HttpOnly cookie holding
 * «{cartId}.{beachSlug}.{accessToken}» of the most recent cart. The cart lives in the
 * server; the beach slug rides along only so the pages know which club it belongs to.
 * Opening the cart flow of another beach club replaces the cookie with a new cart:
 * accepted — the single-cookie shape keeps the navigator clean, and the old cart stays
 * in the server, found again from the account after a sign-in. Signed-in people need no
 * cookie: their carts are reached through the session.
 */
export const cartCookie = 'ombre_cart';

export interface CartTicket {
  cartId: string;
  beachSlug: string;
  accessToken: string;
}

export function parseCartTicket(value: string | undefined): CartTicket | null {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z0-9]+(?:-[a-z0-9]+)*)\.([A-Za-z0-9_-]{20,200})$/.exec(value ?? '');
  return match ? { cartId: match[1]!, beachSlug: match[2]!, accessToken: match[3]! } : null;
}

/** The cart ticket of the visitor, read by the pages; the actions read the request instead. */
export async function cartTicket(): Promise<CartTicket | null> {
  return parseCartTicket((await cookies()).get(cartCookie)?.value);
}

export function cartCookieHeader(ticket: CartTicket): string {
  const secure = config.siteUrl.startsWith('https://') ? '; Secure' : '';
  // Ninety days: the cart has no expiry of its own, prices are recomputed at every render.
  return `${cartCookie}=${ticket.cartId}.${ticket.beachSlug}.${ticket.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`;
}

export function clearCartCookieHeader(): string {
  return `${cartCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
