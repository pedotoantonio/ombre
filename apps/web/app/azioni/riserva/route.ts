import { beachPath, bookPath, holdPath, isLocale } from '@ombre/shared';
import { api, dayPattern, slugPattern, uuidPattern } from '@/lib/api';

function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

/** Creates the hold for the summary form, then sends the browser to the page that shows it. */
export async function POST(request: Request): Promise<Response> {
  // A form posted from another site must not act for the visitor.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const lang = text('lang');
  const beach = text('beach');
  const spotId = text('spot');
  const day = text('day');
  const key = text('key');
  const promo = text('promo').trim();
  if (!isLocale(lang) || !slugPattern.test(beach) || !uuidPattern.test(spotId) || !dayPattern.test(day) || !/^web-[0-9a-f-]{36}$/.test(key)) {
    return new Response('Bad request', { status: 400 });
  }

  const result = await api.hold({ beachSlug: beach, spotId, day, ...(promo ? { promoCode: promo } : {}) }, key);
  if (result.ok) return redirect(holdPath(lang, beach, result.data.holdId));
  if (result.code === 'promo_not_applicable') return redirect(`${bookPath(lang, beach)}?spot=${spotId}&day=${day}&promoError=1`);
  if (result.code === 'inventory_conflict') return redirect(`${beachPath(lang, beach)}?day=${day}&taken=1`);
  if (result.status === 404) return new Response('Not found', { status: 404 });
  return new Response('Service unavailable', { status: 503 });
}
