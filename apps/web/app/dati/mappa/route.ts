import { beachPath, defaultLocale, isLocale } from '@ombre/shared';
import { api } from '@/lib/api';

// Pins of the home page map. The page is prerendered and reads no data: the browser asks
// this route after the map box appears, and the server asks the API. The browser never
// talks to the API itself. Only what the map needs leaves this route.

export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get('lang') ?? '';
  const locale = isLocale(asked) ? asked : defaultLocale;
  const result = await api.beaches();
  if (!result.ok) {
    return Response.json({ error: { code: 'unavailable' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const markers = result.data.beaches.flatMap((beach) =>
    beach.latitude === null || beach.longitude === null
      ? []
      : [
          {
            slug: beach.slug,
            name: beach.name,
            locality: beach.locality,
            latitude: beach.latitude,
            longitude: beach.longitude,
            href: beachPath(locale, beach.slug),
          },
        ],
  );
  // A short shared cache keeps the API quiet without letting the pins grow stale.
  return Response.json({ markers }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
}
