import Link from 'next/link';
import { redirect } from 'next/navigation';
import { accountPath, config, getDictionary, locales, type Locale } from '@ombre/shared';
import { signedIn } from '@/lib/session';
import { Hidden, Notice, requireMe } from './account';
import { PageHead, PageShell } from './PageShell';

type Query = Record<string, string | string[] | undefined>;
const other = (locale: Locale): Locale => locales.find((candidate) => candidate !== locale) ?? locale;

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
