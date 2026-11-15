import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  accountPath,
  beachLayoutPath,
  can,
  config,
  getDictionary,
  locales,
  maxGapRows,
  rentalNotesMaxLength,
  rentalTypeMaxLength,
  rentalTypeSuggestions,
  spotZones,
  type Locale,
  type SpotZone,
} from '@ombre/shared';
import { apiCall, formatPeriod, slugPattern } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { PlanCanvas, SpotMark, widestRow, zoneRows } from './beach';
import { PageHead, PageShell } from './PageShell';

// The "Spiaggia" page of the reserved area: the preview of the beach map with its zones on
// top, the configuration forms below. Everything works without JavaScript, like the rest of
// the area. The reception sees and uses the zone distances only; the structure, the rental
// annotations, the retirement and the deletions belong to the manager.

type Query = Record<string, string | string[] | undefined>;

interface ApiActiveContract {
  contractId: string;
  validFrom: string;
  validTo: string;
  sharingMode: 'per_day' | 'automatic';
}

interface ApiLayoutSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Management annotations, never public. */
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  activeContract: ApiActiveContract | null;
}

interface ApiLayout {
  shoreGapRows: number;
  landGapRows: number;
  spots: ApiLayoutSpot[];
}

/** The label "Stagionale" is an annotation: here it is read without regard for case. */
function labelledSeasonal(rentalType: string | null): boolean {
  return rentalType !== null && rentalType.trim().toLowerCase() === 'stagionale';
}

const rentalListId = 'tipi-affitto';

function ZoneSelect({ locale, id }: { locale: Locale; id: string }) {
  const t = getDictionary(locale, config.brandName);
  return (
    <div className="field">
      <label htmlFor={id}>{t.layout.zone}</label>
      <select id={id} name="zone" required>
        {spotZones.map((zone) => (
          <option key={zone} value={zone}>
            {t.booking.zones[zone]}
          </option>
        ))}
      </select>
    </div>
  );
}

function EquipmentFields({ locale, prefix, spot }: { locale: Locale; prefix: string; spot?: ApiLayoutSpot }) {
  const l = getDictionary(locale, config.brandName).layout;
  const fields = [
    { name: 'umbrellas', label: l.umbrellas, min: 0, value: spot?.umbrellas },
    { name: 'sunbeds', label: l.sunbeds, min: 0, value: spot?.sunbeds },
    { name: 'guests', label: l.maxGuests, min: 1, value: spot?.maxGuests },
  ];
  return (
    <>
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={`${prefix}-${field.name}`}>{field.label}</label>
          <input
            id={`${prefix}-${field.name}`}
            name={field.name}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.name === 'guests' ? 20 : 10}
            defaultValue={field.value}
            required={spot !== undefined}
          />
        </div>
      ))}
    </>
  );
}

function RentalFields({ locale, prefix, rentalType, rentalNotes }: { locale: Locale; prefix: string; rentalType?: string | null; rentalNotes?: string | null }) {
  const l = getDictionary(locale, config.brandName).layout;
  return (
    <>
      <div className="field">
        <label htmlFor={`${prefix}-tipo`}>{l.rentalType}</label>
        <input
          id={`${prefix}-tipo`}
          name="rentalType"
          list={rentalListId}
          maxLength={rentalTypeMaxLength}
          autoComplete="off"
          defaultValue={rentalType ?? ''}
          aria-describedby={`${prefix}-tipo-aiuto`}
        />
        <p className="field__hint" id={`${prefix}-tipo-aiuto`}>
          {l.rentalTypeHint}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-note`}>{l.rentalNotes}</label>
        <input id={`${prefix}-note`} name="rentalNotes" maxLength={rentalNotesMaxLength} autoComplete="off" defaultValue={rentalNotes ?? ''} />
      </div>
    </>
  );
}

function SpotEditor({ locale, spot, common }: { locale: Locale; spot: ApiLayoutSpot; common: Record<string, string> }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const seasonal = labelledSeasonal(spot.rentalType);
  const htmlId = `postazione-${spot.spotId}`;
  return (
    <li className="layout-spot" id={htmlId} aria-labelledby={`${htmlId}-titolo`}>
      <p className="layout-spot__head" id={`${htmlId}-titolo`}>
        <strong>{t.booking.spot(spot.code)}</strong>
        {spot.retired ? <span className="badge">{l.retiredBadge}</span> : null}
      </p>
      <p className="layout-spot__contract">
        {spot.activeContract ? l.activeContract(formatPeriod(spot.activeContract.validFrom, spot.activeContract.validTo, locale)) : l.noContract}
      </p>
      {/* An annotation out of step with the contracts is allowed, but never silent. */}
      {seasonal && !spot.activeContract ? <p className="layout-warn">{l.warnLabelWithoutContract}</p> : null}
      {!seasonal && spot.activeContract ? <p className="layout-warn">{l.warnContractWithoutLabel}</p> : null}
      <form method="post" action="/azioni/spiaggia-modifica" className="form-row layout-spot__form">
        <Hidden values={{ ...common, spot: spot.spotId }} />
        <EquipmentFields locale={locale} prefix={htmlId} spot={spot} />
        <RentalFields locale={locale} prefix={htmlId} rentalType={spot.rentalType} rentalNotes={spot.rentalNotes} />
        <button className="button button--secondary button--small" type="submit">
          {l.saveSpot} <span className="visually-hidden">{spot.code}</span>
        </button>
      </form>
      <div className="layout-spot__actions">
        <form method="post" action="/azioni/spiaggia-ritiro" className="inline-form">
          <Hidden values={{ ...common, spot: spot.spotId, retired: spot.retired ? 'no' : 'yes' }} />
          <button className="button button--secondary button--small" type="submit">
            {spot.retired ? l.restore : l.retire} <span className="visually-hidden">{spot.code}</span>
          </button>
        </form>
        <form method="post" action="/azioni/spiaggia-elimina" className="inline-form">
          <Hidden values={{ ...common, spot: spot.spotId }} />
          <button className="button button--secondary button--small" type="submit">
            {l.remove} <span className="visually-hidden">{spot.code}</span>
          </button>
        </form>
      </div>
      <p className="layout-spot__note">{spot.retired ? l.retiredNote : l.removeNote}</p>
    </li>
  );
}

export async function BeachLayoutView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'layout.gaps')) notFound();
  const editor = can(membership.role, 'layout.edit');
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const layout = await apiCall<ApiLayout>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token });
  const spots = layout.ok ? layout.data.spots : [];
  const gaps = layout.ok ? { shoreGapRows: layout.data.shoreGapRows, landGapRows: layout.data.landGapRows } : { shoreGapRows: 1, landGapRows: 1 };
  const common = { lang: locale, beach: beachSlug };
  // Quick choices first, then every label already used in this club: the manager stays free to type anything.
  const rentalOptions = [...new Set<string>([...rentalTypeSuggestions, ...spots.flatMap((spot) => (spot.rentalType ? [spot.rentalType] : []))])];
  const hasSunbeds = spots.some((spot) => spot.umbrellas === 0);
  const hasRetired = spots.some((spot) => spot.retired);

  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={beachLayoutPath(other, beachSlug)}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: l.short },
      ]}
      signedInAs={me.user.name}
    >
      <PageHead title={l.title(membership.beachName)} lead={l.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <Link className="button button--secondary" href={accountPath(locale, 'manage', beachSlug)}>
            {l.backToManage}
          </Link>
          {!layout.ok ? (
            <div className="empty">
              <h2>{l.unavailableTitle}</h2>
              <p>{l.unavailableText}</p>
            </div>
          ) : (
            <>
              <div className="plan" role="group" aria-labelledby="anteprima-titolo" style={{ '--plan-cols': widestRow(spots) } as CSSProperties}>
                <div className="plan__head">
                  <h2 id="anteprima-titolo">{l.previewTitle}</h2>
                  <p>{l.previewLead}</p>
                </div>
                {spots.length === 0 ? (
                  <div className="empty">
                    <h3>{l.emptyTitle}</h3>
                    <p>{l.emptyText}</p>
                  </div>
                ) : (
                  <>
                    {hasSunbeds || hasRetired ? (
                      <ul className="plan-legend" aria-label={t.booking.legendTitle}>
                        {hasSunbeds ? (
                          <li>
                            <SpotMark umbrellas={0} status="free" />
                            {t.booking.sunbedMark}
                          </li>
                        ) : null}
                        {hasRetired ? (
                          <li>
                            <SpotMark umbrellas={1} status="unavailable" />
                            {l.retiredBadge}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                    <PlanCanvas
                      locale={locale}
                      gaps={gaps}
                      spots={spots}
                      idPrefix="anteprima"
                      renderSpot={(spot) => (
                        <li>
                          <span className={spot.retired ? 'plan-spot plan-spot--taken' : 'plan-spot'}>
                            <SpotMark umbrellas={spot.umbrellas} status={spot.retired ? 'unavailable' : 'free'} />
                            <span className="plan-spot__code" aria-hidden="true">
                              {spot.code}
                            </span>
                            <span className="visually-hidden">
                              {t.booking.spot(spot.code)}. {t.booking.equipment(spot.umbrellas, spot.sunbeds)}. {t.booking.guests(spot.maxGuests)}
                              {spot.retired ? `. ${t.booking.retiredMark}` : ''}
                            </span>
                          </span>
                        </li>
                      )}
                    />
                  </>
                )}
              </div>

              <div className="panel" id="distanze">
                <h2>{l.gapsTitle}</h2>
                <p className="prose">{l.gapsLead}</p>
                {!editor ? <p className="prose">{l.receptionNote}</p> : null}
                <form method="post" action="/azioni/spiaggia-distanze" className="form-row">
                  <Hidden values={common} />
                  <div className="field">
                    <label htmlFor="distanza-riva">{l.shoreGap}</label>
                    <input id="distanza-riva" name="shore" type="number" inputMode="numeric" min={0} max={maxGapRows} defaultValue={gaps.shoreGapRows} required />
                  </div>
                  <div className="field">
                    <label htmlFor="distanza-monte">{l.landGap}</label>
                    <input id="distanza-monte" name="land" type="number" inputMode="numeric" min={0} max={maxGapRows} defaultValue={gaps.landGapRows} required />
                  </div>
                  <button className="button button--secondary" type="submit">
                    {l.saveGaps}
                  </button>
                </form>
              </div>

              {editor ? (
                <>
                  <datalist id={rentalListId}>
                    {rentalOptions.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>

                  <div className="panel" id="aggiungi-fila">
                    <h2>{l.addRowTitle}</h2>
                    <p className="prose">{l.addRowLead}</p>
                    <form method="post" action="/azioni/spiaggia-fila" className="form-row">
                      <Hidden values={common} />
                      <ZoneSelect locale={locale} id="fila-zona" />
                      <div className="field">
                        <label htmlFor="fila-prefisso">{l.prefix}</label>
                        <input id="fila-prefisso" name="prefix" maxLength={4} pattern="[A-Za-z]{1,4}" autoComplete="off" required />
                      </div>
                      <div className="field">
                        <label htmlFor="fila-quante">{l.count}</label>
                        <input id="fila-quante" name="count" type="number" inputMode="numeric" min={1} max={50} required />
                      </div>
                      <EquipmentFields locale={locale} prefix="fila" />
                      <p className="field__hint">{l.equipmentHint}</p>
                      <button className="button button--secondary" type="submit">
                        {l.addRow}
                      </button>
                    </form>
                  </div>

                  <div className="panel" id="aggiungi-postazione">
                    <h2>{l.addSpotTitle}</h2>
                    <p className="prose">{l.addSpotLead}</p>
                    <form method="post" action="/azioni/spiaggia-postazione" className="form-row">
                      <Hidden values={common} />
                      <ZoneSelect locale={locale} id="postazione-zona" />
                      <div className="field">
                        <label htmlFor="postazione-codice">{l.code}</label>
                        <input id="postazione-codice" name="code" maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,9}" autoComplete="off" required />
                      </div>
                      <div className="field">
                        <label htmlFor="postazione-fila">{l.rowNumber}</label>
                        <input id="postazione-fila" name="row" type="number" inputMode="numeric" min={1} max={200} />
                      </div>
                      <EquipmentFields locale={locale} prefix="postazione" />
                      <p className="field__hint">{l.equipmentHint}</p>
                      <RentalFields locale={locale} prefix="postazione" />
                      <button className="button button--secondary" type="submit">
                        {l.addSpot}
                      </button>
                    </form>
                  </div>

                  {spots.length > 0 ? (
                    <div className="panel" id="postazioni">
                      <h2>{l.spotsTitle}</h2>
                      <p className="prose">{l.annotationsNote}</p>
                      {zoneRows(spots).flatMap(({ zone, rows }) =>
                        rows.map(({ row, spots: inRow }) => (
                          <section className="layout-row" key={`${zone}-${row}`} aria-labelledby={`modifica-${zone}-${row}`}>
                            <h3 id={`modifica-${zone}-${row}`}>
                              {t.booking.zones[zone]} · {t.booking.row(row)}
                            </h3>
                            <form method="post" action="/azioni/spiaggia-fila-affitto" className="form-row layout-row__rental">
                              <Hidden values={{ ...common, zone, row: String(row) }} />
                              <p className="layout-row__lead">
                                <strong>{l.rowRentalTitle}</strong> {l.rowRentalLead}
                              </p>
                              <RentalFields locale={locale} prefix={`fila-${zone}-${row}`} />
                              <button className="button button--secondary button--small" type="submit">
                                {l.applyRow}{' '}
                                <span className="visually-hidden">
                                  {t.booking.zones[zone]}, {t.booking.row(row)}
                                </span>
                              </button>
                            </form>
                            <ul className="layout-spots">
                              {inRow.map((spot) => (
                                <SpotEditor key={spot.spotId} locale={locale} spot={spot} common={common} />
                              ))}
                            </ul>
                          </section>
                        )),
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
