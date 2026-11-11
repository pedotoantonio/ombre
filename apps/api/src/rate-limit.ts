/** Counts requests per key in fixed windows, in the memory of this process. */
export interface RateLimiter {
  /** Seconds to wait when the limit is exceeded, or 0 when the request may pass. */
  hit: (key: string, limit: number, windowSeconds: number) => number;
}

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = now();

  return {
    hit(key, limit, windowSeconds) {
      const time = now();
      const windowMs = windowSeconds * 1000;
      // Old windows are dropped now and then, so the map cannot grow without bound.
      if (time - lastSweep > 60_000) {
        for (const [name, entry] of windows) if (time - entry.start > 3_600_000) windows.delete(name);
        lastSweep = time;
      }
      const id = `${key}|${windowSeconds}`;
      const current = windows.get(id);
      if (!current || time - current.start >= windowMs) {
        windows.set(id, { start: time, count: 1 });
        return 0;
      }
      current.count += 1;
      return current.count > limit ? Math.max(1, Math.ceil((current.start + windowMs - time) / 1000)) : 0;
    },
  };
}
