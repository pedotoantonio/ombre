import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { accountPath, beachPath, cartPath, config, formatMoney, getDictionary, locales, type Locale } from '@ombre/shared';
import { api, apiCall, formatDate, formatInstant, formatPeriod, localName, type ApiExtraService, type ApiLocalName } from '@/lib/api';
import { signedIn, type Me } from '@/lib/session';
import { Hidden, Notice, requireMe } from './account';
import { SpotSymbol } from './beach-art';
import { ExtraQuantityFields } from './beach';
import { PageHead, PageShell } from './PageShell';

type Query = Record<string, string | string[] | undefined>;
const other = (locale: Locale): Locale => locales.find((candidate) => candidate !== locale) ?? locale;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** A group of «Le mie prenotazioni» as the API hands it over (D47). */
interface MyBookingGroup {
  groupId: string;
  code: string;
  beachSlug: string;
  beachName: string;
  spotCode: string;
  /** La zona con nome della postazione (D50); null quando non ne ha. */
  zoneName: string | null;
  from: string;
  to: string;
  days: number;
  guestName: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  totalCents: number;
  paidCents: number;
  paymentState: 'paid' | 'partial' | 'to_collect';
  extras: { name: ApiLocalName; quantity: number }[];
  passCredential: string | null;
  /** La propria recensione del soggiorno (D51); null finché non esiste. */
  review: { rating: number; body: string | null } | null;
  /** Vero per un soggiorno concluso, non annullato e senza recensione (D51). */
  canReview: boolean;
  /** L'annullamento dal conto (D53): possibile solo entro il termine, a soggiorno non iniziato. */
  cancellation: { allowed: boolean; deadline: string | null };
}

interface MyBookings {
  nextArrivals: number;
  totalSpentCents: number;
  upcoming: MyBookingGroup[];
  past: MyBookingGroup[];
}

/** A season pass of the signed-in person, as the overview lists it. */
export interface GuestContract {
  contractId: string;
  beachName: string;
  spotCode: string;
  status: 'active' | 'suspended' | 'ended';
}

/** One booked stay of the guest, with its pass and the ways to add to it (D46, D47). */
async function MyBookingPanel({
  locale,
  group,
  catalogue,
  timezone,
  confirmAsked,
}: {
  locale: Locale;
  group: MyBookingGroup;
  catalogue: ApiExtraService[];
  /** Il fuso dello stabilimento, per scrivere il termine di annullamento (D53). */
  timezone?: string;
  /** Vero quando l'indirizzo chiede la conferma dell'annullamento di QUESTO gruppo. */
  confirmAsked?: boolean;
}) {
  const t = getDictionary(locale, config.brandName);
  const a = t.account;
  const z = t.zone;
  const period = group.from === group.to ? formatDate(group.from, locale) : t.booking.periodValue(formatPeriod(group.from, group.to, locale), group.days);
  const qr = group.passCredential ? await QRCode.toString(group.passCredential, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null;
  const remaining = group.totalCents - group.paidCents;
  return (
    <div className="panel" id={`prenotazione-${group.groupId}`}>
      <h3>{a.seasonTitle(group.spotCode, group.beachName)}</h3>
      <p className="prose">
        {/* La zona con nome accanto alla postazione (D50), con le stesse parole di ovunque. */}
        {group.code} · {group.zoneName ? `${z.badge(group.zoneName)} · ` : ''}
        {period} · {a.guest}: {group.guestName}
      </p>
      {group.extras.length > 0 ? (
        <p className="prose">
          {a.colExtras}: {group.extras.map((line) => t.booking.extraLine(localName(line.name, locale), line.quantity)).join(', ')}
        </p>
      ) : null}
      <p className="prose">
        {/* Con la caparra (D52): quanto è già «Pagato adesso» e il residuo da saldare. */}
        {a.booking}: {a.bookingStates[group.status]} · {t.booking.total}: {formatMoney(group.totalCents, locale)} · {a.colPayment}:{' '}
        {a.paymentStates[group.paymentState]}
        {remaining > 0 && group.paidCents > 0 ? ` · ${t.deposit.paidNow}: ${formatMoney(group.paidCents, locale)}` : ''}
        {remaining > 0 ? ` · ${a.residual(formatMoney(remaining, locale))}` : ''}
      </p>
      {qr ? (
        <div className="pass">
          <div role="img" aria-label={t.checkout.passAlt} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="pass__code">
            <span className="visually-hidden">{t.checkout.shortCode}: </span>
            {group.code}
          </p>
          {/* La postazione del pass col suo piccolo simbolo illustrato (D55), decorativo. */}
          <p className="pass__spot">
            <SpotSymbol state="booked" size={30} />
            <span>{t.booking.spot(group.spotCode)}</span>
          </p>
        </div>
      ) : null}
      <p>
        {/* «Aggiungi un altro periodo» (D46): the beach page, open on the last booked day. */}
        <Link className="button button--secondary" href={`${beachPath(locale, group.beachSlug)}?day=${group.to}`}>
          {a.addPeriod}
          <span className="visually-hidden">{` · ${group.beachName}`}</span>
        </Link>
      </p>
      {group.status === 'confirmed' && catalogue.length > 0 ? (
        <>
          <h4>{a.addServices}</h4>
          <p className="field__hint">{a.addServicesHint}</p>
          <form method="post" action="/azioni/conto-extra" className="form-row">
            <Hidden values={{ lang: locale, group: group.groupId }} />
            <ExtraQuantityFields locale={locale} idPrefix={`extra-${group.groupId}`} catalogue={catalogue} chosen={[]} />
            <button className="button button--secondary" type="submit">
              {a.addServicesButton}
              <span className="visually-hidden">{` · ${group.code}`}</span>
            </button>
          </form>
        </>
      ) : null}
      {/* L'annullamento dal conto (D53): entro il termine il gesto con la conferma senza
          script; oltre il termine SOLO il testo che rimanda allo stabilimento. */}
      {group.status === 'confirmed' && group.cancellation.allowed && group.cancellation.deadline ? (
        <>
          <p className="prose">
            <strong>{t.cancel.deadline(formatInstant(group.cancellation.deadline, locale, timezone ?? 'Europe/Rome'))}</strong>
          </p>
          {confirmAsked ? (
            <div className="alert" role="alert">
              <p>{t.cancel.confirm(formatMoney(group.paidCents, locale))}</p>
              <form method="post" action="/azioni/conto-annulla" className="inline-form">
                <Hidden values={{ lang: locale, group: group.groupId, paid: String(group.paidCents) }} />
                <button className="button" type="submit">
                  {t.cancel.confirmYes}
                  <span className="visually-hidden">{` · ${group.code}`}</span>
                </button>
              </form>{' '}
              <Link className="button button--secondary" href={accountPath(locale, 'overview')}>
                {t.cancel.confirmNo}
              </Link>
            </div>
          ) : (
            <p>
              <Link className="button button--secondary" href={`${accountPath(locale, 'overview')}?conferma=${group.groupId}#prenotazione-${group.groupId}`}>
                {t.cancel.button}
                <span className="visually-hidden">{` · ${group.code}`}</span>
              </Link>
            </p>
          )}
        </>
      ) : null}
      {group.status === 'confirmed' && !group.cancellation.allowed ? <p className="prose">{t.cancel.tooLate}</p> : null}
      {/* La recensione del soggiorno concluso (D51): il modulo, oppure la propria recensione. */}
      {group.canReview ? (
        <form method="post" action="/azioni/conto-recensione" className="stack">
          <Hidden values={{ lang: locale, group: group.groupId }} />
          <h4>{t.reviews.formTitle}</h4>
          <fieldset className="field">
            <legend>{t.reviews.ratingLabel}</legend>
            <p className="field__hint">{t.reviews.ratingScale}</p>
            <div className="form-row">
              {[1, 2, 3, 4, 5].map((value) => (
                <label className="portal-check" key={value} htmlFor={`voto-${group.groupId}-${value}`}>
                  <input id={`voto-${group.groupId}-${value}`} type="radio" name="rating" value={value} required />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor={`recensione-${group.groupId}`}>{t.reviews.bodyLabel}</label>
            {/* L'avviso PRIMA del campo: il testo non si modifica dopo l'invio. */}
            <p className="field__hint" id={`recensione-${group.groupId}-nota`}>
              {t.reviews.bodyHint}
            </p>
            <textarea id={`recensione-${group.groupId}`} name="body" maxLength={600} rows={4} aria-describedby={`recensione-${group.groupId}-nota`} />
          </div>
          <p className="field__hint">{t.reviews.publicName}</p>
          <button className="button button--secondary" type="submit">
            {t.reviews.submit}
            <span className="visually-hidden">{` · ${group.code}`}</span>
          </button>
        </form>
      ) : null}
      {group.review ? (
        <>
          <h4>{t.reviews.yours}</h4>
          <p className="prose">
            <strong>{t.reviews.rating(group.review.rating)}</strong>
            {group.review.body ? ` · ${group.review.body}` : ''}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * «Il mio conto» (D44/D47): the overview of a person without memberships. The numbers in
 * the head, the stays across beach clubs, then the personal data. The season passes and
 * the sea cabins, when there are any, keep the panels of the ordinary overview.
 */
export async function GuestOverview({
  locale,
  me,
  token,
  query,
  contracts,
  cabinsCount,
}: {
  locale: Locale;
  me: Me;
  token: string;
  query: Query;
  contracts: GuestContract[];
  cabinsCount: number;
}) {
  const t = getDictionary(locale, config.brandName);
  const a = t.account;
  const [result, cartsResult] = await Promise.all([
    apiCall<MyBookings>('GET', '/v1/account/bookings', { token }),
    apiCall<{ carts: { cartId: string; beachSlug: string; beachName: string; items: number }[] }>('GET', '/v1/account/carts', { token }),
  ]);
  const bookings: MyBookings = result.ok ? result.data : { nextArrivals: 0, totalSpentCents: 0, upcoming: [], past: [] };
  const carts = cartsResult.ok ? cartsResult.data.carts : [];
  // The extra services of each beach club with an upcoming stay, asked once per club
  // (D46 §5); the same answer hands over the club's time zone, for the cancellation
  // deadline of D53 written in local time.
  const slugs = [...new Set(bookings.upcoming.filter((group) => group.status === 'confirmed').map((group) => group.beachSlug))];
  const catalogues = new Map(
    await Promise.all(
      slugs.map(async (slug): Promise<[string, { extras: ApiExtraService[]; timezone?: string }]> => {
        const extras = await api.extras(slug);
        return [slug, extras.ok ? { extras: extras.data.extras, timezone: extras.data.beach.timezone } : { extras: [] }];
      }),
    ),
  );
  // La conferma dell'annullamento (D53): il gruppo chiesto nell'indirizzo, senza script.
  const confirmGroup = first(query.conferma);
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'overview')} crumbs={[{ label: a.myAccountTitle }]} signedInAs={me.user.name}>
      <PageHead title={a.myAccountTitle} lead={a.hello(me.user.name)} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <div className="panel">
            <p className="prose">
              <strong>{a.nextArrivals}: {bookings.nextArrivals}</strong> · {a.totalSpent}: <strong>{formatMoney(bookings.totalSpentCents, locale)}</strong>
            </p>
          </div>
          <div className="panel">
            <h2>{a.myBookingsTitle}</h2>
            {bookings.upcoming.length === 0 && bookings.past.length === 0 ? <p className="prose">{a.noMyBookings}</p> : null}
            {bookings.upcoming.length > 0 ? (
              <>
                <h3>{a.upcomingTitle}</h3>
                {bookings.upcoming.map((group) => (
                  <MyBookingPanel
                    key={group.groupId}
                    locale={locale}
                    group={group}
                    catalogue={catalogues.get(group.beachSlug)?.extras ?? []}
                    timezone={catalogues.get(group.beachSlug)?.timezone}
                    confirmAsked={confirmGroup === group.groupId}
                  />
                ))}
              </>
            ) : null}
            {bookings.past.length > 0 ? (
              <>
                <h3>{a.pastTitle}</h3>
                {bookings.past.map((group) => (
                  <MyBookingPanel key={group.groupId} locale={locale} group={group} catalogue={[]} />
                ))}
              </>
            ) : null}
          </div>
          {carts.length > 0 ? (
            <div className="panel">
              <h2>{a.myCartsTitle}</h2>
              <ul className="cards">
                {carts.map((row) => (
                  <li className="card" key={row.cartId}>
                    <h3>{row.beachName}</h3>
                    <p>{a.cartLine(row.items)}</p>
                    <Link className="card__link" href={cartPath(locale, row.beachSlug)}>
                      {a.openCart}
                      <span className="visually-hidden">{` · ${row.beachName}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {contracts.length > 0 ? (
            <div className="panel">
              <h2>{a.contractsTitle}</h2>
              <ul className="cards">
                {contracts.map((contract) => (
                  <li className="card" key={contract.contractId}>
                    <h3>{a.seasonTitle(contract.spotCode, contract.beachName)}</h3>
                    <p>{a.contractStates[contract.status]}</p>
                    <Link className="card__link" href={accountPath(locale, 'season', contract.contractId)}>
                      {a.open}
                      <span className="visually-hidden">{` ${a.seasonTitle(contract.spotCode, contract.beachName)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {cabinsCount > 0 ? (
            <div className="panel">
              <h2>{a.myCabinsTitle}</h2>
              <p className="prose">{a.myCabinsText}</p>
              <p>
                <Link className="button button--secondary" href={accountPath(locale, 'cabins')}>
                  {a.open}
                  <span className="visually-hidden">{` ${a.myCabinsTitle}`}</span>
                </Link>
              </p>
            </div>
          ) : null}
          <div className="panel">
            <h2>{a.myDataTitle}</h2>
            <p className="prose">
              {a.nameLabel}: <strong>{me.user.name}</strong> · {a.email}: <strong>{me.user.email}</strong>
            </p>
            <p>
              <Link className="button button--secondary" href={accountPath(locale, 'password')}>
                {a.passwordLink}
              </Link>
            </p>
            <h3>{a.twoFactorTitle}</h3>
            <p className="prose">{me.user.twoFactor ? a.twoFactorOn : a.twoFactorOff}</p>
            {me.user.twoFactor ? null : (
              <p>
                <a className="button button--secondary" href={accountPath(locale, 'twoFactor')}>{a.twoFactorStart}</a>
              </p>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/** «Crea un conto» (D44): name and email, nothing else; the password travels by email. */
export async function RegisterView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  if (await signedIn()) redirect(accountPath(locale, 'overview'));
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'register')} crumbs={[{ label: t.registerTitle }]}>
      <PageHead title={t.registerTitle} lead={t.registerLead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <form method="post" action="/azioni/registrazione" className="stack">
            <Hidden values={{ lang: locale }} />
            <div className="field">
              <label htmlFor="nome">{t.registerName}</label>
              <input id="nome" name="name" autoComplete="name" maxLength={120} required />
            </div>
            <div className="field">
              <label htmlFor="email">{t.registerEmail}</label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={200} required />
            </div>
            <button className="button button--block" type="submit">{t.registerButton}</button>
          </form>
          <p>
            <Link href={accountPath(locale, 'signIn')}>{t.toSignIn}</Link>
          </p>
        </div>
      </section>
    </PageShell>
  );
}

/**
 * The local consent page of the TEST identity provider (D48): it says plainly that it
 * simulates Google, asks the email and the name, and carries the signed state through.
 * With the real Google the visitor never lands here.
 */
export async function OidcConsentView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  const state = ((value) => (Array.isArray(value) ? value[0] : value))(query.state) ?? '';
  const providers = await apiCall<{ provider: 'test' | 'google' | null }>('GET', '/v1/auth/oidc/providers');
  if (!providers.ok || providers.data.provider !== 'test' || state === '' || state.length > 300) redirect(accountPath(locale, 'signIn'));
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'oidcConsent')} crumbs={[{ label: t.consentTitle }]}>
      <PageHead title={t.consentTitle} lead={t.consentLead} />
      <section className="section">
        <div className="container stack">
          <form method="post" action="/azioni/oidc-consenso" className="stack">
            <Hidden values={{ lang: locale, state }} />
            <div className="field">
              <label htmlFor="consenso-email">{t.consentEmail}</label>
              <input id="consenso-email" name="email" type="email" autoComplete="email" maxLength={200} required />
            </div>
            <div className="field">
              <label htmlFor="consenso-nome">{t.consentName}</label>
              <input id="consenso-nome" name="name" autoComplete="name" maxLength={120} required />
            </div>
            <button className="button button--block" type="submit">{t.consentButton}</button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}

/**
 * «Cambia la password» (D44): forced while the generated password is in place — every
 * other reserved page redirects here — and voluntary from the account afterwards.
 */
export async function PasswordView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  const { me } = await requireMe(locale, { allowPendingPasswordChange: true });
  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={accountPath(other(locale), 'password')}
      crumbs={[{ label: t.overviewTitle, href: accountPath(locale, 'overview') }, { label: t.passwordTitle }]}
      signedInAs={me.user.name}
    >
      <PageHead title={t.passwordTitle} lead={t.passwordLead} />
      <section className="section">
        <div className="container stack">
          {me.user.mustChangePassword ? <p className="alert" role="alert">{t.passwordForced}</p> : null}
          <Notice locale={locale} query={query} />
          <form method="post" action="/azioni/cambia-password" className="stack">
            <Hidden values={{ lang: locale }} />
            <div className="field">
              <label htmlFor="password-attuale">{t.passwordCurrent}</label>
              <input id="password-attuale" name="current" type="password" autoComplete="current-password" maxLength={200} required />
            </div>
            <div className="field">
              <label htmlFor="password-nuova">{t.passwordNew}</label>
              <input id="password-nuova" name="next" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
            </div>
            <div className="field">
              <label htmlFor="password-ripeti">{t.passwordRepeat}</label>
              <input id="password-ripeti" name="repeat" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
            </div>
            <button className="button button--block" type="submit">{t.passwordButton}</button>
          </form>
          {me.user.mustChangePassword ? null : (
            <p>
              <Link href={accountPath(locale, 'overview')}>{t.overviewTitle}</Link>
            </p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
