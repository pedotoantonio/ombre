import { cache, Fragment, type CSSProperties, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  beachAmenities,
  beachPath,
  beachSection,
  bookingSegment,
  bookPath,
  bookSegment,
  cartSegment,
  config,
  depositCents,
  formatMoney,
  getDictionary,
  holdSegment,
  isLocale,
  locales,
  orderSegment,
  pathFor,
  spotZones,
  type BeachAmenity,
  type Locale,
  type SeaSide,
  type SiteContent,
  type SiteTemplate,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import {
  api,
  dayPattern,
  formatDate,
  formatDay,
  formatInstant,
  formatPeriod,
  formatTime,
  isDay,
  localName,
  periodDays,
  slugPattern,
  uuidPattern,
  type ApiBeach,
  type ApiCancellation,
  type ApiExtraLine,
  type ApiExtraRequest,
  type ApiExtraService,
  type ApiLayoutElement,
  type ApiMapSpot,
  type ApiPayment,
  type ApiReview,
  type ApiSpot,
  type ApiZoneGaps,
} from '@/lib/api';
import { JsonLd, privateMetadata } from '@/lib/seo';
import { ElementSymbol, Legend, SeaBand, SpotSymbol, type LegendItem, type SpotArtState } from './beach-art';
import { RatingLine } from './pages';
import { PageHead, PageShell, type Crumb } from './PageShell';
import { BeachSite, localBusinessData } from './site-view';
import { spotTypesOf, typeByName, TypeCardLink, typeCardHref, TypeCardsPanel, typesPanelAnchor } from './type-card';

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function otherLocale(locale: Locale): Locale {
  return locales.find((candidate) => candidate !== locale) ?? locale;
}

/** Checks the localized segments and loads the beach club, or answers 404. Asked once per request. */
export const loadBeach = cache(
  async (
    lang: string,
    section: string,
    slug: string,
  ): Promise<{
    locale: Locale;
    beach: ApiBeach;
    nextDay: string | null;
    site: { template: SiteTemplate; content: SiteContent } | null;
    /** «Caparra adesso, saldo allo stabilimento» (D52) and the cancellation terms (D53). */
    payment: ApiPayment;
    cancellation: ApiCancellation;
  }> => {
    if (!isLocale(lang) || section !== beachSection[lang] || !slugPattern.test(slug)) notFound();
    const result = await api.beach(slug);
    if (!result.ok) {
      if (result.status === 404) notFound();
      throw new Error(`API not available (${result.code})`);
    }
    return {
      locale: lang,
      beach: result.data.beach,
      nextDay: result.data.nextAvailableDay,
      site: result.data.site,
      payment: result.data.payment,
      cancellation: result.data.cancellation,
    };
  },
);

export function crumbsFor(locale: Locale, beach: ApiBeach, last?: string): Crumb[] {
  const t = getDictionary(locale, config.brandName);
  const trail: Crumb[] = [{ label: t.nav.search, href: pathFor('search', locale) }];
  if (last) trail.push({ label: beach.name, href: beachPath(locale, beach.slug) }, { label: last });
  else trail.push({ label: beach.name });
  return trail;
}

export function DemoBadge({ locale, beach }: { locale: Locale; beach: ApiBeach }) {
  if (!beach.demo) return null;
  return (
    <p className="container">
      <span className="badge badge--demo">{getDictionary(locale, config.brandName).booking.demoBadge}</span>
    </p>
  );
}

/* ---- Icone sobrie dei servizi del catalogo (D49): SVG in linea originali, tratto
   semplice in currentColor, nessuna libreria e nessuna emoji. ---- */
const amenityIconPaths: Record<BeachAmenity, ReactNode> = {
  // Un calice da banco: la coppa, lo stelo e la base.
  bar: (
    <>
      <path d="M5.5 5h13l-6.5 7.5V18" />
      <path d="M8.5 18h7" />
      <path d="M8 8.5h8" />
    </>
  ),
  // Forchetta e coltello affiancati.
  restaurant: (
    <>
      <path d="M7 4v16" />
      <path d="M4.5 4v4a2.5 2.5 0 0 0 5 0V4" />
      <path d="M16.5 4c-1.7 1.3-2.5 3.1-2.5 5.5V12h5V9.5c0-2.4-.8-4.2-2.5-5.5Z" />
      <path d="M16.5 12v8" />
    </>
  ),
  // La «P» del cartello, nel suo riquadro.
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16.5v-9h3.25a2.75 2.75 0 0 1 0 5.5H10" />
    </>
  ),
  // Il soffione con le gocce.
  hot_showers: (
    <>
      <path d="M12 3a4 4 0 0 0-4 4v2h8V7a4 4 0 0 0-4-4Z" />
      <path d="M9 12.5V14" />
      <path d="M12 13.5V15" />
      <path d="M15 12.5V14" />
      <path d="M12 17.5V19" />
    </>
  ),
  // Un'altalena: la trave, le corde e il seggiolino.
  playground: (
    <>
      <path d="M4 5h16" />
      <path d="M9 5v8.5" />
      <path d="M15 5v8.5" />
      <path d="M7.5 13.5h9" />
      <path d="M8 20l1-6.5" />
      <path d="M16 20l-1-6.5" />
    </>
  ),
  // Il simbolo della sedia a rotelle, essenziale.
  accessible: (
    <>
      <circle cx="11" cy="5" r="1.8" />
      <path d="M11 7.5V13h5.5l2 5" />
      <path d="M11 10h4" />
      <path d="M14 19.4a4.75 4.75 0 1 1-6.4-6.3" />
    </>
  ),
  // Un'impronta di zampa: il cuscinetto e le dita.
  pets: (
    <>
      <circle cx="8.5" cy="8" r="1.4" />
      <circle cx="15.5" cy="8" r="1.4" />
      <circle cx="5.8" cy="11.8" r="1.4" />
      <circle cx="18.2" cy="11.8" r="1.4" />
      <path d="M12 11c-2.6 0-4.4 1.9-4.4 4.1A2.4 2.4 0 0 0 10 17.5c.8 0 1.3-.3 2-.3s1.2.3 2 .3a2.4 2.4 0 0 0 2.4-2.4c0-2.2-1.8-4.1-4.4-4.1Z" />
    </>
  ),
  // Gli archi del segnale con il punto.
  wifi: (
    <>
      <path d="M4 9.5a12.5 12.5 0 0 1 16 0" />
      <path d="M7 13a8 8 0 0 1 10 0" />
      <path d="M10 16.5a4 4 0 0 1 4 0" />
      <circle cx="12" cy="19" r="0.9" />
    </>
  ),
  // Il salvagente: due cerchi e i quattro raggi.
  lifeguard: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v4.5M12 15.5V20M4 12h4.5M15.5 12H20" />
    </>
  ),
  // Una cabina col tetto a falde e la porta.
  cabins: (
    <>
      <path d="M4.5 10.5 12 4l7.5 6.5V20h-15Z" />
      <path d="M10 20v-6.5h4V20" />
    </>
  ),
  // Il sole che tocca l'orizzonte, coi raggi bassi.
  sunset_bar: (
    <>
      <path d="M4 17h16" />
      <path d="M8.5 17a3.5 3.5 0 0 1 7 0" />
      <path d="M12 8v2" />
      <path d="M6.5 10.5 8 12" />
      <path d="M17.5 10.5 16 12" />
    </>
  ),
  // Una carta col suo circuito e la banda.
  card_payments: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M7 14.5h4" />
    </>
  ),
};

function AmenityIcon({ id }: { id: BeachAmenity }) {
  return (
    <svg
      className="amenity-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {amenityIconPaths[id]}
    </svg>
  );
}

/**
 * L'elenco per esteso dei servizi sulla scheda del lido (D49). Senza servizi la nota
 * «none» compare solo quando la scheda ha altri contenuti (il sito pubblicato);
 * su una pagina fatta solo di planimetria la sezione si omette.
 */
function AmenitiesSection({ locale, beach, hasSite }: { locale: Locale; beach: ApiBeach; hasSite: boolean }) {
  const a = getDictionary(locale, config.brandName).amenities;
  const listed = beachAmenities.filter((id) => beach.amenities.includes(id));
  if (listed.length === 0 && !hasSite) return null;
  return (
    <section className="section" aria-labelledby="servizi-catalogo-titolo">
      <div className="container">
        <h2 id="servizi-catalogo-titolo">{a.listTitle}</h2>
        {listed.length === 0 ? (
          <p className="prose">{a.none}</p>
        ) : (
          <ul className="amenity-list">
            {listed.map((id) => (
              <li key={id}>
                <AmenityIcon id={id} />
                {a[id]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** «Le recensioni degli Ospiti» (D51): dal più recente, con replica e nota di segnalazione. */
function ReviewsSection({ locale, reviews }: { locale: Locale; reviews: ApiReview[] }) {
  const r = getDictionary(locale, config.brandName).reviews;
  return (
    <section className="section section--tinted" aria-labelledby="recensioni-titolo">
      <div className="container">
        <h2 id="recensioni-titolo">{r.title}</h2>
        {reviews.length === 0 ? (
          <p className="prose">{r.none}</p>
        ) : (
          reviews.map((review, index) => {
            // Il periodo del soggiorno: una giornata sola in parole, il dal–al per esteso.
            const stay = review.from === review.to ? r.stayOf(formatDate(review.from, locale)) : r.stayOfPeriod(formatPeriod(review.from, review.to, locale));
            return (
              <article className="review-card" key={index}>
                <p className="review-card__head">
                  <span className="review-card__rating">{r.rating(review.rating)}</span>
                  <span className="review-card__meta">
                    {r.by(review.authorName)} · {stay}
                  </span>
                </p>
                {review.body ? <p className="prose">{review.body}</p> : null}
                <p className="review-card__verified">{r.verified}</p>
                {review.reply ? (
                  <p className="review-card__reply">
                    <strong>{r.replyLabel}:</strong> {review.reply}
                  </p>
                ) : null}
                {review.status === 'flagged' ? <p className="review-card__verified">{r.flaggedNote}</p> : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

/**
 * Il blocco «Condizioni di annullamento» (D53): il testo dello stabilimento nella lingua
 * della pagina, o il predefinito di piattaforma con le ore, più il termine calcolato dal
 * backend per il giorno d'arrivo, scritto nel fuso dello stabilimento.
 */
export function CancellationBlock({ locale, cancellation, timezone }: { locale: Locale; cancellation: ApiCancellation; timezone: string }) {
  const t = getDictionary(locale, config.brandName).cancel;
  const text = (locale === 'en' ? cancellation.policyEn : cancellation.policyIt) ?? t.defaultPolicy(cancellation.deadlineHours);
  const deadline = cancellation.deadline;
  const passed = deadline !== null && Date.parse(deadline) <= Date.now();
  return (
    <>
      <p className="prose">{text}</p>
      {deadline ? (
        <p className="prose">
          <strong>{passed ? t.deadlinePassed(formatInstant(deadline, locale, timezone)) : t.deadline(formatInstant(deadline, locale, timezone))}</strong>
        </p>
      ) : null}
    </>
  );
}

/** La frase della caparra (D52): quanto si paga ADESSO e quanto resta allo stabilimento. */
export function DepositExplain({ locale, dueNowCents, balanceCents }: { locale: Locale; dueNowCents: number; balanceCents: number }) {
  if (balanceCents <= 0) return null;
  const d = getDictionary(locale, config.brandName).deposit;
  return (
    <p className="prose">
      <strong>{d.explain(formatMoney(dueNowCents, locale), formatMoney(balanceCents, locale))}</strong>
    </p>
  );
}

export async function beachMetadata(lang: string, section: string, slug: string, query: Query = {}): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const languages: Record<string, string> = { 'x-default': config.siteUrl + beachPath('it', beach.slug) };
  for (const other of locales) languages[other] = config.siteUrl + beachPath(other, beach.slug);
  // A chosen day or spot is one view of the same page: only the plain address is indexed.
  const filtered = Object.keys(query).length > 0;
  return {
    title: t.beachTitle(beach.name, beach.locality),
    description: t.beachDescription(beach.name, beach.locality),
    // Without a configured public address the absolute URLs would be wrong: leave them out.
    ...(config.siteUrlConfigured ? { alternates: { canonical: config.siteUrl + beachPath(locale, beach.slug), languages } } : {}),
    // Sample data must never reach a search engine.
    ...(beach.demo ? { robots: { index: false, follow: false } } : filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Title of the pages after the beach page: summary, hold, booking, cart, order. Never indexed. */
export async function stepMetadata(lang: string, section: string, slug: string, step: string): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName);
  const page =
    step === bookSegment[locale]
      ? t.booking.summaryTitle
      : step === bookingSegment[locale]
        ? t.account.booking
        : step === cartSegment[locale]
          ? t.cart.metaTitle
          : step === orderSegment[locale]
            ? t.order.metaTitle
            : t.booking.holdTitle;
  return privateMetadata(locale, page, { club: beach.name, follow: true });
}

/** Where the day picker and the map start: the target of the button under the lead. */
const pickerAnchor = 'disponibilita';

function SpotCard({
  locale,
  beach,
  spot,
  day,
  to,
  selected,
  suggested,
  cardHref,
}: {
  locale: Locale;
  beach: ApiBeach;
  spot: ApiSpot;
  day: string;
  to?: string;
  selected: boolean;
  suggested: boolean;
  /** Address of the card of this spot's type (D63), with its exact return point. */
  cardHref?: string;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const z = getDictionary(locale, config.brandName).zone;
  const href = `${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}${to ? `&to=${to}` : ''}`;
  return (
    <li className={selected ? 'spot plan-chosen' : 'spot'} aria-current={selected ? 'true' : undefined}>
      <span className="spot__code">{spot.code}</span>
      <p>{spot.typeName}</p>
      {/* «Vedi la scheda» col nome del tipo per gli screen reader (D63, testi vagliati). */}
      {cardHref ? (
        <p>
          <TypeCardLink locale={locale} href={cardHref} typeName={spot.typeName} />
        </p>
      ) : null}
      {/* La zona con nome del Gestore (D50), identica nelle due lingue. */}
      {spot.zoneName ? <p>{z.badge(spot.zoneName)}</p> : null}
      <p>{t.equipment(spot.umbrellas, spot.sunbeds)}</p>
      <p>{t.guests(spot.maxGuests)}</p>
      {spot.shared || selected || suggested ? (
        <p className="plan-tags">
          {spot.shared ? <span className="badge">{t.sharedDay}</span> : null}
          {suggested ? <span className="badge badge--suggested">{t.suggestedBadge}</span> : null}
          {selected ? <span className="badge">{t.status.selected}</span> : null}
        </p>
      ) : null}
      <span className="spot__price">{formatMoney(spot.priceCents, locale)}</span>
      <Link className="button button--secondary" href={href}>
        {t.choose(spot.code)}
      </Link>
    </li>
  );
}

/** The public states of the map, said in the beach-art language (D55/D56): the whole
 * canvas takes the colour and the corner badge carries the glyph, never colour alone. */
function publicArtState(status: ApiMapSpot['status'], selected: boolean, suggested: boolean): SpotArtState {
  if (status === 'unavailable') return 'unavailable';
  if (selected) return 'selected';
  if (suggested) return 'suggested';
  return status === 'shared' ? 'shared' : 'available';
}

/**
 * The mark of a spot, from the fixed repertoire, drawn by the shared beach-art symbol
 * (D55). Without a mark, the equipment decides. The equipment shows in the drawing
 * (sunbeds beside the umbrella); the chosen spot also gets the selection ring.
 */
export function SpotMark({
  mark,
  umbrellas = 1,
  sunbeds = 0,
  status,
  selected = false,
  suggested = false,
  size = 44,
}: {
  mark?: SpotMarkKind;
  umbrellas?: number;
  sunbeds?: number;
  status: ApiMapSpot['status'];
  selected?: boolean;
  suggested?: boolean;
  size?: number;
}) {
  return (
    <SpotSymbol
      sign={mark ?? (umbrellas === 0 && sunbeds > 0 ? 'sunbed' : 'umbrella')}
      state={publicArtState(status, selected, suggested)}
      umbrellas={umbrellas}
      sunbeds={sunbeds}
      size={size}
      selected={selected}
    />
  );
}

function MapSpot({
  locale,
  beach,
  spot,
  day,
  to,
  selected,
  suggested,
  guests,
}: {
  locale: Locale;
  beach: ApiBeach;
  spot: ApiMapSpot;
  day: string;
  to?: string;
  selected: boolean;
  suggested: boolean;
  guests?: number;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const z = getDictionary(locale, config.brandName).zone;
  const content = (
    <>
      <SpotMark mark={spot.typeMark} umbrellas={spot.umbrellas} sunbeds={spot.sunbeds} status={spot.status} selected={selected} suggested={suggested} />
      <span className="plan-spot__code" aria-hidden="true">
        {spot.code}
      </span>
      <span className="visually-hidden">
        {t.mapSpot(spot.typeName, spot.code, t.status[spot.status], spot.priceCents === null ? undefined : formatMoney(spot.priceCents, locale))}
        {/* La zona con nome (D50), nell'etichetta letta come il resto dei dati della postazione. */}
        {spot.zoneName ? `. ${z.badge(spot.zoneName)}` : ''}
        {`. ${t.equipment(spot.umbrellas, spot.sunbeds)}`}
        {suggested ? `. ${t.suggestedBadge}` : ''}
        {selected ? `. ${t.status.selected}` : ''}
      </span>
    </>
  );
  if (spot.status === 'unavailable') {
    return (
      <li>
        <span className="plan-spot plan-spot--taken">{content}</span>
      </li>
    );
  }
  // The choice is a new address of this same page: it works without scripts and can be shared.
  // It points at the spot itself, so that the map comes back scrolled, also sideways, to the chosen spot.
  return (
    <li id={`postazione-${spot.code}`}>
      <Link
        className={`plan-spot plan-spot--${spot.status}${selected ? ' plan-spot--selected' : ''}${suggested ? ' plan-spot--suggested' : ''}`}
        href={`${beachPath(locale, beach.slug)}?day=${day}${to ? `&to=${to}` : ''}${guests ? `&guests=${guests}` : ''}&spot=${spot.spotId}#postazione-${spot.code}`}
        prefetch={false}
        aria-current={selected ? 'true' : undefined}
      >
        {content}
      </Link>
    </li>
  );
}

/** What the shared drawing needs to place a spot: the rest is up to who renders it. */
export interface PlanPlace {
  code: string;
  zone: SpotZone;
  rowNumber: number;
  /** Column inside the row: the only source of the drawing. Holes are drawn as sand. */
  col: number;
}

export interface PlanZoneRows<T extends PlanPlace> {
  zone: SpotZone;
  rows: { row: number; spots: T[] }[];
}

/** Spots grouped by zone and row, in drawing order: shore, umbrellas, land side; row 1 first. */
export function zoneRows<T extends PlanPlace>(spots: T[]): PlanZoneRows<T>[] {
  return spotZones
    .map((zone) => {
      const inZone = spots.filter((spot) => spot.zone === zone);
      const rows = [...new Set(inZone.map((spot) => spot.rowNumber))].sort((a, b) => a - b);
      return { zone, rows: rows.map((row) => ({ row, spots: inZone.filter((spot) => spot.rowNumber === row) })) };
    })
    .filter((zone) => zone.rows.length > 0);
}

/** Cells and lanes in rem: a spot cell, the gap between cells, a vertical walkway lane. */
export const planCellRem = 4.25;
export const planGapRem = 0.5;
export const planLaneRem = 1.25;

/** Width the drawing reserves: the widest column in play and the vertical lanes next to it. */
export function planSize(spots: PlanPlace[], elements: ApiLayoutElement[]): { cols: number; lanes: number } {
  const cols = Math.max(
    1,
    ...spots.map((spot) => spot.col),
    // A decoration sits on its single cell; a vertical walkway runs after its column.
    ...elements.map((element) => element.colEnd ?? (element.colStart === null ? 1 : element.kind === 'decoration' ? element.colStart : element.colStart + 1)),
  );
  return { cols, lanes: elements.filter((element) => element.kind === 'walkway' && element.orientation === 'vertical').length };
}

/** Vertical walkways, in column order: they add their own lane after a column. */
function verticalLanes(elements: ApiLayoutElement[]): ApiLayoutElement[] {
  return elements.filter((element) => element.kind === 'walkway' && element.orientation === 'vertical').sort((a, b) => (a.colStart ?? 0) - (b.colStart ?? 0));
}

/** Distance in rem from the first cell to the start of a column, vertical lanes included. */
function colOffsetRem(col: number, lanes: ApiLayoutElement[], cellRem = planCellRem): number {
  const before = lanes.filter((lane) => (lane.colStart ?? 0) < col).length;
  return (col - 1) * (cellRem + planGapRem) + before * (planLaneRem + planGapRem);
}

/** Width in rem of a span of columns, with the vertical lanes that run inside it. */
function spanWidthRem(from: number, to: number, lanes: ApiLayoutElement[], cellRem = planCellRem): number {
  const inside = lanes.filter((lane) => (lane.colStart ?? 0) >= from && (lane.colStart ?? 0) < to).length;
  return (to - from + 1) * cellRem + (to - from) * planGapRem + inside * (planLaneRem + planGapRem);
}

/** The narrow lane of a vertical walkway, announced in the reading of every row it crosses. */
function VerticalLane({ locale, lane, zone }: { locale: Locale; lane: ApiLayoutElement; zone: SpotZone }) {
  const t = getDictionary(locale, config.brandName).booking;
  // A lane outside its zone still takes its width, so the columns stay aligned across the zones.
  if (lane.zone !== null && lane.zone !== zone) return <li className="plan-vlane plan-vlane--spacer" aria-hidden="true" />;
  return (
    <li className="plan-vlane">
      <span className="plan-vlane__label">{t.walkway}{lane.label ? ` · ${lane.label}` : ''}</span>
    </li>
  );
}

/**
 * A decoration on its cell (D35): the sign hidden from the reading, the subject name
 * as text, the optional label visible. No state, nothing to press: it can never be
 * mistaken for a spot.
 */
export function PlanDecoration({ locale, element }: { locale: Locale; element: ApiLayoutElement }) {
  const t = getDictionary(locale, config.brandName).booking;
  const name = element.sign ? t.decorations[element.sign] : t.decorationKind;
  return (
    <li className="plan-deco">
      {element.sign ? <ElementSymbol kind={element.sign} /> : null}
      <span className="visually-hidden">
        {t.decorationKind}: {name}
        {element.label ? `, ${element.label}` : ''}
      </span>
      {element.label ? (
        <span className="plan-deco__label" aria-hidden="true">
          {element.label}
        </span>
      ) : null}
    </li>
  );
}

/** A structure or a cabin block: a labelled box over a rectangle of free cells. */
function PlanBox({ locale, element, lanes, cellRem }: { locale: Locale; element: ApiLayoutElement; lanes: ApiLayoutElement[]; cellRem?: number }) {
  const t = getDictionary(locale, config.brandName).booking;
  const cabins = element.kind === 'cabin_block';
  const from = element.colStart ?? 1;
  const to = element.colEnd ?? from;
  const width = spanWidthRem(from, to, lanes, cellRem);
  return (
    <li className={cabins ? 'plan-box plan-box--cabins' : 'plan-box'} style={{ width: `${width}rem` }}>
      {/* Il disegno di scena (D55): il nome viaggia come testo, il simbolo è decorativo. */}
      <ElementSymbol kind={cabins ? 'cabin_block' : 'structure'} w={to - from + 1} />
      <span className="visually-hidden">{cabins ? t.cabinBlockKind : t.structureKind}: </span>
      <span className="plan-box__label">{element.label ?? (cabins ? t.cabinsBox : t.structureKind)}</span>
    </li>
  );
}

/** One drawing row: spots on their columns, boxes over their rectangles, sand in the holes, lanes in between. */
function PlanRowCells<T extends PlanPlace>({
  locale,
  zone,
  spots,
  rects,
  lanes,
  cellRem,
  renderSpot,
}: {
  locale: Locale;
  zone: SpotZone;
  spots: T[];
  rects: ApiLayoutElement[];
  lanes: ApiLayoutElement[];
  cellRem?: number;
  renderSpot: (spot: T) => ReactNode;
}) {
  const bySpotCol = new Map(spots.map((spot) => [spot.col, spot]));
  const byRectStart = new Map(rects.map((rect) => [rect.colStart ?? 1, rect]));
  const rowMax = Math.max(1, ...spots.map((spot) => spot.col), ...rects.map((rect) => rect.colEnd ?? rect.colStart ?? 1));
  const cells: ReactNode[] = [];
  let col = 1;
  while (col <= rowMax) {
    const rect = byRectStart.get(col);
    const spot = bySpotCol.get(col);
    const last = rect ? (rect.colEnd ?? col) : col;
    if (rect && rect.kind === 'decoration') cells.push(<PlanDecoration key={`deco-${col}`} locale={locale} element={rect} />);
    else if (rect) cells.push(<PlanBox key={`box-${col}`} locale={locale} element={rect} lanes={lanes} cellRem={cellRem} />);
    else if (spot) cells.push(<Fragment key={`spot-${col}`}>{renderSpot(spot)}</Fragment>);
    else cells.push(<li key={`hole-${col}`} className="plan-hole" aria-hidden="true" />);
    // A lane right after this cell; lanes crossed by a box are already inside its width.
    for (const lane of lanes.filter((candidate) => (candidate.colStart ?? 0) === last)) {
      cells.push(<VerticalLane key={`lane-${last}-${lane.elementId}`} locale={locale} lane={lane} zone={zone} />);
    }
    col = last + 1;
  }
  return <>{cells}</>;
}

/** The lane of a horizontal walkway: its own drawing row, placed along its columns. */
function HorizontalLane({ locale, element, lanes, cellRem }: { locale: Locale; element: ApiLayoutElement; lanes: ApiLayoutElement[]; cellRem?: number }) {
  const t = getDictionary(locale, config.brandName).booking;
  const from = element.colStart ?? 1;
  const to = element.colEnd ?? from;
  return (
    <div className="plan-row plan-row--lane">
      <p className="plan-row__label" aria-hidden="true" />
      <div className="plan-lane" style={{ marginInlineStart: `${colOffsetRem(from, lanes, cellRem)}rem`, width: `${spanWidthRem(from, to, lanes, cellRem)}rem` }}>
        <span className="plan-lane__label">
          {t.walkway}
          {element.label ? ` · ${element.label}` : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * The drawing shared by the public map and the manager's preview: the sea band, then the
 * shore, umbrella and land zones with their text labels, separated by corridors proportional
 * to the configured empty rows, with the walkways, structures and cabin blocks the manager
 * drew. With the sea at the bottom only the visual order flips: the document order and the
 * equivalent list never change. Row 1 of every zone is the closest to the sea.
 */
export function PlanCanvas<T extends PlanPlace>({
  locale,
  gaps,
  seaSide = 'top',
  elements = [],
  spots,
  idPrefix,
  cellRem,
  renderSpot,
}: {
  locale: Locale;
  gaps: ApiZoneGaps;
  seaSide?: SeaSide;
  elements?: ApiLayoutElement[];
  spots: T[];
  idPrefix: string;
  /** Width in rem of one spot cell, when the renderer draws wider cards than the public map. */
  cellRem?: number;
  renderSpot: (spot: T) => ReactNode;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const lanes = verticalLanes(elements);
  const flip = seaSide === 'bottom' ? ' plan__rows--flip' : '';
  // La fascia del mare (D55) copre la fila più lunga; il numero di celle regola l'altezza
  // resa: più celle, onde più fitte e fascia più bassa, qui circa tre rem e mezzo.
  const drawn = planSize(spots, elements);
  const cell = cellRem ?? planCellRem;
  const widthRem = drawn.cols * (cell + planGapRem) + drawn.lanes * (planLaneRem + planGapRem);
  const seaCells = Math.max(4, Math.round(widthRem * 0.4));
  // Zones in drawing order: the ones with spots and the ones that only hold drawn elements.
  const zones = spotZones.filter((zone) => spots.some((spot) => spot.zone === zone) || elements.some((element) => element.zone === zone && element.orientation !== 'vertical'));
  const hasUmbrellas = zones.includes('ombrelloni');
  return (
    <div className="plan__map">
      <p className="plan__hint" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
        </svg>
        {t.planScrollHint}
      </p>
      {/* Every row stays on one line: the map scrolls sideways inside this region, the page never does. */}
      <div className="plan__scroll" role="region" aria-label={t.planRegion} tabIndex={0}>
        <div className={`plan__rows beach-art--sand${flip}`}>
          <p className="plan__sea">
            <span className="plan__sea-label">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
              </svg>
              {t.planSea}
              <span className="visually-hidden">, {t.planSeaNote}</span>
            </span>
            {/* La fascia illustrata del mare (D55): onde, acqua bassa e riva; capovolta col mare in basso. */}
            <SeaBand width={seaCells} />
          </p>
          {zones.map((zone, index) => {
            const inZone = spots.filter((spot) => spot.zone === zone);
            const rects = elements.filter((element) => element.zone === zone && (element.kind === 'structure' || element.kind === 'cabin_block' || element.kind === 'decoration'));
            const walkways = elements
              .filter((element) => element.zone === zone && element.kind === 'walkway' && element.orientation === 'horizontal')
              .sort((a, b) => (a.rowAfter ?? 0) - (b.rowAfter ?? 0));
            const rows = [...new Set([...inZone.map((spot) => spot.rowNumber), ...rects.map((rect) => rect.rowNumber ?? 1)])].sort((a, b) => a - b);
            const lastRow = rows[rows.length - 1] ?? 0;
            // Corridor above this zone, only between two drawn zones with umbrellas in play.
            const gap = index === 0 || !hasUmbrellas ? 0 : zone === 'ombrelloni' ? gaps.shoreGapRows : zone === 'monte' ? gaps.landGapRows : 0;
            const note = !hasUmbrellas || zone === 'ombrelloni' ? 0 : zone === 'riva' ? gaps.shoreGapRows : gaps.landGapRows;
            return (
              <Fragment key={zone}>
                {gap > 0 ? <div className="plan-gap" style={{ '--plan-gap-rows': gap } as CSSProperties} aria-hidden="true" /> : null}
                <section className="plan-zone" aria-labelledby={`${idPrefix}-zona-${zone}`}>
                  <p className="plan-zone__label" id={`${idPrefix}-zona-${zone}`}>
                    <strong>{t.zones[zone]}</strong>
                    {note > 0 ? <span className="plan-zone__gap">, {t.zoneGap(note)}</span> : null}
                  </p>
                  <div className={`plan-zone__rows${flip ? ' plan-zone__rows--flip' : ''}`}>
                    {walkways
                      .filter((lane) => (lane.rowAfter ?? 0) === 0)
                      .map((lane) => (
                        <HorizontalLane key={lane.elementId} locale={locale} element={lane} lanes={lanes} cellRem={cellRem} />
                      ))}
                    {rows.map((row) => (
                      <Fragment key={row}>
                        <div className="plan-row">
                          <p className="plan-row__label" id={`${idPrefix}-${zone}-fila-${row}`}>
                            {t.row(row)}
                          </p>
                          <ol className="plan-row__spots" aria-labelledby={`${idPrefix}-${zone}-fila-${row}`}>
                            <PlanRowCells
                              locale={locale}
                              zone={zone}
                              spots={inZone.filter((spot) => spot.rowNumber === row)}
                              rects={rects.filter((rect) => rect.rowNumber === row)}
                              lanes={lanes}
                              cellRem={cellRem}
                              renderSpot={renderSpot}
                            />
                          </ol>
                        </div>
                        {walkways
                          .filter((lane) => (lane.rowAfter ?? 0) === row || (row === lastRow && (lane.rowAfter ?? 0) > lastRow))
                          .map((lane) => (
                            <HorizontalLane key={lane.elementId} locale={locale} element={lane} lanes={lanes} cellRem={cellRem} />
                          ))}
                      </Fragment>
                    ))}
                  </div>
                </section>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Legend names of the marks that are not the umbrella. Only the marks in play are listed. */
export function MarkLegendItems({ locale, marks }: { locale: Locale; marks: SpotMarkKind[] }) {
  const t = getDictionary(locale, config.brandName).booking;
  const names: Record<Exclude<SpotMarkKind, 'umbrella'>, string> = {
    sunbed: t.sunbedMark,
    gazebo: t.gazeboMark,
    tent: t.tentMark,
    daybed: t.daybedMark,
    deckchair: t.deckchairMark,
    canopy: t.canopyMark,
    canoe: t.canoeMark,
    sup: t.supMark,
    pedalo: t.pedaloMark,
    jetski: t.jetskiMark,
  };
  const present = ([...new Set(marks)] as SpotMarkKind[]).filter((mark): mark is Exclude<SpotMarkKind, 'umbrella'> => mark !== 'umbrella');
  return (
    <>
      {present.map((mark) => (
        <li key={mark}>
          <SpotMark mark={mark} status="free" />
          {names[mark]}
        </li>
      ))}
    </>
  );
}

/**
 * The single legend of the beach drawing (D56): the shared beach-art rows, shown open
 * from tablet up and behind a `<details>`/`<summary>` button on the phone, CSS only,
 * no JavaScript. Both copies live in the page; the style sheet shows one at a time.
 */
export function LegendDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="plan-legend-wide" role="group" aria-label={title}>
        {children}
      </div>
      <details className="plan-legend-narrow">
        <summary>{title}</summary>
        {children}
      </details>
    </>
  );
}

/** The public legend (D56): the public states with colour + glyph, then the marks in play. */
function PublicLegend({ locale, marks, suggested }: { locale: Locale; marks: SpotMarkKind[]; suggested: boolean }) {
  const t = getDictionary(locale, config.brandName).booking;
  const items: LegendItem[] = [
    { state: 'available', label: t.status.free },
    { state: 'shared', label: t.status.shared },
    { state: 'unavailable', label: t.status.unavailable },
    { state: 'selected', label: t.status.selected },
    ...(suggested ? [{ state: 'suggested', label: t.suggestedLegend } as const] : []),
  ];
  const extra = [...new Set(marks)].filter((mark) => mark !== 'umbrella');
  return (
    <LegendDisclosure title={t.legendTitle}>
      <Legend items={items} />
      {extra.length > 0 ? (
        <ul className="plan-legend plan-legend--marks">
          <MarkLegendItems locale={locale} marks={marks} />
        </ul>
      ) : null}
    </LegendDisclosure>
  );
}

function BeachMap({
  locale,
  beach,
  layout,
  gaps,
  seaSide,
  elements,
  day,
  to,
  selected,
  suggested,
  guests,
}: {
  locale: Locale;
  beach: ApiBeach;
  layout: ApiMapSpot[];
  gaps: ApiZoneGaps;
  seaSide: SeaSide;
  elements: ApiLayoutElement[];
  day: string;
  to?: string;
  selected: ApiMapSpot | undefined;
  suggested: ApiMapSpot | undefined;
  guests?: number;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const free = layout.filter((spot) => spot.status !== 'unavailable').length;
  const size = planSize(layout, elements);
  // The longest row sets the width the map needs: the hint about scrolling shows only when it does not fit.
  return (
    <div
      className="plan"
      id="planimetria"
      role="group"
      aria-labelledby="planimetria-titolo"
      style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes } as CSSProperties}
    >
      <div className="plan__head">
        <h3 id="planimetria-titolo">{t.planTitle}</h3>
        <p>{t.planLead}</p>
        <p className="plan__count">
          <strong>{t.freeCount(free, layout.length)}</strong>
          {free > 0 ? <a href="#elenco">{t.toList}</a> : null}
        </p>
      </div>
      {selected ? (
        <p className="plan__notice">
          <strong>{t.selectedNotice(selected.code)}</strong> <a href="#scelta">{t.toBar}</a>
        </p>
      ) : null}
      <PublicLegend locale={locale} marks={layout.map((spot) => spot.typeMark)} suggested={Boolean(suggested)} />
      <PlanCanvas
        locale={locale}
        gaps={gaps}
        seaSide={seaSide}
        elements={elements}
        spots={layout}
        idPrefix="planimetria"
        renderSpot={(spot) => (
          <MapSpot
            locale={locale}
            beach={beach}
            spot={spot}
            day={day}
            to={to}
            selected={spot.spotId === selected?.spotId}
            suggested={spot.spotId === suggested?.spotId}
            guests={guests}
          />
        )}
      />
    </div>
  );
}

/** Bottom bar with the chosen spot and the one step forward. It stays in the flow of the page, so it never hides its end. */
function SelectionBar({
  locale,
  beach,
  spot,
  day,
  to,
  cardHref,
}: {
  locale: Locale;
  beach: ApiBeach;
  spot: ApiMapSpot & { priceCents: number };
  day: string;
  to?: string;
  /** Address of the card of the chosen type (D63): the type name becomes the link. */
  cardHref?: string;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const c = getDictionary(locale, config.brandName).cart;
  const z = getDictionary(locale, config.brandName).zone;
  return (
    <aside className="plan-bar" id="scelta" aria-label={t.barLabel}>
      <div className="container plan-bar__inner">
        <p className="plan-bar__title">
          {/* La zona con nome (D50) accanto al codice, con le stesse parole di ovunque. */}
          {t.spot(spot.code)}
          {spot.zoneName ? `, ${z.label.toLowerCase()} ${spot.zoneName}` : ''}, {t.zones[spot.zone].toLowerCase()}, {t.row(spot.rowNumber).toLowerCase()}
        </p>
        <p className="plan-bar__price">{formatMoney(spot.priceCents, locale)}</p>
        <p className="plan-bar__detail">
          {/* Il nome del tipo è il collegamento alla sua scheda (D63). */}
          {cardHref ? (
            <>
              <Link href={cardHref} prefetch={false}>
                {spot.typeName}
              </Link>
              {'. '}
            </>
          ) : (
            `${spot.typeName}. `
          )}
          {/* Con un periodo il prezzo della barra è il totale dal–al (D39). */}
          {to ? `${t.periodValue(formatPeriod(day, to, locale), periodDays(day, to))}. ` : ''}
          {t.equipment(spot.umbrellas, spot.sunbeds)}. {t.guests(spot.maxGuests)}.{spot.status === 'shared' ? ` ${t.sharedDay}.` : ''}
        </p>
        <Link className="button plan-bar__go" href={`${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}${to ? `&to=${to}` : ''}`}>
          {t.barContinue}
        </Link>
        {/* «Aggiungi al carrello» (D46), next to the quick path, which stays as it is. */}
        <form method="post" action="/azioni/carrello-aggiungi" className="inline-form">
          <input type="hidden" name="lang" value={locale} />
          <input type="hidden" name="beach" value={beach.slug} />
          <input type="hidden" name="spot" value={spot.spotId} />
          <input type="hidden" name="day" value={day} />
          {to ? <input type="hidden" name="to" value={to} /> : null}
          <button className="button button--secondary" type="submit">
            {c.addButton} <span className="visually-hidden">{spot.code}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

export async function BeachView({ lang, section, slug, query }: { lang: string; section: string; slug: string; query: Query }) {
  const { locale, beach, nextDay, site } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const z = getDictionary(locale, config.brandName).zone;
  const texts = site ? site.content[locale] : null;
  // Le recensioni pubbliche (D51): se l'elenco non si legge, la sezione non inventa nulla.
  const reviewsResult = await api.reviews(beach.slug);
  const reviews = reviewsResult.ok ? reviewsResult.data.reviews : null;
  // I tipi offerti con la loro scheda (D61, D63): riquadro e collegamenti «Vedi la scheda».
  const types = await spotTypesOf(beach.slug);
  const asked = first(query.day);
  const day = isDay(asked) ? asked : nextDay;
  // «Al» facoltativo (D39): vuoto o uguale a «dal», la pagina resta di una giornata.
  // Un periodo al rovescio o oltre le 31 giornate arriva all'API, che risponde 409: in parole sotto.
  const toAsked = first(query.to);
  const to = day && isDay(toAsked) && toAsked !== day ? toAsked : undefined;
  // Guests are optional: with them the answer carries the recommended spot (spec §3.3).
  const guestsAsked = first(query.guests);
  const guests = guestsAsked && /^\d{1,2}$/.test(guestsAsked) && Number(guestsAsked) >= 1 && Number(guestsAsked) <= 20 ? Number(guestsAsked) : undefined;
  const availability = day ? await api.availability(beach.slug, day, guests, to) : null;
  const periodError =
    availability !== null && !availability.ok && availability.status === 409
      ? availability.code === 'cap_reached'
        ? t.periodTooLong
        : t.periodBackwards
      : null;
  const spots = availability?.ok ? availability.data.spots : [];
  const layout = availability?.ok ? availability.data.layout : [];
  const gaps = availability?.ok ? availability.data.gaps : { shoreGapRows: 1, landGapRows: 1 };
  const seaSide: SeaSide = availability?.ok ? availability.data.seaSide : 'top';
  const elements = availability?.ok ? availability.data.elements : [];
  const spotZonesRows = zoneRows(spots);
  const manyZones = spotZonesRows.length > 1;
  const taken = layout.filter((spot) => spot.status === 'unavailable').map((spot) => spot.code);

  const askedSpot = first(query.spot);
  const picked = askedSpot && uuidPattern.test(askedSpot) ? layout.find((spot) => spot.spotId === askedSpot) : undefined;
  const selected = picked && picked.priceCents !== null ? { ...picked, priceCents: picked.priceCents } : undefined;
  const suggestedId = availability?.ok ? (availability.data.suggestedSpotId ?? null) : null;
  const suggested = suggestedId ? layout.find((spot) => spot.spotId === suggestedId) : undefined;
  const alternateQuery = isDay(asked) ? `?day=${asked}${to ? `&to=${to}` : ''}${guests ? `&guests=${guests}` : ''}${selected ? `&spot=${selected.spotId}` : ''}` : '';

  // Il «torna» degli ingressi (D63): questa stessa pagina con la query e l'àncora giuste.
  const selfQuery = day ? `?day=${day}${to ? `&to=${to}` : ''}${guests ? `&guests=${guests}` : ''}${selected ? `&spot=${selected.spotId}` : ''}` : '';
  const self = beachPath(locale, beach.slug) + selfQuery;
  const cardHrefFor = (typeName: string, anchor: string): string | undefined => {
    const type = typeByName(types, typeName);
    return type ? typeCardHref(locale, beach.slug, type.typeId, `${self}#${anchor}`) : undefined;
  };

  return (
    <PageShell locale={locale} page="search" alternatePath={beachPath(otherLocale(locale), beach.slug) + alternateQuery} crumbs={crumbsFor(locale, beach)}>
      <PageHead title={beach.name} lead={t.beachLead(beach.locality)}>
        {/* In testa il voto medio e il numero delle recensioni, quando esistono (D51). */}
        <RatingLine locale={locale} rating={beach.rating} />
        {site && texts ? (
          <p className="actions">
            <a className="button" href={`#${pickerAnchor}`}>
              {t.chooseCta}
            </a>
          </p>
        ) : null}
      </PageHead>
      <DemoBadge locale={locale} beach={beach} />
      {site && texts ? (
        <section className="section">
          <div className="container">
            <BeachSite locale={locale} template={site.template} texts={texts} />
            {beach.demo ? null : <JsonLd data={localBusinessData(beach, texts, config.siteUrl + beachPath(locale, beach.slug))} />}
          </div>
        </section>
      ) : null}
      {/* I servizi del catalogo per esteso, con le icone sobrie (D49). */}
      <AmenitiesSection locale={locale} beach={beach} hasSite={Boolean(site && texts)} />
      {/* Il riquadro «I tipi di postazione» (D63): i tipi offerti, miniatura e collegamento. */}
      <TypeCardsPanel locale={locale} beachSlug={beach.slug} types={types} torna={`${self}#${typesPanelAnchor}`} />
      <section className="section" id={pickerAnchor}>
        <div className="container">
          {first(query.taken) ? <p className="alert" role="alert">{to ? t.takenPeriodNotice : t.takenNotice}</p> : null}
          {picked && !selected ? <p className="alert" role="alert">{t.selectionGone}</p> : null}
          {!day ? (
            <div className="empty">
              <h2>{t.noDayTitle}</h2>
              <p>{t.noDayText}</p>
            </div>
          ) : (
            <div className="stack">
              <form className="form-row" method="get" action={beachPath(locale, beach.slug)}>
                <div className="field">
                  <label htmlFor="giorno">{t.dayFromLabel}</label>
                  <input id="giorno" type="date" name="day" defaultValue={day} required />
                </div>
                {/* «Al» facoltativo (D39): vuoto, la pagina resta di una sola giornata. */}
                <div className="field">
                  <label htmlFor="giorno-al">{t.dayToLabel}</label>
                  <input id="giorno-al" type="date" name="to" defaultValue={to ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="ospiti">{t.guestsOptional}</label>
                  <input
                    id="ospiti"
                    type="number"
                    name="guests"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    defaultValue={guests}
                    aria-describedby="ospiti-aiuto"
                  />
                  <p className="field__hint" id="ospiti-aiuto">
                    {t.guestsHint}
                  </p>
                </div>
                <button className="button button--secondary" type="submit">
                  {t.showDay}
                </button>
              </form>
              <h2>{to && availability?.ok ? t.freePeriodTitle(formatPeriod(day, to, locale)) : t.freeTitle(formatDay(day, locale))}</h2>
              {to && availability?.ok ? <p className="prose">{t.periodLead(periodDays(day, to))}</p> : null}
              {guests && suggested ? (
                <p className="plan__notice">
                  <strong>{t.suggestedNotice(suggested.code, guests)}</strong>
                  {/* La proposta con la sua zona con nome (§6, D50). */}
                  {suggested.zoneName ? ` ${z.proposedSpot(suggested.zoneName)}.` : ''}
                </p>
              ) : null}
              {periodError ? (
                <p className="alert" role="alert">
                  {periodError}
                </p>
              ) : !availability?.ok ? (
                <div className="empty">
                  <h3>{t.unavailableTitle}</h3>
                  <p>{t.unavailableText}</p>
                </div>
              ) : (
                <>
                  {layout.length > 0 ? (
                    <BeachMap
                      locale={locale}
                      beach={beach}
                      layout={layout}
                      gaps={gaps}
                      seaSide={seaSide}
                      elements={elements}
                      day={day}
                      to={to}
                      selected={selected}
                      suggested={suggested}
                      guests={guests}
                    />
                  ) : null}
                  {spots.length === 0 ? (
                    <div className="empty">
                      <h3>{t.noSpotsTitle}</h3>
                      <p>{t.noSpotsText}</p>
                    </div>
                  ) : (
                    <div className="plan-list" id="elenco">
                      <h2>{t.listTitle}</h2>
                      <div className="spot-rows">
                        {spotZonesRows.flatMap(({ zone, rows: zoneRowList }) =>
                          zoneRowList.map(({ row, spots: inRow }) => (
                            <div className="spot-row" key={`${zone}-${row}`}>
                              <h3>{manyZones ? `${t.zones[zone]} · ${t.row(row)}` : t.row(row)}</h3>
                              <ul className="spots">
                                {inRow.map((spot) => (
                                  <SpotCard
                                    key={spot.spotId}
                                    locale={locale}
                                    beach={beach}
                                    spot={spot}
                                    day={day}
                                    to={to}
                                    selected={spot.spotId === selected?.spotId}
                                    suggested={spot.spotId === suggestedId}
                                    cardHref={cardHrefFor(spot.typeName, 'elenco')}
                                  />
                                ))}
                              </ul>
                            </div>
                          )),
                        )}
                      </div>
                      {taken.length > 0 ? <p className="plan-list__taken">{t.unavailableList(taken.join(', '))}</p> : null}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>
      {/* «Le recensioni degli Ospiti» (D51): dal più recente, con replica e nota di segnalazione. */}
      {reviews !== null ? <ReviewsSection locale={locale} reviews={reviews} /> : null}
      {selected && day ? <SelectionBar locale={locale} beach={beach} spot={selected} day={day} to={to} cardHref={cardHrefFor(selected.typeName, 'scelta')} /> : null}
    </PageShell>
  );
}

export function PriceSummary({
  locale,
  rows,
  quote,
  days,
  deposit,
}: {
  locale: Locale;
  /** Label and value; the value may carry a link, like the spot type row (D63). */
  rows: [string, ReactNode][];
  quote: { listPriceCents: number; discountCents: number; extrasCents: number; totalCents: number; promoCode: string | null; extras: ApiExtraLine[] };
  /** The days of a dal–al period (D39), one priced line each. Listed only beyond one day. */
  days?: { day: string; totalCents: number }[];
  /** Con la caparra (D52): «Caparra adesso» e «Saldo allo stabilimento», prima del totale. */
  deposit?: { dueNowCents: number; balanceCents: number };
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const d = getDictionary(locale, config.brandName).deposit;
  return (
    <dl className="summary">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {/* Le giornate del periodo, una riga col suo prezzo (sconto per giornata già applicato). */}
      {days && days.length > 1
        ? days.map((entry) => (
            <div key={entry.day}>
              <dt>{formatDay(entry.day, locale)}</dt>
              <dd>{formatMoney(entry.totalCents, locale)}</dd>
            </div>
          ))
        : null}
      <div>
        <dt>{t.listPrice}</dt>
        <dd>{formatMoney(quote.listPriceCents, locale)}</dd>
      </div>
      {quote.promoCode ? (
        <div>
          <dt>{t.discount(quote.promoCode)}</dt>
          <dd>{formatMoney(-quote.discountCents, locale)}</dd>
        </div>
      ) : null}
      {/* The chosen extras, one line each with its frozen subtotal, then their sum (spec §4.2). */}
      {quote.extras.map((line) => (
        <div key={line.serviceId}>
          <dt>{t.extraLine(localName(line.name, locale), line.quantity)}</dt>
          <dd>{formatMoney(line.subtotalCents, locale)}</dd>
        </div>
      ))}
      {quote.extras.length > 0 ? (
        <div>
          <dt>{t.extrasRow}</dt>
          <dd>{formatMoney(quote.extrasCents, locale)}</dd>
        </div>
      ) : null}
      {/* Le righe della caparra (D52): quanto si paga adesso e quanto resta, poi il totale. */}
      {deposit && deposit.balanceCents > 0 ? (
        <>
          <div>
            <dt>{d.now}</dt>
            <dd>{formatMoney(deposit.dueNowCents, locale)}</dd>
          </div>
          <div>
            <dt>{d.balance}</dt>
            <dd>{formatMoney(deposit.balanceCents, locale)}</dd>
          </div>
        </>
      ) : null}
      <div className="summary__total">
        <dt>{t.total}</dt>
        <dd>{formatMoney(quote.totalCents, locale)}</dd>
      </div>
    </dl>
  );
}

/** A quantity between 1 and the ceiling of 20, as the extras fields write it. */
const extraQuantityPattern = /^(?:[1-9]|1\d|20)$/;

/**
 * The quantities asked in the address, read against the catalogue of the club: one field
 * per service, named after it, so the choice survives the GET round trips like the promo code.
 */
export function readExtrasQuery(query: Query, catalogue: ApiExtraService[]): ApiExtraRequest[] {
  return catalogue.flatMap((service) => {
    const asked = first(query[`extra-${service.serviceId}`]);
    return asked && extraQuantityPattern.test(asked) ? [{ serviceId: service.serviceId, quantity: Number(asked) }] : [];
  });
}

/** The chosen quantities as hidden fields, so they travel with the promo form and up to the hold. */
export function ExtrasHidden({ chosen }: { chosen: ApiExtraRequest[] }) {
  return (
    <>
      {chosen.map((entry) => (
        <input key={entry.serviceId} type="hidden" name={`extra-${entry.serviceId}`} value={entry.quantity} />
      ))}
    </>
  );
}

/**
 * One labelled quantity field per extra service, 0 to 20, shared by the guest summary and
 * the front desk form. Plain number inputs: the totals are recomputed at submit, no scripts.
 */
export function ExtraQuantityFields({
  locale,
  idPrefix,
  catalogue,
  chosen,
}: {
  locale: Locale;
  idPrefix: string;
  catalogue: ApiExtraService[];
  chosen: ApiExtraRequest[];
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const quantities = new Map(chosen.map((entry) => [entry.serviceId, entry.quantity]));
  return (
    <>
      {catalogue.map((service) => (
        <div className="field" key={service.serviceId}>
          <label htmlFor={`${idPrefix}-${service.serviceId}`}>
            {localName(service.name, locale)} · {formatMoney(service.unitPriceCents, locale)}
            <span className="visually-hidden">. {t.extraQuantity(localName(service.name, locale))}</span>
          </label>
          <input
            id={`${idPrefix}-${service.serviceId}`}
            type="number"
            name={`extra-${service.serviceId}`}
            inputMode="numeric"
            min={0}
            max={20}
            defaultValue={quantities.get(service.serviceId) ?? 0}
          />
        </div>
      ))}
    </>
  );
}

export async function BookView({ lang, section, slug, step, query }: { lang: string; section: string; slug: string; step: string; query: Query }) {
  const { locale, beach, payment } = await loadBeach(lang, section, slug);
  if (step !== bookSegment[locale]) notFound();
  const t = getDictionary(locale, config.brandName).booking;
  const z = getDictionary(locale, config.brandName).zone;
  const spotId = first(query.spot) ?? '';
  const day = first(query.day) ?? '';
  if (!uuidPattern.test(spotId) || !dayPattern.test(day)) notFound();
  // «Al» del periodo (D39): assente o uguale a «dal», il riepilogo resta di una giornata.
  const toAsked = first(query.to);
  if (toAsked !== undefined && !dayPattern.test(toAsked)) notFound();
  const to = toAsked && toAsked !== day ? toAsked : undefined;

  // The extras of the club, public only inside this flow (spec §4.2), and the asked quantities.
  const catalogueResult = await api.extras(beach.slug);
  const catalogue = catalogueResult.ok ? catalogueResult.data.extras : [];
  let chosen = readExtrasQuery(query, catalogue);

  const promoAsked = first(query.promo)?.trim().slice(0, 40) || undefined;
  const request = { beachSlug: beach.slug, spotId, day, ...(to ? { to } : {}) };
  const withExtras = () => (chosen.length > 0 ? { extras: chosen } : {});
  let quote = await api.quote({ ...request, ...withExtras(), promoCode: promoAsked });
  let promoRefused = Boolean(first(query.promoError));
  let extrasRefused = Boolean(first(query.extrasError));
  // A refused code or a retired service does not block the page: the part is dropped,
  // the quote is recomputed without it and a clear message says what happened.
  if (!quote.ok && quote.code === 'extra_not_available') {
    extrasRefused = true;
    chosen = [];
    quote = await api.quote({ ...request, promoCode: promoAsked });
  }
  if (!quote.ok && quote.code === 'promo_not_applicable') {
    promoRefused = true;
    quote = await api.quote({ ...request, ...withExtras() });
    if (!quote.ok && quote.code === 'extra_not_available') {
      extrasRefused = true;
      chosen = [];
      quote = await api.quote(request);
    }
  }
  const availability = await api.availability(beach.slug, day, undefined, to);
  const spot = availability.ok ? availability.data.spots.find((candidate) => candidate.spotId === spotId) : undefined;
  // Le condizioni di annullamento col termine di QUESTO giorno d'arrivo (D53) e la
  // caparra (D52): la quota di adesso si calcola come la calcola il backend.
  const cancellation = availability.ok ? availability.data.cancellation : null;
  const dueNowCents = quote.ok && payment.mode === 'deposit' ? depositCents(quote.data.totalCents, payment.depositPercent) : quote.ok ? quote.data.totalCents : 0;
  const balanceCents = quote.ok ? quote.data.totalCents - dueNowCents : 0;
  // Un periodo rifiutato dall'API (oltre 31 giornate, al rovescio) è spiegato in parole.
  const periodError = quote.ok ? null : quote.code === 'cap_reached' ? t.periodTooLong : quote.code === 'invalid_state' ? t.periodBackwards : null;
  const toQuery = to ? `&to=${to}` : '';
  const backHref = `${beachPath(locale, beach.slug)}?day=${day}${toQuery}`;
  const selfHref = bookPath(locale, beach.slug);
  const alternate = `${bookPath(otherLocale(locale), beach.slug)}?spot=${spotId}&day=${day}${toQuery}`;

  // Il tipo della voce è un collegamento alla sua scheda (D63), col ritorno ESATTO a
  // questo riepilogo: stessa query, codice promozionale e quantità degli extra compresi.
  const types = await spotTypesOf(beach.slug);
  const typeEntry = spot ? typeByName(types, spot.typeName) : undefined;
  const tornaBook =
    `${selfHref}?spot=${spotId}&day=${day}${toQuery}` +
    (quote.ok && quote.data.promoCode ? `&promo=${encodeURIComponent(quote.data.promoCode)}` : '') +
    chosen.map((entry) => `&extra-${entry.serviceId}=${entry.quantity}`).join('');
  const typeRow: [string, ReactNode][] = spot
    ? [
        [
          getDictionary(locale, config.brandName).typeCards.typeRow,
          typeEntry ? (
            <Link key="tipo" href={typeCardHref(locale, beach.slug, typeEntry.typeId, tornaBook)} prefetch={false}>
              {spot.typeName}
            </Link>
          ) : (
            spot.typeName
          ),
        ],
      ]
    : [];

  return (
    <PageShell locale={locale} page="search" alternatePath={alternate} crumbs={crumbsFor(locale, beach, t.summaryTitle)}>
      <PageHead title={t.bookTitle(beach.name)} lead={t.holdNote} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container">
          {!quote.ok || !spot ? (
            <div className="empty">
              <h2>{periodError ? t.periodErrorTitle : quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableTitle : t.unavailableTitle}</h2>
              <p>{periodError ?? (quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableText : t.unavailableText)}</p>
              <Link className="button button--secondary" href={backHref}>
                {t.backToBeach}
              </Link>
            </div>
          ) : (
            <div className="stack">
              <h2>{t.summaryTitle}</h2>
              {promoRefused ? <p className="alert" role="alert">{t.promoInvalid}</p> : null}
              {extrasRefused ? <p className="alert" role="alert">{t.extrasInvalid}</p> : null}
              <PriceSummary
                locale={locale}
                quote={quote.data}
                days={quote.data.days}
                deposit={{ dueNowCents, balanceCents }}
                rows={[
                  // Il periodo in testa (D39): dal–al e numero di giornate; una giornata resta «Giorno».
                  to
                    ? [t.periodRow, t.periodValue(formatPeriod(day, to, locale), periodDays(day, to))]
                    : [t.dayRow, formatDay(day, locale)],
                  [t.spotRow, `${spot.code}, ${t.row(spot.rowNumber)}`],
                  // Il tipo della voce, collegato alla sua scheda (D63).
                  ...typeRow,
                  // La zona con nome (D50), quando la postazione ne ha una.
                  ...(spot.zoneName ? ([[z.label, spot.zoneName]] as [string, string][]) : []),
                  [t.equipmentRow, t.equipment(spot.umbrellas, spot.sunbeds)],
                ]}
              />
              {/* La frase della caparra (D52): il pagamento che apri adesso vale l'acconto. */}
              <DepositExplain locale={locale} dueNowCents={dueNowCents} balanceCents={balanceCents} />
              {/* The extras picker: the quote is recomputed at submit, like the promo code (spec §4.2). */}
              {catalogue.length > 0 ? (
                <div className="panel">
                  <h3>{t.extrasTitle}</h3>
                  {/* Gli extra di un periodo si scelgono una volta e valgono per il periodo (D38). */}
                  <p className="prose">{to ? t.extrasPeriodLead : t.extrasLead}</p>
                  <form className="form-row" method="get" action={selfHref}>
                    <input type="hidden" name="spot" value={spotId} />
                    <input type="hidden" name="day" value={day} />
                    {to ? <input type="hidden" name="to" value={to} /> : null}
                    {quote.data.promoCode ? <input type="hidden" name="promo" value={quote.data.promoCode} /> : null}
                    <ExtraQuantityFields locale={locale} idPrefix="extra" catalogue={catalogue} chosen={chosen} />
                    <button className="button button--secondary" type="submit">
                      {t.extrasApply}
                    </button>
                  </form>
                </div>
              ) : null}
              <form className="form-row" method="get" action={selfHref}>
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                {to ? <input type="hidden" name="to" value={to} /> : null}
                <ExtrasHidden chosen={chosen} />
                <div className="field">
                  <label htmlFor="promo">{t.promoLabel}</label>
                  <input id="promo" name="promo" defaultValue={quote.data.promoCode ?? ''} maxLength={40} autoComplete="off" autoCapitalize="characters" />
                </div>
                <button className="button button--secondary" type="submit">
                  {t.promoApply}
                </button>
              </form>
              <div>
                <h3>{t.conditionsTitle}</h3>
                {/* Le condizioni VERE dello stabilimento (D53), col termine del giorno d'arrivo. */}
                {cancellation ? (
                  <CancellationBlock locale={locale} cancellation={cancellation} timezone={beach.timezone} />
                ) : (
                  <p className="prose">{t.conditionsMissing}</p>
                )}
              </div>
              <form method="post" action="/azioni/riserva">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                {to ? <input type="hidden" name="to" value={to} /> : null}
                <input type="hidden" name="promo" value={quote.data.promoCode ?? ''} />
                <ExtrasHidden chosen={chosen} />
                <input type="hidden" name="key" value={`web-${crypto.randomUUID()}`} />
                <button className="button button--block" type="submit">
                  {t.holdButton}
                </button>
              </form>
              {/* «Aggiungi al carrello» (D46): same hidden fields, no reserve taken. */}
              <form method="post" action="/azioni/carrello-aggiungi">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                {to ? <input type="hidden" name="to" value={to} /> : null}
                <input type="hidden" name="promo" value={quote.data.promoCode ?? ''} />
                <ExtrasHidden chosen={chosen} />
                <button className="button button--secondary button--block" type="submit">
                  {getDictionary(locale, config.brandName).cart.addButton}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}

export async function HoldView({ lang, section, slug, step, holdId }: { lang: string; section: string; slug: string; step: string; holdId: string }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== holdSegment[locale] || !uuidPattern.test(holdId)) notFound();
  const t = getDictionary(locale, config.brandName).booking;
  const result = await api.getHold(beach.slug, holdId);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const held = result.data;
  const active = held.status === 'active';
  const c = getDictionary(locale, config.brandName).checkout;
  const alternate = `${beachPath(otherLocale(locale), beach.slug)}/${holdSegment[otherLocale(locale)]}/${holdId}`;

  // Il tipo della riserva è un collegamento alla sua scheda (D63), col ritorno a questa pagina.
  const types = await spotTypesOf(beach.slug);
  const typeEntry = typeByName(types, held.spot.typeName);
  const tornaHold = `${beachPath(locale, beach.slug)}/${holdSegment[locale]}/${holdId}`;
  const typeRow: [string, ReactNode][] = [
    [
      getDictionary(locale, config.brandName).typeCards.typeRow,
      typeEntry ? (
        <Link key="tipo" href={typeCardHref(locale, beach.slug, typeEntry.typeId, tornaHold)} prefetch={false}>
          {held.spot.typeName}
        </Link>
      ) : (
        held.spot.typeName
      ),
    ],
  ];

  return (
    <PageShell locale={locale} page="search" alternatePath={alternate} crumbs={crumbsFor(locale, beach, t.holdTitle)}>
      <PageHead
        title={active ? t.holdActiveTitle : t.holdEndedTitle}
        lead={active ? t.holdUntil(formatTime(held.expiresAt, locale, beach.timezone)) : t.holdEndedText}
      />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          {active ? (
            <>
              <PriceSummary
                locale={locale}
                quote={held}
                days={held.days}
                deposit={{ dueNowCents: held.dueNowCents, balanceCents: held.balanceCents }}
                rows={[
                  // Il periodo della riserva (D39): una giornata resta «Giorno», come oggi.
                  held.to !== held.from
                    ? [t.periodRow, t.periodValue(formatPeriod(held.from, held.to, locale), periodDays(held.from, held.to))]
                    : [t.dayRow, formatDay(held.day, locale)],
                  [t.spotRow, `${held.spot.code}, ${t.row(held.spot.rowNumber)}`],
                  // Il tipo della voce, collegato alla sua scheda (D63).
                  ...typeRow,
                  // La zona con nome (D50), quando la postazione ne ha una.
                  ...(held.spot.zoneName ? ([[getDictionary(locale, config.brandName).zone.label, held.spot.zoneName]] as [string, string][]) : []),
                  [t.equipmentRow, t.equipment(held.spot.umbrellas, held.spot.sunbeds)],
                ]}
              />
              {/* La caparra (D52): «Vai al pagamento» apre il pagamento dell'acconto, detto qui. */}
              <DepositExplain locale={locale} dueNowCents={held.dueNowCents} balanceCents={held.balanceCents} />
              <div>
                <h3>{t.conditionsTitle}</h3>
                <CancellationBlock locale={locale} cancellation={held.cancellation} timezone={beach.timezone} />
              </div>
              <p className="prose">{t.holdNotConfirmation}</p>
              <form method="post" action="/azioni/prenotazione" className="stack">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="hold" value={held.holdId} />
                <h2>{c.title}</h2>
                <div className="field">
                  <label htmlFor="nome">{c.name}</label>
                  <input id="nome" name="name" autoComplete="name" maxLength={120} required />
                </div>
                <div className="field">
                  <label htmlFor="email">{c.email}</label>
                  <input id="email" name="email" type="email" autoComplete="email" maxLength={200} required />
                </div>
                <button className="button button--block" type="submit">{c.button}</button>
              </form>
            </>
          ) : null}
          <Link className="button button--secondary" href={`${beachPath(locale, beach.slug)}?day=${held.day}${held.to !== held.from ? `&to=${held.to}` : ''}`}>
            {t.backToBeach}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
