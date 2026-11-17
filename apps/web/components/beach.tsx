import { cache, Fragment, type CSSProperties, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  beachPath,
  beachSection,
  bookingSegment,
  bookPath,
  bookSegment,
  config,
  formatMoney,
  getDictionary,
  holdSegment,
  isLocale,
  locales,
  pathFor,
  spotZones,
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
  formatDay,
  formatTime,
  isDay,
  localName,
  slugPattern,
  uuidPattern,
  type ApiBeach,
  type ApiExtraLine,
  type ApiExtraRequest,
  type ApiExtraService,
  type ApiLayoutElement,
  type ApiMapSpot,
  type ApiSpot,
  type ApiZoneGaps,
} from '@/lib/api';
import { JsonLd, privateMetadata } from '@/lib/seo';
import { DecorationMark } from './decorations';
import { PageHead, PageShell, type Crumb } from './PageShell';
import { BeachSite, localBusinessData } from './site-view';

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
  ): Promise<{ locale: Locale; beach: ApiBeach; nextDay: string | null; site: { template: SiteTemplate; content: SiteContent } | null }> => {
    if (!isLocale(lang) || section !== beachSection[lang] || !slugPattern.test(slug)) notFound();
    const result = await api.beach(slug);
    if (!result.ok) {
      if (result.status === 404) notFound();
      throw new Error(`API not available (${result.code})`);
    }
    return { locale: lang, beach: result.data.beach, nextDay: result.data.nextAvailableDay, site: result.data.site };
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

/** Title of the pages after the beach page: summary, hold, booking. Never indexed. */
export async function stepMetadata(lang: string, section: string, slug: string, step: string): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName);
  const page = step === bookSegment[locale] ? t.booking.summaryTitle : step === bookingSegment[locale] ? t.account.booking : t.booking.holdTitle;
  return privateMetadata(locale, page, { club: beach.name, follow: true });
}

/** Where the day picker and the map start: the target of the button under the lead. */
const pickerAnchor = 'disponibilita';

function SpotCard({ locale, beach, spot, day, selected, suggested }: { locale: Locale; beach: ApiBeach; spot: ApiSpot; day: string; selected: boolean; suggested: boolean }) {
  const t = getDictionary(locale, config.brandName).booking;
  const href = `${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}`;
  return (
    <li className={selected ? 'spot plan-chosen' : 'spot'} aria-current={selected ? 'true' : undefined}>
      <span className="spot__code">{spot.code}</span>
      <p>{spot.typeName}</p>
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

// Corners of an umbrella seen from above: eight sides, flat at the top.
const canopy = [
  [41.55, 31.27],
  [31.27, 41.55],
  [16.73, 41.55],
  [6.45, 31.27],
  [6.45, 16.73],
  [16.73, 6.45],
  [31.27, 6.45],
  [41.55, 16.73],
] as const;
const canopyPath = `M${canopy.map((corner) => corner.join(' ')).join('L')}Z`;
const ribsPath = canopy.slice(0, 4).map((corner, index) => `M${corner.join(' ')}L${canopy[index + 4]!.join(' ')}`).join('');
const stripesPath = [0, 2, 4, 6].map((index) => `M24 24L${canopy[index]!.join(' ')}L${canopy[index + 1]!.join(' ')}Z`).join('');

/**
 * The mark of a spot on the map. The state is in the drawing, not only in the colour:
 * a full canopy is free, a canopy in alternate wedges is a shared day, a crossed one is not available.
 */
function UmbrellaMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d={canopyPath} />
      {status === 'shared' ? (
        <>
          <path className="plan-mark__stripes" d={stripesPath} />
          <path className="plan-mark__outline" d={canopyPath} />
        </>
      ) : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M16 16l16 16M32 16L16 32" />
      ) : (
        <>
          <path className="plan-mark__ribs" d={ribsPath} />
          <circle className="plan-mark__top" cx="24" cy="24" r="3" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** Check badge of the chosen spot, on top of its mark. */
function SelectedBadge() {
  return (
    <>
      <circle className="plan-mark__badge" cx="38" cy="10" r="8.5" />
      <path className="plan-mark__check" d="M33.8 10.2l3 3 5.4-6" />
    </>
  );
}

/** Sparkle badge of the recommended spot: its own shape and corner, never colour alone. */
function SuggestedBadge() {
  return (
    <>
      <circle className="plan-mark__suggest" cx="10" cy="10" r="8.5" />
      <path className="plan-mark__spark" d="M10 4.5l1.6 3.9 3.9 1.6-3.9 1.6-1.6 3.9-1.6-3.9L4.5 10l3.9-1.6Z" />
    </>
  );
}

/**
 * A single sunbed seen from above: a bed with its pillow, a different shape from the umbrella.
 * The state stays in the drawing too: bands for a shared day, a cross when not available.
 */
function SunbedMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="plan-mark__canopy" x="15" y="6" width="18" height="36" rx="5" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M16 22h16M16 31h16" /> : null}
      {status === 'unavailable' ? <path className="plan-mark__cross" d="M18 18l12 12M30 18L18 30" /> : <path className="plan-mark__pillow" d="M20 13h8" />}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A gazebo seen from above: a square roof with its ridges, a shape of its own next to the round umbrella. */
function GazeboMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="plan-mark__canopy" x="8" y="8" width="32" height="32" rx="4" />
      {status === 'shared' ? (
        <>
          <path className="plan-mark__stripes" d="M24 24L8 8h32ZM24 24L8 40h32Z" />
          <rect className="plan-mark__outline" x="8" y="8" width="32" height="32" rx="4" />
        </>
      ) : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M16 16l16 16M32 16L16 32" />
      ) : (
        <>
          <path className="plan-mark__ribs" d="M9.5 9.5l29 29M38.5 9.5l-29 29" />
          <circle className="plan-mark__top" cx="24" cy="24" r="3" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A tent seen from the front: a triangle with its door, nothing like the other marks. */
function TentMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d="M24 6L44 41H4Z" />
      {status === 'shared' ? (
        <>
          <path className="plan-mark__bands" d="M17 30h14M13 36h22" />
          <path className="plan-mark__outline" d="M24 6L44 41H4Z" />
        </>
      ) : null}
      {status === 'unavailable' ? <path className="plan-mark__cross" d="M18 23l12 12M30 23L18 35" /> : <path className="plan-mark__stripes" d="M20 41l4-11 4 11Z" />}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A daybed seen from above: a wide bed, clearly broader than the single sunbed. */
function DaybedMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="plan-mark__canopy" x="6" y="14" width="36" height="20" rx="5" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M20 16v16M28 16v16" /> : null}
      {status === 'unavailable' ? <path className="plan-mark__cross" d="M18 18l12 12M30 18L18 30" /> : <path className="plan-mark__pillow" d="M12 20v8" />}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A deck chair seen from above: side rails and the head bar, wider than the single sunbed. */
function DeckchairMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="plan-mark__canopy" x="12" y="7" width="24" height="34" rx="3" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M14 22h20M14 30h20" /> : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M18 18l12 12M30 18L18 30" />
      ) : (
        <>
          <path className="plan-mark__ribs" d="M16 10v28M32 10v28" />
          <path className="plan-mark__pillow" d="M19 14h10" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A canvas gazebo seen from above: a billowing sail, its seams in a cross, nothing like the rigid square. */
function CanopyMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  const sail = 'M10 10C19 5.5 29 5.5 38 10C42.5 19 42.5 29 38 38C29 42.5 19 42.5 10 38C5.5 29 5.5 19 10 10Z';
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d={sail} />
      {status === 'shared' ? (
        <>
          <path className="plan-mark__stripes" d="M24 24L10 10C19 5.5 29 5.5 38 10ZM24 24L10 38C19 42.5 29 42.5 38 38Z" />
          <path className="plan-mark__outline" d={sail} />
        </>
      ) : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M16 16l16 16M32 16L16 32" />
      ) : (
        <>
          <path className="plan-mark__ribs" d="M24 8v32M8 24h32" />
          <circle className="plan-mark__top" cx="24" cy="24" r="3" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A canoe seen from above: a pointed hull with its two thwarts. */
function CanoeMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d="M24 3C29.5 10 29.5 38 24 45C18.5 38 18.5 10 24 3Z" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M20 20h8M20 28h8" /> : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M19 19l10 10M29 19L19 29" />
      ) : (
        <path className="plan-mark__pillow" d="M21 15h6M21 33h6" />
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A SUP board seen from above: narrow, rounded at both ends, with its long centre line. */
function SupMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect className="plan-mark__canopy" x="17" y="4" width="14" height="40" rx="7" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M19 20h10M19 28h10" /> : null}
      {status === 'unavailable' ? <path className="plan-mark__cross" d="M19 19l10 10M29 19L19 29" /> : <path className="plan-mark__pillow" d="M24 12v24" />}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A pedal boat seen from above: a wide deck with its two seats and the paddle wheel bar. */
function PedaloMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d="M9 16C9 9 15 6 24 6C33 6 39 9 39 16V34C39 40 33 43 24 43C15 43 9 40 9 34Z" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M14 20h20M14 29h20" /> : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M17 18l14 14M31 18L17 32" />
      ) : (
        <>
          <path className="plan-mark__ribs" d="M12 15h24" />
          <path className="plan-mark__stripes" d="M14 24h8v9h-8ZM26 24h8v9h-8Z" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

/** A jet ski seen from above: a teardrop hull with handlebar and saddle. */
function JetskiMark({ status, selected = false, suggested = false }: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d="M24 4C33 10 36 19 36 29C36 38.5 31 44 24 44C17 44 12 38.5 12 29C12 19 15 10 24 4Z" />
      {status === 'shared' ? <path className="plan-mark__bands" d="M17 24h14M17 32h14" /> : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M18 19l12 12M30 19L18 31" />
      ) : (
        <>
          <path className="plan-mark__ribs" d="M15 16C21 13 27 13 33 16" />
          <path className="plan-mark__pillow" d="M24 23v15" />
        </>
      )}
      {selected ? <SelectedBadge /> : null}
      {suggested ? <SuggestedBadge /> : null}
    </svg>
  );
}

const markComponents: Record<SpotMarkKind, (props: { status: ApiMapSpot['status']; selected?: boolean; suggested?: boolean }) => ReactNode> = {
  umbrella: UmbrellaMark,
  sunbed: SunbedMark,
  gazebo: GazeboMark,
  tent: TentMark,
  daybed: DaybedMark,
  deckchair: DeckchairMark,
  canopy: CanopyMark,
  canoe: CanoeMark,
  sup: SupMark,
  pedalo: PedaloMark,
  jetski: JetskiMark,
};


/** The mark of a spot, from the fixed repertoire. Without a mark, the equipment decides. */
export function SpotMark({
  mark,
  umbrellas = 1,
  status,
  selected = false,
  suggested = false,
}: {
  mark?: SpotMarkKind;
  umbrellas?: number;
  status: ApiMapSpot['status'];
  selected?: boolean;
  suggested?: boolean;
}) {
  const Mark = markComponents[mark ?? (umbrellas === 0 ? 'sunbed' : 'umbrella')];
  return <Mark status={status} selected={selected} suggested={suggested} />;
}

function MapSpot({
  locale,
  beach,
  spot,
  day,
  selected,
  suggested,
  guests,
}: {
  locale: Locale;
  beach: ApiBeach;
  spot: ApiMapSpot;
  day: string;
  selected: boolean;
  suggested: boolean;
  guests?: number;
}) {
  const t = getDictionary(locale, config.brandName).booking;
  const content = (
    <>
      <SpotMark mark={spot.typeMark} status={spot.status} selected={selected} suggested={suggested} />
      <span className="plan-spot__code" aria-hidden="true">
        {spot.code}
      </span>
      <span className="visually-hidden">
        {t.mapSpot(spot.typeName, spot.code, t.status[spot.status], spot.priceCents === null ? undefined : formatMoney(spot.priceCents, locale))}
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
        href={`${beachPath(locale, beach.slug)}?day=${day}${guests ? `&guests=${guests}` : ''}&spot=${spot.spotId}#postazione-${spot.code}`}
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
      {element.sign ? <DecorationMark sign={element.sign} /> : null}
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
  const width = spanWidthRem(element.colStart ?? 1, element.colEnd ?? element.colStart ?? 1, lanes, cellRem);
  return (
    <li className={cabins ? 'plan-box plan-box--cabins' : 'plan-box'} style={{ width: `${width}rem` }}>
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
        <div className={`plan__rows${flip}`}>
          <p className="plan__sea">
            <span className="plan__sea-label">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
              </svg>
              {t.planSea}
              <span className="visually-hidden">, {t.planSeaNote}</span>
            </span>
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

function BeachMap({
  locale,
  beach,
  layout,
  gaps,
  seaSide,
  elements,
  day,
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
      <ul className="plan-legend" aria-label={t.legendTitle}>
        <li>
          <UmbrellaMark status="free" />
          {t.status.free}
        </li>
        <li>
          <UmbrellaMark status="shared" />
          {t.status.shared}
        </li>
        <li>
          <UmbrellaMark status="unavailable" />
          {t.status.unavailable}
        </li>
        <li>
          <UmbrellaMark status="free" selected />
          {t.status.selected}
        </li>
        {suggested ? (
          <li>
            <UmbrellaMark status="free" suggested />
            {t.suggestedLegend}
          </li>
        ) : null}
        <MarkLegendItems locale={locale} marks={layout.map((spot) => spot.typeMark)} />
      </ul>
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
function SelectionBar({ locale, beach, spot, day }: { locale: Locale; beach: ApiBeach; spot: ApiMapSpot & { priceCents: number }; day: string }) {
  const t = getDictionary(locale, config.brandName).booking;
  return (
    <aside className="plan-bar" id="scelta" aria-label={t.barLabel}>
      <div className="container plan-bar__inner">
        <p className="plan-bar__title">
          {t.spot(spot.code)}, {t.zones[spot.zone].toLowerCase()}, {t.row(spot.rowNumber).toLowerCase()}
        </p>
        <p className="plan-bar__price">{formatMoney(spot.priceCents, locale)}</p>
        <p className="plan-bar__detail">
          {t.equipment(spot.umbrellas, spot.sunbeds)}. {t.guests(spot.maxGuests)}.{spot.status === 'shared' ? ` ${t.sharedDay}.` : ''}
        </p>
        <Link className="button plan-bar__go" href={`${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}`}>
          {t.barContinue}
        </Link>
      </div>
    </aside>
  );
}

export async function BeachView({ lang, section, slug, query }: { lang: string; section: string; slug: string; query: Query }) {
  const { locale, beach, nextDay, site } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const texts = site ? site.content[locale] : null;
  const asked = first(query.day);
  const day = isDay(asked) ? asked : nextDay;
  // Guests are optional: with them the answer carries the recommended spot (spec §3.3).
  const guestsAsked = first(query.guests);
  const guests = guestsAsked && /^\d{1,2}$/.test(guestsAsked) && Number(guestsAsked) >= 1 && Number(guestsAsked) <= 20 ? Number(guestsAsked) : undefined;
  const availability = day ? await api.availability(beach.slug, day, guests) : null;
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
  const alternateQuery = isDay(asked) ? `?day=${asked}${guests ? `&guests=${guests}` : ''}${selected ? `&spot=${selected.spotId}` : ''}` : '';

  return (
    <PageShell locale={locale} page="search" alternatePath={beachPath(otherLocale(locale), beach.slug) + alternateQuery} crumbs={crumbsFor(locale, beach)}>
      <PageHead title={beach.name} lead={t.beachLead(beach.locality)}>
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
      <section className="section" id={pickerAnchor}>
        <div className="container">
          {first(query.taken) ? <p className="alert" role="alert">{t.takenNotice}</p> : null}
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
                  <label htmlFor="giorno">{t.dayLabel}</label>
                  <input id="giorno" type="date" name="day" defaultValue={day} required />
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
              <h2>{t.freeTitle(formatDay(day, locale))}</h2>
              {guests && suggested ? (
                <p className="plan__notice">
                  <strong>{t.suggestedNotice(suggested.code, guests)}</strong>
                </p>
              ) : null}
              {!availability?.ok ? (
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
                                    selected={spot.spotId === selected?.spotId}
                                    suggested={spot.spotId === suggestedId}
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
      {selected && day ? <SelectionBar locale={locale} beach={beach} spot={selected} day={day} /> : null}
    </PageShell>
  );
}

export function PriceSummary({
  locale,
  rows,
  quote,
}: {
  locale: Locale;
  rows: [string, string][];
  quote: { listPriceCents: number; discountCents: number; extrasCents: number; totalCents: number; promoCode: string | null; extras: ApiExtraLine[] };
}) {
  const t = getDictionary(locale, config.brandName).booking;
  return (
    <dl className="summary">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
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
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== bookSegment[locale]) notFound();
  const t = getDictionary(locale, config.brandName).booking;
  const spotId = first(query.spot) ?? '';
  const day = first(query.day) ?? '';
  if (!uuidPattern.test(spotId) || !dayPattern.test(day)) notFound();

  // The extras of the club, public only inside this flow (spec §4.2), and the asked quantities.
  const catalogueResult = await api.extras(beach.slug);
  const catalogue = catalogueResult.ok ? catalogueResult.data.extras : [];
  let chosen = readExtrasQuery(query, catalogue);

  const promoAsked = first(query.promo)?.trim().slice(0, 40) || undefined;
  const request = { beachSlug: beach.slug, spotId, day };
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
  const availability = await api.availability(beach.slug, day);
  const spot = availability.ok ? availability.data.spots.find((candidate) => candidate.spotId === spotId) : undefined;
  const backHref = `${beachPath(locale, beach.slug)}?day=${day}`;
  const selfHref = bookPath(locale, beach.slug);
  const alternate = `${bookPath(otherLocale(locale), beach.slug)}?spot=${spotId}&day=${day}`;

  return (
    <PageShell locale={locale} page="search" alternatePath={alternate} crumbs={crumbsFor(locale, beach, t.summaryTitle)}>
      <PageHead title={t.bookTitle(beach.name)} lead={t.holdNote} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container">
          {!quote.ok || !spot ? (
            <div className="empty">
              <h2>{quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableTitle : t.unavailableTitle}</h2>
              <p>{quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableText : t.unavailableText}</p>
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
                rows={[
                  [t.dayRow, formatDay(day, locale)],
                  [t.spotRow, `${spot.code}, ${t.row(spot.rowNumber)}`],
                  [t.equipmentRow, t.equipment(spot.umbrellas, spot.sunbeds)],
                ]}
              />
              {/* The extras picker: the quote is recomputed at submit, like the promo code (spec §4.2). */}
              {catalogue.length > 0 ? (
                <div className="panel">
                  <h3>{t.extrasTitle}</h3>
                  <p className="prose">{t.extrasLead}</p>
                  <form className="form-row" method="get" action={selfHref}>
                    <input type="hidden" name="spot" value={spotId} />
                    <input type="hidden" name="day" value={day} />
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
                <p className="prose">{t.conditionsMissing}</p>
              </div>
              <form method="post" action="/azioni/riserva">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                <input type="hidden" name="promo" value={quote.data.promoCode ?? ''} />
                <ExtrasHidden chosen={chosen} />
                <input type="hidden" name="key" value={`web-${crypto.randomUUID()}`} />
                <button className="button button--block" type="submit">
                  {t.holdButton}
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
                rows={[
                  [t.dayRow, formatDay(held.day, locale)],
                  [t.spotRow, `${held.spot.code}, ${t.row(held.spot.rowNumber)}`],
                  [t.equipmentRow, t.equipment(held.spot.umbrellas, held.spot.sunbeds)],
                ]}
              />
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
          <Link className="button button--secondary" href={`${beachPath(locale, beach.slug)}?day=${held.day}`}>
            {t.backToBeach}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
