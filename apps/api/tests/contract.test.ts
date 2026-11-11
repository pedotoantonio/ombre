import { describe, expect, it } from 'vitest';
import type { Database } from '@ombre/db';
import { createApp } from '../src/app';
import { createRateLimiter } from '../src/rate-limit';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
// These checks never reach the database.
const noDatabase = {} as Database;

describe('API contract', () => {
  const app = createApp({ db: noDatabase, holdSeconds: 600, signingSecret });

  it('describes every route it serves, and nothing else', async () => {
    const document = (await (await app.request('/v1/openapi.json')).json()) as {
      openapi: string;
      paths: Record<string, Record<string, { summary: string; requestBody?: unknown; responses: Record<string, unknown> }>>;
    };
    expect(document.openapi).toBe('3.1.0');

    const served = app.routes
      .filter((route) => route.path.startsWith('/v1/') && route.path !== '/v1/openapi.json')
      .map((route) => `${route.method.toLowerCase()} ${route.path.replace(/:([A-Za-z]+)/g, '{$1}')}`)
      .sort();
    const described = Object.entries(document.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`))
      .sort();
    expect(described).toEqual(served);
    expect(described).toHaveLength(35);

    for (const methods of Object.values(document.paths)) {
      for (const operation of Object.values(methods)) {
        expect(operation.summary.length).toBeGreaterThan(5);
        expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
      }
    }
    const hold = document.paths['/v1/holds']!.post!;
    expect(JSON.stringify(hold.requestBody)).toContain('beachSlug');
    expect(Object.keys(hold.responses)).toEqual(expect.arrayContaining(['201', '409', '429']));
  });

  it('answers unknown addresses and broken bodies without internal details', async () => {
    expect(await (await app.request('/v1/non-esiste')).json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
    const broken = await app.request('/v1/quotes', { method: 'POST', body: '{' });
    expect(broken.status).toBe(400);
  });
});

describe('request limits', () => {
  it('lets a client through up to the limit, then asks it to wait until the window ends', () => {
    let time = 1_000_000;
    const limiter = createRateLimiter(() => time);
    for (let request = 1; request <= 3; request += 1) expect(limiter.hit('a', 3, 60)).toBe(0);
    expect(limiter.hit('a', 3, 60)).toBe(60);
    expect(limiter.hit('b', 3, 60)).toBe(0);
    time += 45_000;
    expect(limiter.hit('a', 3, 60)).toBe(15);
    time += 15_000;
    expect(limiter.hit('a', 3, 60)).toBe(0);
  });

  it('stops repeated sign-in attempts from one address and leaves other addresses alone', async () => {
    const limited = createApp({ db: noDatabase, holdSeconds: 600, signingSecret, log: () => undefined });
    const attempt = (address: string) =>
      limited.request('/v1/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': address }, body: 'not json' });
    for (let request = 1; request <= 10; request += 1) expect((await attempt('203.0.113.7')).status).toBe(400);
    const stopped = await attempt('203.0.113.7');
    expect(stopped.status).toBe(429);
    expect(Number(stopped.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await stopped.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Try again shortly' } });
    expect((await attempt('203.0.113.8')).status).toBe(400);
  });
});
