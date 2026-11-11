import { cookies } from 'next/headers';
import { config } from '@ombre/shared';

export const sessionCookie = 'ombre_session';

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookie)?.value ?? null;
}

/** Cookie attributes: never readable by scripts, sent only over HTTPS when the site uses it. */
export function sessionCookieHeader(token: string, expiresAt: string): string {
  const secure = config.siteUrl.startsWith('https://') ? '; Secure' : '';
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
