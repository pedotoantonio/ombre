import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  accountPath,
  can,
  config,
  demoImageSrc,
  demoMedia,
  getDictionary,
  locales,
  manageSpotTypesPath,
  resolveTypeCard,
  typeCardLimits,
  type DemoMediaId,
  type Locale,
  type SpotMark,
  type TypeCardContent,
} from '@ombre/shared';
import { apiCall, slugPattern, uuidPattern } from '@/lib/api';
import { signedIn } from '@/lib/session';
import { Hidden, Notice } from './account';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';
import { TypeCardView } from './type-card';
import '@ombre/ui/media.css';

// La sottopagina «Postazioni» del gestionale (D63): l'elenco dei tipi del lido
// con lo stato della scheda, il modulo di personalizzazione, l'anteprima
// IDENTICA al pubblico (stesso componente type-card.tsx) e il ripristino alla
// predefinita con conferma, tutto senza JavaScript. Permesso: site.edit.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** A type as the management route lists it: EVERY type of the club, even without spots. */
interface ManagerType {
  typeId: string;
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  content: TypeCardContent | null;
  customized: boolean;
  builtin: boolean;
  spots: number;
  updatedAt: string | null;
}

const detailRows = [1, 2, 3, 4, 5, 6] as const;

/** The customization form of one type: empty fields keep the default, field by field. */
function CardForm({ locale, beachSlug, type }: { locale: Locale; beachSlug: string; type: ManagerType }) {
  const k = getDictionary(locale, config.brandName).typeCards;
  const library = Object.keys(demoMedia) as DemoMediaId[];
  const content = type.content;
  return (
    <div className="panel" id="scheda">
      <h2>{k.editTitle(type.name)}</h2>
      <p className="prose">{k.emptyNote}</p>
      <form method="post" action="/azioni/tipo-scheda-salva" className="stack" style={{ width: '100%' }}>
        <Hidden values={{ lang: locale, beach: beachSlug, type: type.typeId }} />
        <div className="field field--wide">
          <label htmlFor="scheda-titolo">{k.titleLabel}</label>
          <input id="scheda-titolo" name="title" maxLength={typeCardLimits.title} defaultValue={content?.title ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="scheda-descrizione-it">{k.descriptionItLabel}</label>
          <textarea id="scheda-descrizione-it" name="description_it" lang="it" maxLength={typeCardLimits.description} defaultValue={content?.descriptionIt ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="scheda-descrizione-en">{k.descriptionEnLabel}</label>
          <textarea id="scheda-descrizione-en" name="description_en" lang="en" maxLength={typeCardLimits.description} defaultValue={content?.descriptionEn ?? ''} />
        </div>
        <fieldset className="group">
          <legend>{k.photosTitle}</legend>
          <p className="prose">{k.photosNote}</p>
          {library.map((id) => {
            const chosen = content?.photos?.find((photo) => photo.id === id);
            return (
              <fieldset className="group" key={id}>
                <legend>
                  <label>
                    <input type="checkbox" name="photos" value={id} defaultChecked={Boolean(chosen)} />{' '}
                    <img className="checks__thumb" src={demoImageSrc(id)} alt="" width={72} height={48} loading="lazy" /> {demoMedia[id][locale]}
                  </label>
                </legend>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor={`didascalia-it-${id}`}>{k.captionItLabel}</label>
                    <input id={`didascalia-it-${id}`} name={`caption_it_${id}`} lang="it" maxLength={typeCardLimits.caption} defaultValue={chosen?.captionIt ?? ''} />
                  </div>
                  <div className="field">
                    <label htmlFor={`didascalia-en-${id}`}>{k.captionEnLabel}</label>
                    <input id={`didascalia-en-${id}`} name={`caption_en_${id}`} lang="en" maxLength={typeCardLimits.caption} defaultValue={chosen?.captionEn ?? ''} />
                  </div>
                </div>
              </fieldset>
            );
          })}
        </fieldset>
        <div className="form-row">
          <div className="field">
            <label htmlFor="scheda-dotazione-it">{k.equipmentNoteItLabel}</label>
            <input id="scheda-dotazione-it" name="equipment_it" lang="it" maxLength={typeCardLimits.note} defaultValue={content?.equipmentNote?.it ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="scheda-dotazione-en">{k.equipmentNoteEnLabel}</label>
            <input id="scheda-dotazione-en" name="equipment_en" lang="en" maxLength={typeCardLimits.note} defaultValue={content?.equipmentNote?.en ?? ''} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="scheda-capienza-it">{k.capacityNoteItLabel}</label>
            <input id="scheda-capienza-it" name="capacity_it" lang="it" maxLength={typeCardLimits.note} defaultValue={content?.capacityNote?.it ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="scheda-capienza-en">{k.capacityNoteEnLabel}</label>
            <input id="scheda-capienza-en" name="capacity_en" lang="en" maxLength={typeCardLimits.note} defaultValue={content?.capacityNote?.en ?? ''} />
          </div>
        </div>
        <fieldset className="group">
          <legend>{k.detailsFormTitle}</legend>
          {detailRows.map((row) => {
            const detail = content?.details?.[row - 1];
            return (
              <div className="form-row" key={row}>
                <div className="field">
                  <label htmlFor={`dettaglio-etichetta-it-${row}`}>{k.detailLabelIt(row)}</label>
                  <input id={`dettaglio-etichetta-it-${row}`} name={`detail_label_it_${row}`} lang="it" maxLength={typeCardLimits.detailLabel} defaultValue={detail?.labelIt ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor={`dettaglio-valore-it-${row}`}>{k.detailValueIt(row)}</label>
                  <input id={`dettaglio-valore-it-${row}`} name={`detail_value_it_${row}`} lang="it" maxLength={typeCardLimits.detailValue} defaultValue={detail?.valueIt ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor={`dettaglio-etichetta-en-${row}`}>{k.detailLabelEn(row)}</label>
                  <input id={`dettaglio-etichetta-en-${row}`} name={`detail_label_en_${row}`} lang="en" maxLength={typeCardLimits.detailLabel} defaultValue={detail?.labelEn ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor={`dettaglio-valore-en-${row}`}>{k.detailValueEn(row)}</label>
                  <input id={`dettaglio-valore-en-${row}`} name={`detail_value_en_${row}`} lang="en" maxLength={typeCardLimits.detailValue} defaultValue={detail?.valueEn ?? ''} />
                </div>
              </div>
            );
          })}
        </fieldset>
        <button className="button button--block" type="submit">
          {k.save}
        </button>
      </form>
    </div>
  );
}

/** La pagina «Postazioni»: elenco dei tipi, modulo, anteprima identica al pubblico, ripristino. */
export async function TypeCardsManageView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const dictionary = getDictionary(locale, config.brandName);
  const k = dictionary.typeCards;
  const session = await signedIn();
  if (!session) redirect(accountPath(locale, 'signIn'));
  const { me, token } = session;
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  // Anche la lettura chiede site.edit, come le rotte (D63): la scheda è racconto pubblico del lido.
  if (!membership || !can(membership.role, 'site.edit')) notFound();
  const state = await apiCall<{ types: ManagerType[] }>('GET', `/v1/manage/beaches/${beachSlug}/type-cards`, { token });
  if (!state.ok) notFound();
  const types = state.data.types;

  const askedType = (name: string): ManagerType | undefined => {
    const value = first(query[name]);
    return value && uuidPattern.test(value) ? types.find((type) => type.typeId === value) : undefined;
  };
  const editing = askedType('tipo');
  const previewing = askedType('anteprima');
  const resetting = askedType('ripristina');
  const self = manageSpotTypesPath(locale, beachSlug);
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  const previewCard = previewing ? resolveTypeCard(previewing, previewing.content, locale) : null;

  return (
    <ManageShell
      locale={locale}
      beachSlug={beachSlug}
      beachName={membership.beachName}
      role={membership.role}
      active="types"
      userName={me.user.name}
      alternatePath={manageSpotTypesPath(other, beachSlug)}
      crumbs={[
        { label: dictionary.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: k.manageShort },
      ]}
    >
      <PageHead title={k.manageTitle(membership.beachName)} lead={k.manageLead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <DataTable label={k.manageShort} columns={[{ label: k.nameLabel }, { label: k.spotsLabel, numeric: true }, { label: k.stateLabel }, { label: dictionary.account.actions }]}>
            {types.map((type) => (
              <Row key={type.typeId}>
                <RowHead>{type.name}</RowHead>
                <Cell label={k.spotsLabel} numeric>
                  {k.spotsCount(type.spots)}
                </Cell>
                <Cell label={k.stateLabel}>{type.customized ? k.stateCustom : k.stateDefault}</Cell>
                <Cell label={dictionary.account.actions}>
                  <p className="actions">
                    <Link className="button button--secondary button--small" href={`${self}?tipo=${type.typeId}#scheda`} prefetch={false}>
                      {k.edit} <span className="visually-hidden">{type.name}</span>
                    </Link>
                    <Link className="button button--secondary button--small" href={`${self}?anteprima=${type.typeId}#anteprima`} prefetch={false}>
                      {k.openPreview} <span className="visually-hidden">{type.name}</span>
                    </Link>
                    {/* «Torna alla predefinita» chiede conferma su questa stessa pagina, senza JavaScript. */}
                    {type.customized ? (
                      <Link className="button button--secondary button--small" href={`${self}?ripristina=${type.typeId}#ripristina`} prefetch={false}>
                        {k.reset} <span className="visually-hidden">{type.name}</span>
                      </Link>
                    ) : null}
                  </p>
                </Cell>
              </Row>
            ))}
          </DataTable>
          {types.some((type) => type.spots === 0) ? <p className="prose">{k.noSpotsNote}</p> : null}

          {resetting ? (
            <div className="panel" id="ripristina">
              <h2>{k.reset}</h2>
              <p className="prose">{k.resetConfirm(resetting.name)}</p>
              <p className="actions">
                <Link className="button button--secondary" href={self} prefetch={false}>
                  {k.resetNo}
                </Link>
              </p>
              <form method="post" action="/azioni/tipo-scheda-ripristina" className="inline-form">
                <Hidden values={{ lang: locale, beach: beachSlug, type: resetting.typeId }} />
                <button className="button" type="submit">
                  {k.resetYes} <span className="visually-hidden">{resetting.name}</span>
                </button>
              </form>
            </div>
          ) : null}

          {editing ? <CardForm locale={locale} beachSlug={beachSlug} type={editing} /> : null}

          {previewing && previewCard ? (
            <div className="panel" id="anteprima">
              <h2>{k.previewTitle(previewing.name)}</h2>
              <p className="prose">{k.previewNote}</p>
              {/* L'anteprima è IDENTICA al pubblico: lo STESSO componente della pagina pubblica (D63). */}
              <h3>{previewCard.title}</h3>
              <TypeCardView locale={locale} card={previewCard} headingLevel="h3" />
              <p className="actions">
                <Link className="button button--secondary button--small" href={self} prefetch={false}>
                  {k.closePreview}
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </ManageShell>
  );
}
