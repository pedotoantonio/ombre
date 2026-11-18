import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { accountPath, beachPath, cartPath, config, formatMoney, getDictionary, locales, type Locale } from '@ombre/shared';
import { api, apiCall, formatDate, formatPeriod, localName, type ApiExtraService, type ApiLocalName } from '@/lib/api';
import { signedIn, type Me } from '@/lib/session';
import { Hidden, Notice, requireMe } from './account';
import { ExtraQuantityFields } from './beach';
import { PageHead, PageShell } from './PageShell';

type Query = Record<string, string | string[] | undefined>;
const other = (locale: Locale): Locale => locales.find((candidate) => candidate !== locale) ?? locale;

/** A group of «Le mie prenotazioni» as the API hands it over (D47). */
interface MyBookingGroup {
  groupId: string;
  code: string;
  beachSlug: string;
  beachName: string;
  spotCode: string;
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
async function MyBookingPanel({ locale, group, catalogue }: { locale: Locale; group: MyBookingGroup; catalogue: ApiExtraService[] }) {
  const t = getDictionary(locale, config.brandName);
  const a = t.account;
  const period = group.from === group.to ? formatDate(group.from, locale) : t.booking.periodValue(formatPeriod(group.from, group.to, locale), group.days);
  const qr = group.passCredential ? await QRCode.toString(group.passCredential, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null;
  const remaining = group.totalCents - group.paidCents;
  return (
    <div className="panel">
      <h3>{a.seasonTitle(group.spotCode, group.beachName)}</h3>
      <p className="prose">
        {group.code} · {period} · {a.guest}: {group.guestName}
      </p>
      {group.extras.length > 0 ? (
        <p className="prose">
          {a.colExtras}: {group.extras.map((line) => t.booking.extraLine(localName(line.name, locale), line.quantity)).join(', ')}
        </p>
      ) : null}
      <p className="prose">
        {a.booking}: {a.bookingStates[group.status]} · {t.booking.total}: {formatMoney(group.totalCents, locale)} · {a.colPayment}:{' '}
        {a.paymentStates[group.paymentState]}
        {remaining > 0 ? ` · ${a.residual(formatMoney(remaining, locale))}` : ''}
      </p>
      {qr ? (
        <div className="pass">
          <div role="img" aria-label={t.checkout.passAlt} dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="pass__code">
            <span className="visually-hidden">{t.checkout.shortCode}: </span>
            {group.code}
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
  // The extra services of each beach club with an upcoming stay, asked once per club (D46 §5).
  const slugs = [...new Set(bookings.upcoming.filter((group) => group.status === 'confirmed').map((group) => group.beachSlug))];
  const catalogues = new Map(
    await Promise.all(
      slugs.map(async (slug): Promise<[string, ApiExtraService[]]> => {
        const extras = await api.extras(slug);
        return [slug, extras.ok ? extras.data.extras : []];
      }),
    ),
  );
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
                  <MyBookingPanel key={group.groupId} locale={locale} group={group} catalogue={catalogues.get(group.beachSlug) ?? []} />
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
