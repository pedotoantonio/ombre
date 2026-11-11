import { notFound, redirect } from 'next/navigation';
import { accountPath, can, config, demoMedia, getDictionary, locales, siteTemplates, siteTextLimits, type DemoMediaId, type Locale, type MembershipRole, type SiteContent, type SiteTemplate, type SiteTexts } from '@ombre/shared';
import { apiCall, slugPattern } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { PageHead, PageShell } from './PageShell';
import { BeachSite } from './site-view';

type Query = Record<string, string | string[] | undefined>;
interface Revision {
  revisionId: string;
  number: number;
  version: number;
  template: SiteTemplate;
  content: SiteContent;
}
interface State {
  draft: Revision | null;
  published: Revision | null;
  history: { revisionId: string; number: number; status: 'draft' | 'published' | 'archived' }[];
}

const empty: SiteTexts = { tagline: '', description: '', services: [], openingPeriod: '', openingHours: '', address: '', phone: '', accessibility: '' };

function TextFields({ prefix, legend, texts, labels, required }: { prefix: 'it' | 'en'; legend: string; texts: SiteTexts; labels: ReturnType<typeof getDictionary>['site']; required: boolean }) {
  const id = (name: string) => `${prefix}-${name}`;
  const line = (name: 'tagline' | 'openingPeriod' | 'openingHours' | 'address' | 'phone', label: string, max: number) => (
    <div className="field field--wide">
      <label htmlFor={id(name)}>{label}</label>
      <input id={id(name)} name={`${prefix}_${name}`} defaultValue={texts[name]} maxLength={max} />
    </div>
  );
  return (
    <fieldset className="group" lang={prefix}>
      <legend>{legend}</legend>
      {line('tagline', labels.tagline, siteTextLimits.tagline)}
      <div className="field">
        <label htmlFor={id('description')}>{labels.description}</label>
        <textarea id={id('description')} name={`${prefix}_description`} defaultValue={texts.description} maxLength={siteTextLimits.description} required={required} />
      </div>
      <div className="field">
        <label htmlFor={id('services')}>{labels.services}</label>
        <textarea id={id('services')} name={`${prefix}_services`} defaultValue={texts.services.join('\n')} />
      </div>
      {line('openingPeriod', labels.openingPeriod, siteTextLimits.line)}
      {line('openingHours', labels.openingHours, siteTextLimits.line)}
      {line('address', labels.address, siteTextLimits.line)}
      {line('phone', labels.phone, siteTextLimits.phone)}
      <div className="field">
        <label htmlFor={id('accessibility')}>{labels.accessibility}</label>
        <textarea id={id('accessibility')} name={`${prefix}_accessibility`} defaultValue={texts.accessibility} maxLength={siteTextLimits.accessibility} />
      </div>
    </fieldset>
  );
}

/** Editor of the beach club website: draft, preview, publication and history. */
export async function SiteEditorView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const dictionary = getDictionary(locale, config.brandName);
  const t = dictionary.site;
  const token = await sessionToken();
  const me = token ? await apiCall<{ memberships: { beachSlug: string; beachName: string; role: MembershipRole }[] }>('GET', '/v1/me', { token }) : null;
  if (!token || !me?.ok) redirect(accountPath(locale, 'signIn'));
  const membership = me.data.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'site.read')) notFound();
  const state = await apiCall<State>('GET', `/v1/manage/beaches/${beachSlug}/site`, { token });
  if (!state.ok) notFound();

  const editable = can(membership.role, 'site.edit');
  const current = state.data.draft ?? state.data.published;
  const content = current?.content ?? { it: empty, en: null };
  const common = { lang: locale, beach: beachSlug };
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  const error = Array.isArray(query.err) ? query.err[0] : query.err;
  const errors = dictionary.account.errors as Record<string, string>;
  const preview = state.data.draft ? state.data.draft.content[locale] : null;
  const library = Object.keys(demoMedia) as DemoMediaId[];
  const idOf = (src: string | undefined) => library.find((id) => src === `/demo/${id}.svg`) ?? '';
  const coverId = idOf(content.it.images?.cover?.src);
  const galleryIds = (content.it.images?.gallery ?? []).map((image) => idOf(image.src));


  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={accountPath(other, 'site', beachSlug)}
      crumbs={[{ label: dictionary.account.overviewTitle, href: accountPath(locale, 'overview') }, { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) }, { label: t.openEditor }]}
    >
      <PageHead title={t.editorTitle(membership.beachName)} lead={t.editorLead} />
      <section className="section">
        <div className="container stack">
          {error ? <p className="alert" role="alert">{errors[error] ?? errors.invalid_request}</p> : null}
          {query.ok ? <p className="alert alert--info" role="status">{dictionary.account.saved}</p> : null}
          <p className="prose">{state.data.draft ? t.draftState(state.data.draft.number) : t.noDraft}</p>

          {editable ? (
            <form method="post" action="/azioni/sito-salva" className="stack" style={{ width: '100%' }}>
              <input type="hidden" name="lang" value={common.lang} />
              <input type="hidden" name="beach" value={common.beach} />
              <input type="hidden" name="version" value={state.data.draft?.version ?? ''} />
              <div className="field">
                <label htmlFor="modello">{t.template}</label>
                <select id="modello" name="template" defaultValue={current?.template ?? 'riviera'}>
                  {siteTemplates.map((template) => (
                    <option key={template} value={template}>{t.templates[template]}</option>
                  ))}
                </select>
              </div>
              <fieldset className="group">
                <legend>{t.imagesTitle}</legend>
                <p className="prose">{t.imagesNote}</p>
                <div className="field">
                  <label htmlFor="copertina">{t.cover}</label>
                  <select id="copertina" name="cover" defaultValue={coverId}>
                    <option value="">{t.noCover}</option>
                    {library.map((id) => (
                      <option key={id} value={id}>{demoMedia[id][locale]}</option>
                    ))}
                  </select>
                </div>
                <fieldset className="checks">
                  <legend>{t.gallery}</legend>
                  {library.map((id) => (
                    <label key={id}>
                      <input type="checkbox" name="gallery" value={id} defaultChecked={galleryIds.includes(id)} /> {demoMedia[id][locale]}
                    </label>
                  ))}
                </fieldset>
              </fieldset>
              <TextFields prefix="it" legend={t.italian} texts={content.it} labels={t} required />
              <TextFields prefix="en" legend={t.english} texts={content.en ?? empty} labels={t} required={false} />
              <button className="button" type="submit">{t.saveDraft}</button>
            </form>
          ) : null}

          {state.data.draft && preview ? (
            <div className="panel">
              <h2>{t.previewTitle}</h2>
              <BeachSite locale={locale} template={state.data.draft.template} texts={preview} />
            </div>
          ) : null}

          {editable && state.data.draft ? (
            <form method="post" action="/azioni/sito-pubblica" className="inline-form">
              <input type="hidden" name="lang" value={common.lang} />
              <input type="hidden" name="beach" value={common.beach} />
              <input type="hidden" name="version" value={state.data.draft.version} />
              <button className="button" type="submit">{t.publish}</button>
            </form>
          ) : null}

          {state.data.history.length > 0 ? (
            <div className="panel">
              <h2>{t.historyTitle}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>{t.revision}</th><th>{dictionary.account.state}</th><th>{dictionary.account.actions}</th></tr>
                  </thead>
                  <tbody>
                    {state.data.history.map((row) => (
                      <tr key={row.revisionId}>
                        <td>{row.number}</td>
                        <td>{t.revisionStates[row.status]}</td>
                        <td>
                          {editable && row.status !== 'draft' ? (
                            <form method="post" action="/azioni/sito-ripristina" className="inline-form">
                              <input type="hidden" name="lang" value={common.lang} />
                              <input type="hidden" name="beach" value={common.beach} />
                              <input type="hidden" name="revision" value={row.revisionId} />
                              <button className="button button--secondary button--small" type="submit">
                                {t.restore} <span className="visually-hidden">{row.number}</span>
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
