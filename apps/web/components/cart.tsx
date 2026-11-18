import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { beachPath, cartSegment, config, formatMoney, getDictionary, orderSegment, type Locale } from '@ombre/shared';
import { apiCall, api, formatDate, formatDay, formatPeriod, localName, periodDays, uuidPattern, type ApiBeach, type ApiExtraRequest, type ApiExtraService, type ApiQuoteDay } from '@/lib/api';
import { cartTicket, signedIn } from '@/lib/session';
import { Hidden, Notice } from './account';
import { crumbsFor, DemoBadge, ExtraQuantityFields, loadBeach, otherLocale } from './beach';
import { PageHead, PageShell } from './PageShell';

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** A cart item as the API lists it: the stored fields, plus the live money when quotable. */
interface ApiCartItem {
  itemId: string;
  spotId: string;
  spot: { code: string; rowNumber: number; zone: string; typeName: string; typeMark: string; umbrellas: number; sunbeds: number };
  from: string;
  to: string;
  guestName: string;
  promoCode: string | null;
  /** The chosen quantities; the names come from the live catalogue of the club. */
  extras: ApiExtraRequest[];
  ok: boolean;
  reason: string | null;
  listPriceCents?: number;
  discountCents?: number;
  extrasCents?: number;
  totalCents?: number;
  days?: ApiQuoteDay[];
}

interface ApiCartView {
  cartId: string;
  currency: string;
  items: ApiCartItem[];
  totalCents: number;
  allAvailable: boolean;
}

/** One cart item: period, live prices, the inline «per chi è» form and the way out. */
function CartItem({ locale, beach, cartId, item, catalogue }: { locale: Locale; beach: ApiBeach; cartId: string; item: ApiCartItem; catalogue: ApiExtraService[] }) {
  const t = getDictionary(locale, config.brandName);
  const c = t.cart;
  const b = t.booking;
  const known = t.account.errors as Record<string, string>;
  const names = new Map(catalogue.map((service) => [service.serviceId, service]));
  const period = item.from === item.to ? formatDate(item.from, locale) : b.periodValue(formatPeriod(item.from, item.to, locale), periodDays(item.from, item.to));
  const common = { lang: locale, beach: beach.slug, cart: cartId, item: item.itemId };
  return (
    <div className="panel">
      <h3>
        {b.spot(item.spot.code)} · {item.spot.typeName}
      </h3>
      <p className="prose">
        {period}. {b.equipment(item.spot.umbrellas, item.spot.sunbeds)}.
      </p>
      {item.ok ? null : (
        <p className="alert" role="alert">
          {c.itemUnavailable(known[item.reason ?? ''] ?? known.invalid_request ?? '')}
        </p>
      )}
      <dl className="summary">
        {/* Le giornate del periodo, una riga col suo prezzo, come nel riepilogo (D39). */}
        {item.days && item.days.length > 1
          ? item.days.map((entry) => (
              <div key={entry.day}>
                <dt>{formatDay(entry.day, locale)}</dt>
                <dd>{formatMoney(entry.totalCents, locale)}</dd>
              </div>
            ))
          : null}
        {typeof item.listPriceCents === 'number' ? (
          <div>
            <dt>{b.listPrice}</dt>
            <dd>{formatMoney(item.listPriceCents, locale)}</dd>
          </div>
        ) : null}
        {item.promoCode && typeof item.discountCents === 'number' && item.discountCents > 0 ? (
          <div>
            <dt>{b.discount(item.promoCode)}</dt>
            <dd>{formatMoney(-item.discountCents, locale)}</dd>
          </div>
        ) : null}
        {item.extras.map((line) => {
          const service = names.get(line.serviceId);
          return service ? (
            <div key={line.serviceId}>
              <dt>{b.extraLine(localName(service.name, locale), line.quantity)}</dt>
              <dd>{formatMoney(service.unitPriceCents * line.quantity, locale)}</dd>
            </div>
          ) : null;
        })}
        {typeof item.totalCents === 'number' ? (
          <div className="summary__total">
            <dt>{b.total}</dt>
            <dd>{formatMoney(item.totalCents, locale)}</dd>
          </div>
        ) : null}
      </dl>
      {/* «Per chi è» and the quantities, one form per item: the set posted replaces the set stored. */}
      <form method="post" action="/azioni/carrello-voce" className="form-row">
        <Hidden values={common} />
        <div className="field">
          <label htmlFor={`voce-${item.itemId}-nome`}>{c.itemFor}</label>
          <input id={`voce-${item.itemId}-nome`} name="name" maxLength={120} defaultValue={item.guestName} autoComplete="off" />
        </div>
        {catalogue.length > 0 ? <ExtraQuantityFields locale={locale} idPrefix={`voce-${item.itemId}`} catalogue={catalogue} chosen={item.extras} /> : null}
        <button className="button button--secondary" type="submit">
          {c.itemUpdate} <span className="visually-hidden">{item.spot.code}</span>
        </button>
      </form>
      <form method="post" action="/azioni/carrello-rimuovi" className="inline-form">
        <Hidden values={common} />
        <button className="button button--secondary button--small" type="submit">
          {c.itemRemove} <span className="visually-hidden">{item.spot.code}</span>
        </button>
      </form>
    </div>
  );
}

/**
 * The cart page of one beach club (D46): items with live prices and availability, the
 * inline forms, the grand total and «Conferma e paga». Signed in, the cart comes from
 * the account; otherwise from the ticket cookie of this beach club.
 */
export async function CartPage({ lang, section, slug, step, query }: { lang: string; section: string; slug: string; step: string; query: Query }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== cartSegment[locale]) notFound();
  const t = getDictionary(locale, config.brandName);
  const c = t.cart;
  const session = await signedIn();
  let access: { cartId: string; token: string } | null = null;
  if (session) {
    const carts = await apiCall<{ carts: { cartId: string; beachSlug: string }[] }>('GET', '/v1/account/carts', { token: session.token });
    const row = carts.ok ? carts.data.carts.find((entry) => entry.beachSlug === beach.slug) : undefined;
    if (row) access = { cartId: row.cartId, token: session.token };
  } else {
    const ticket = await cartTicket();
    if (ticket && ticket.beachSlug === beach.slug) access = { cartId: ticket.cartId, token: ticket.accessToken };
  }
  const view = access ? await apiCall<ApiCartView>('GET', `/v1/carts/${access.cartId}`, { token: access.token }) : null;
  const cart = view?.ok ? view.data : null;
  const catalogueResult = await api.extras(beach.slug);
  const catalogue = catalogueResult.ok ? catalogueResult.data.extras : [];

  // The refusal of «Conferma e paga» names the culprit item: spot code and period (D46).
  const vspot = first(query.vspot);
  const vdal = first(query.vdal);
  const val = first(query.val);
  const named = first(query.err) === 'order_item_unavailable' && vspot && vdal;

  return (
    <PageShell locale={locale} page="search" alternatePath={`${beachPath(otherLocale(locale), beach.slug)}/${cartSegment[otherLocale(locale)]}`} crumbs={crumbsFor(locale, beach, c.title)}>
      <PageHead title={c.title} lead={c.lead(beach.name)} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          {named ? (
            <p className="alert" role="alert">
              {c.itemUnavailableNamed(vspot, val ? formatPeriod(vdal, val, locale) : c.onDay(formatDate(vdal, locale)))}
            </p>
          ) : (
            <Notice locale={locale} query={query} />
          )}
          {!cart || cart.items.length === 0 ? (
            <div className="empty">
              <h2>{c.empty}</h2>
              <Link className="button button--secondary" href={beachPath(locale, beach.slug)}>
                {t.booking.backToBeach}
              </Link>
            </div>
          ) : (
            <>
              <p className="prose">{c.notReserved}</p>
              {cart.items.map((item) => (
                <CartItem key={item.itemId} locale={locale} beach={beach} cartId={cart.cartId} item={item} catalogue={catalogue} />
              ))}
              <div className="panel">
                <h2>{c.confirmTitle}</h2>
                <p className="prose">{c.confirmLead}</p>
                <p className="prose">
                  <strong>
                    {c.total}: {formatMoney(cart.totalCents, locale)}
                  </strong>
                </p>
                {cart.allAvailable ? null : (
                  <p className="alert" role="alert">
                    {c.confirmBlocked}
                  </p>
                )}
                <form method="post" action="/azioni/carrello-conferma" className="stack">
                  <Hidden values={{ lang: locale, beach: beach.slug, cart: cart.cartId }} />
                  <div className="field">
                    <label htmlFor="conferma-nome">{t.checkout.name}</label>
                    <input id="conferma-nome" name="name" autoComplete="name" maxLength={120} defaultValue={session?.me.user.name ?? ''} required />
                  </div>
                  <div className="field">
                    <label htmlFor="conferma-email">{t.checkout.email}</label>
                    <input id="conferma-email" name="email" type="email" autoComplete="email" maxLength={200} defaultValue={session?.me.user.email ?? ''} required />
                  </div>
                  <button className="button button--block" type="submit" disabled={!cart.allAvailable}>
                    {c.confirmButton}
                  </button>
                </form>
              </div>
              <Link className="button button--secondary" href={beachPath(locale, beach.slug)}>
                {t.booking.backToBeach}
              </Link>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}

interface ApiOrderItem {
  code: string;
  spotCode: string;
  from: string;
  to: string;
  guestName: string;
  status: 'draft' | 'under_review' | 'confirmed' | 'cancelled' | 'completed';
  totalCents: number;
  passCredential: string | null;
}

interface ApiOrder {
  orderId: string;
  code: string;
  guestName: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: 'paid' | 'partial' | 'to_collect';
  payment: { provider: string; reference: string; status: 'not_started' | 'in_progress' | 'succeeded' | 'failed' | 'under_review' } | null;
  items: ApiOrderItem[];
}

/**
 * The single order summary (D46): every item with its booking code, state and pass, the
 * total and the one payment, behind the signed ticket handed out at confirmation.
 */
export async function OrderPage({ lang, section, slug, step, orderId, token }: { lang: string; section: string; slug: string; step: string; orderId: string; token: string | undefined }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== orderSegment[locale] || !uuidPattern.test(orderId) || !token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) notFound();
  const result = await apiCall<ApiOrder>('GET', `/v1/beaches/${beach.slug}/orders/${orderId}`, { token });
  if (!result.ok) {
    if (result.status === 404 || result.status === 401) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const order = result.data;
  const t = getDictionary(locale, config.brandName);
  const o = t.order;
  const a = t.account;
  const b = t.booking;
  const cancelled = order.items.length > 0 && order.items.every((item) => item.status === 'cancelled');
  const lead = cancelled ? o.cancelled : order.paymentState === 'paid' ? o.paid : o.toPay;
  const waiting = !cancelled && order.payment?.status === 'in_progress';
  const sandbox = Boolean(process.env.OMBRE_SANDBOX_WEBHOOK_SECRET);
  const passes = new Map(
    await Promise.all(
      order.items
        .filter((item) => item.passCredential)
        .map(async (item): Promise<[string, string]> => [item.code, await QRCode.toString(item.passCredential!, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })]),
    ),
  );
  const common = { lang: locale, beach: beach.slug, order: orderId, t: token };

  return (
    <PageShell
      locale={locale}
      page="search"
      alternatePath={`${beachPath(otherLocale(locale), beach.slug)}/${orderSegment[otherLocale(locale)]}/${orderId}?t=${encodeURIComponent(token)}`}
      crumbs={crumbsFor(locale, beach, order.code)}
    >
      <PageHead title={o.title(order.code)} lead={lead} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          <dl className="summary">
            <div>
              <dt>{t.checkout.paymentRow}</dt>
              <dd>{a.paymentStates[order.paymentState]}</dd>
            </div>
            {order.paidCents > 0 && order.paidCents !== order.totalCents ? (
              <div>
                <dt>{o.paidRow}</dt>
                <dd>{formatMoney(order.paidCents, locale)}</dd>
              </div>
            ) : null}
            <div className="summary__total">
              <dt>{o.totalRow}</dt>
              <dd>{formatMoney(order.totalCents, locale)}</dd>
            </div>
          </dl>
          {waiting && sandbox ? (
            <div className="panel">
              <h2>{t.checkout.sandboxTitle}</h2>
              <p className="prose">{t.checkout.sandboxLead}</p>
              <form method="post" action="/azioni/ordine-prova" className="form-row">
                <Hidden values={common} />
                <button className="button" type="submit" name="outcome" value="succeeded">
                  {t.checkout.sandboxPay}
                </button>
                <button className="button button--secondary" type="submit" name="outcome" value="failed">
                  {t.checkout.sandboxFail}
                </button>
              </form>
            </div>
          ) : null}
          {waiting && !sandbox ? <p className="alert alert--info">{t.checkout.noProvider}</p> : null}
          <h2>{o.itemsTitle}</h2>
          {order.items.map((item) => {
            const qr = passes.get(item.code);
            const period = item.from === item.to ? formatDate(item.from, locale) : b.periodValue(formatPeriod(item.from, item.to, locale), periodDays(item.from, item.to));
            return (
              <div className="panel" key={item.code}>
                <h3>{t.checkout.bookingTitle(item.code)}</h3>
                <p className="prose">
                  {b.spot(item.spotCode)}. {period}. {a.guest}: {item.guestName}. {a.booking}: {a.bookingStates[item.status]}.{' '}
                  {b.total}: {formatMoney(item.totalCents, locale)}.
                </p>
                {qr ? (
                  <div className="pass">
                    <div role="img" aria-label={t.checkout.passAlt} dangerouslySetInnerHTML={{ __html: qr }} />
                    <p className="pass__code">
                      <span className="visually-hidden">{t.checkout.shortCode}: </span>
                      {item.code}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="prose">{t.checkout.keepPrivate}</p>
          <Link className="button button--secondary" href={beachPath(locale, beach.slug)}>
            {b.backToBeach}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
