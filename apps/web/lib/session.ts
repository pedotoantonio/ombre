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
