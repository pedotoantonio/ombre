import { Fragment, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  accountPath,
  beachLayoutPath,
  can,
  config,
  decorationSigns,
  elementLabelMaxLength,
  formatMoney,
  getDictionary,
  locales,
  maxColumns,
  maxGapRows,
  rentalNotesMaxLength,
  rentalTypeMaxLength,
  rentalTypeSuggestions,
  spotMarks,
  spotTypeNameMaxLength,
  spotZones,
  zoneNameMaxLength,
  zoneNameMinLength,
  type Locale,
  type SeaSide,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import { apiCall, formatPeriod, slugPattern, type ApiLayoutElement } from '@/lib/api';
import { Hidden, Notice, requireMe, SectionNotice } from './account';
import { SpotSymbol, type SpotArtState } from './beach-art';
import { MarkLegendItems, PlanCanvas, planSize, SpotMark, zoneRows } from './beach';
import { DecorationMark } from './decorations';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';

// The "Spiaggia" page of the reserved area is the PLANNER (D57): every gesture — create,
// move, edit, delete, scenery, zone brush — queues one operation on the per-club draft;
// nothing touches the real beach until «Salva la spiaggia» shows the summary and applies
// everything in one transaction. The preview renders the draft; the public only ever sees
// the saved beach. Everything works without JavaScript: the drag of a spot (D60) is a
// progressive shortcut that fills and submits the same move form. The catalogues (types,
// named zones, sea side, distances) stay immediate, outside the draft. The reception sees
// and uses the zone distances only.

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
  /** Column inside the row: the only source of the drawing. Holes are allowed. */
  col: number;
  typeId: string;
  typeName: string;
  typeMark: SpotMarkKind;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Management annotations, never public. */
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  /** Under maintenance (D56): not bookable while it lasts, stays in the drawing. */
  maintenance: boolean;
  /** The named zone of the spot (D50); both null when it belongs to none. */
  namedZoneId: string | null;
  zoneName: string | null;
  activeContract: ApiActiveContract | null;
}

/** A named zone of the club (D50), with how many spots belong to it. */
interface ApiNamedZone {
  zoneId: string;
  name: string;
  spots: number;
}

interface ApiLayout {
  seaSide: SeaSide;
  shoreGapRows: number;
  landGapRows: number;
  spots: ApiLayoutSpot[];
  elements: ApiLayoutElement[];
}

interface ApiSpotType {
  typeId: string;
  name: string;
  mark: SpotMarkKind;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  defaultPriceCents: number | null;
  builtin: boolean;
  spots: number;
}

// ---- The draft of the planner (D57), as the API serves it ----

/** A spot of the draft preview: the layout's shape plus whether it exists only in the draft. */
interface ApiDraftSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeId: string;
  typeName: string;
  typeMark: SpotMarkKind;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  maintenance: boolean;
  namedZoneId: string | null;
  zoneName: string | null;
  draftOnly: boolean;
}

/** One stored operation with its structured description; stale when the real layout changed under it. */
interface ApiDraftOpView {
  op: { op: string } & Record<string, unknown>;
  description: Record<string, unknown> & { action: string };
  stale: boolean;
}

interface ApiDraft {
  ops: ApiDraftOpView[];
  updatedBy: string | null;
  updatedAt: string | null;
  preview: {
    seaSide: SeaSide;
    shoreGapRows: number;
    landGapRows: number;
    spots: ApiDraftSpot[];
    elements: (ApiLayoutElement & { draftOnly: boolean })[];
  };
}

/** The spot shape the editor works on: the draft preview plus the saved contract, when any. */
type EditorSpot = ApiDraftSpot & { activeContract: ApiActiveContract | null };

/** The label "Stagionale" is an annotation: here it is read without regard for case. */
function labelledSeasonal(rentalType: string | null): boolean {
  return rentalType !== null && rentalType.trim().toLowerCase() === 'stagionale';
}

const rentalListId = 'tipi-affitto';

/** The management state of a spot in the drawing: retirement wins, then maintenance (D56). */
function manageArtState(spot: { retired: boolean; maintenance: boolean }): SpotArtState {
  if (spot.retired) return 'unavailable';
  if (spot.maintenance) return 'maintenance';
  return 'available';
}

/** The pastel veil of a named zone (D59): one deterministic hue per zone, sober and stable. */
function zoneVeils(namedZones: ApiNamedZone[]): Map<string, CSSProperties> {
  return new Map(
    namedZones.map((zone, index) => {
      const hue = Math.round((index * 137.508) % 360);
      return [zone.zoneId, { '--zona-velo': `hsl(${hue} 55% 88%)` } as CSSProperties];
    }),
  );
}

/** Time of the last touch of the draft, in the club's zone. */
function formatWhen(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(iso));
}

// ---- The operations of the draft, in words: built from the structured descriptions ----

type Dictionary = ReturnType<typeof getDictionary>;

function describeElement(t: Dictionary, description: Record<string, unknown>): string {
  const kind = description.kind as string | undefined;
  const sign = description.sign as string | undefined;
  const label = description.label as string | null | undefined;
  const kinds = t.layout.elementKinds as Record<string, string>;
  const signs = t.booking.decorations as Record<string, string>;
  const base = kind === 'decoration' && sign && signs[sign] ? signs[sign] : kind && kinds[kind] ? kinds[kind] : (kind ?? '');
  return label ? `${base} «${label}»` : base;
}

function describeCell(t: Dictionary, zone: unknown, row: unknown, col: unknown): string {
  const zones = t.booking.zones as Record<string, string>;
  const zoneName = typeof zone === 'string' && zones[zone] ? zones[zone] : t.layout.allZones;
  if (row === 0) return t.draft.cellBeforeRow1(zoneName, Number(col ?? 1));
  return t.draft.cell(zoneName, Number(row ?? 1), Number(col ?? 1));
}

/** The pieces of an edit_spot phrase, in the order of the form (D56, D57). */
function describeChanges(t: Dictionary, description: Record<string, unknown>): string {
  const d = t.draft.changes;
  const patch = (description.patch ?? {}) as Record<string, unknown>;
  const pieces: string[] = [];
  if (typeof patch.code === 'string') pieces.push(d.code(patch.code));
  if (typeof description.typeName === 'string' && description.typeName) pieces.push(d.type(description.typeName));
  if (typeof patch.umbrellas === 'number') pieces.push(d.umbrellas(patch.umbrellas));
  if (typeof patch.sunbeds === 'number') pieces.push(d.sunbeds(patch.sunbeds));
  if (typeof patch.maxGuests === 'number') pieces.push(d.maxGuests(patch.maxGuests));
  if ('namedZoneId' in patch && patch.namedZoneId !== undefined) {
    pieces.push(patch.namedZoneId === null ? d.zoneNone : d.zone(String(description.zoneName ?? '')));
  }
  if (typeof patch.maintenance === 'boolean') pieces.push(patch.maintenance ? d.maintenanceOn : d.maintenanceOff);
  if ('rentalType' in patch && patch.rentalType !== undefined) pieces.push(patch.rentalType === null ? d.rentalTypeNone : d.rentalType(String(patch.rentalType)));
  if ('rentalNotes' in patch && patch.rentalNotes !== undefined) pieces.push(patch.rentalNotes === null ? d.rentalNotesNone : d.rentalNotes);
  return pieces.join(', ');
}

/** ONE sentence per operation, built from the structured description with the dictionaries. */
function opPhrase(t: Dictionary, view: ApiDraftOpView): string {
  const d = t.draft;
  const zones = t.booking.zones as Record<string, string>;
  const info = view.description;
  const kinds = d.kinds as Record<string, string>;
  // A stale op carries only its action and reason: the kind label stands in for the phrase.
  const fallback = kinds[info.action] ?? info.action;
  switch (info.action) {
    case 'create_spot':
      if (info.code === undefined) return fallback;
      return d.ops.create_spot(String(info.code), zones[String(info.zone)] ?? String(info.zone), Number(info.row), Number(info.col), (info.typeName as string | null) ?? null);
    case 'create_grid':
      if (info.firstCode === undefined) return fallback;
      return d.ops.create_grid(Number(info.rows), Number(info.cols), zones[String(info.zone)] ?? String(info.zone), String(info.firstCode), String(info.lastCode), (info.typeName as string | null) ?? null);
    case 'move_spot': {
      if (info.code === undefined) return fallback;
      const from = info.from as { zone: string; row: number; col: number };
      const to = info.to as { zone: string; row: number; col: number };
      return d.ops.move_spot(String(info.code), describeCell(t, from.zone, from.row, from.col), describeCell(t, to.zone, to.row, to.col));
    }
    case 'edit_spot':
      if (info.code === undefined) return fallback;
      return d.ops.edit_spot(String(info.code), describeChanges(t, info));
    case 'delete_spot':
      if (info.code === undefined) return fallback;
      return d.ops.delete_spot(String(info.code), zones[String(info.zone)] ?? String(info.zone), Number(info.row), Number(info.col));
    case 'add_element':
      if (info.kind === undefined) return fallback;
      return d.ops.add_element(describeElement(t, info), describeCell(t, info.zone, info.row, info.col));
    case 'move_element': {
      if (info.kind === undefined) return fallback;
      const to = info.to as { zone: string | null; row: number | null; col: number };
      return d.ops.move_element(describeElement(t, info), describeCell(t, to.zone, to.row ?? 0, to.col));
    }
    case 'remove_element':
      if (info.kind === undefined) return fallback;
      return d.ops.remove_element(describeElement(t, info));
    case 'assign_zone':
      if (info.code === undefined) return fallback;
      return info.zoneName ? d.ops.assign_zone(String(info.code), String(info.zoneName)) : d.ops.assign_zone_none(String(info.code));
    default:
      return fallback;
  }
}

/** The translated reason a stale or refused operation carries. */
function reasonText(t: Dictionary, reason: string): string {
  const known = t.account.errors as Record<string, string>;
  return known[reason] ?? known.invalid_request ?? reason;
}

// ---- The drawing editor ----

/** The tools of the drawing, as they travel in the query string; «postazione» creates a spot (D57). */
const toolIds = ['postazione', 'passerella-orizzontale', 'passerella-verticale', 'struttura', 'blocco-cabine', 'decorazione', 'gomma'] as const;
type Tool = (typeof toolIds)[number];

function readTool(value: string | undefined): Tool | null {
  return (toolIds as readonly string[]).includes(value ?? '') ? (value as Tool) : null;
}

interface StepStart {
  zone: SpotZone;
  row: number;
  col: number;
  token: string;
}

/** The first step of a two-step element, as the query string carries it: zone/row/column. */
function readStep(value: string | undefined): StepStart | null {
  const match = /^(riva|ombrelloni|monte)\/(\d{1,3})\/(\d{1,3})$/.exec(value ?? '');
  if (!match) return null;
  return { zone: match[1] as SpotZone, row: Number(match[2]), col: Number(match[3]), token: match[0] };
}

/** Geometry of the editor grid, in rem: wider lanes than the public map, so every target reaches 44 px. */
const drawCell = 4.25;
const drawGap = 0.5;
const drawLane = 2.75;

function drawOffset(col: number, lanes: ApiLayoutElement[]): number {
  const before = lanes.filter((lane) => (lane.colStart ?? 0) < col).length;
  return (col - 1) * (drawCell + drawGap) + before * (drawLane + drawGap);
}

function drawSpan(from: number, to: number, lanes: ApiLayoutElement[]): number {
  const inside = lanes.filter((lane) => (lane.colStart ?? 0) >= from && (lane.colStart ?? 0) < to).length;
  return (to - from + 1) * drawCell + (to - from) * drawGap + inside * (drawLane + drawGap);
}

/** Where an element sits, in words: used by the grid, the element list and the eraser. */
function placeOf(locale: Locale, element: ApiLayoutElement): string {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const zone = element.zone ? t.booking.zones[element.zone] : null;
  if (element.kind === 'walkway' && element.orientation === 'vertical') {
    return `${l.afterColumn(element.colStart ?? 1)}, ${zone ?? l.allZones}`;
  }
  if (element.kind === 'walkway') {
    const where = (element.rowAfter ?? 0) === 0 ? l.beforeRow1 : l.afterRow(element.rowAfter ?? 0);
    return `${zone}, ${where}, ${l.columnsRange(element.colStart ?? 1, element.colEnd ?? element.colStart ?? 1)}`;
  }
  // A decoration has no colEnd: its single cell reads as one column.
  return `${zone}, ${t.booking.row(element.rowNumber ?? 1).toLowerCase()}, ${l.columnsRange(element.colStart ?? 1, element.colEnd ?? element.colStart ?? 1)}`;
}

/** A drawn element inside the grid: a plain box normally, a remove button under the eraser. */
function DrawElement({ locale, element, eraser, className, style, children }: { locale: Locale; element: ApiLayoutElement; eraser: boolean; className: string; style?: CSSProperties; children: ReactNode }) {
  const l = getDictionary(locale, config.brandName).layout;
  if (!eraser) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <button type="submit" name="elemento" value={element.elementId} className={`${className} draw-erase`} style={style}>
      {children}
      <span className="visually-hidden">
        : {l.removeElement}, {placeOf(locale, element)}
      </span>
    </button>
  );
}

/** A row of interstice buttons for the horizontal walkway tool: one target per column. */
function InterticeRow({ locale, zone, rowAfter, cols, active, lanes }: { locale: Locale; zone: SpotZone; rowAfter: number; cols: number; active: boolean; lanes: ApiLayoutElement[] }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  return (
    <div className="draw-row draw-row--lane">
      <p className="draw-row__label" aria-hidden="true" />
      <ol className="draw-row__cells">
        {Array.from({ length: cols }, (_, index) => {
          const col = index + 1;
          const cell = active ? (
            <button type="submit" name="interstizio" value={`${zone}/${rowAfter}/${col}`} className="draw-cell draw-cell--lane">
              <span className="visually-hidden">{l.laneCell(t.booking.zones[zone], rowAfter, col)}</span>
            </button>
          ) : (
            <span className="draw-cell draw-cell--lane draw-cell--idle" aria-hidden="true" />
          );
          return (
            <li key={col}>
              {cell}
              {lanes.filter((lane) => (lane.colStart ?? 0) === col).map((lane) => (
                <span key={lane.elementId} className="draw-vlane draw-vlane--spacer" aria-hidden="true" />
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The editor grid: every free cell and every pertinent interstice is a submit button
 * carrying its coordinates; spots keep their cell (retired included), drawn elements show
 * up in place and become remove buttons under the eraser. One form, no scripts. With the
 * zone brush active (D59) the form posts the brush action instead and every SPOT becomes
 * the button; the cells also carry their coordinates as data for the progressive drag (D60).
 */
function DrawGrid({
  locale,
  spots,
  elements,
  seaSide,
  tool,
  step,
  label,
  types,
  brush,
  brushZoneName,
  veils,
  common,
}: {
  locale: Locale;
  spots: EditorSpot[];
  elements: ApiLayoutElement[];
  seaSide: SeaSide;
  tool: Tool | null;
  step: StepStart | null;
  label: string;
  types: ApiSpotType[];
  /** The active zone brush (D59): a zone id, «nessuna» to detach, or null when off. */
  brush: string | null;
  brushZoneName: string | null;
  veils: Map<string, CSSProperties>;
  common: Record<string, string>;
}) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const d = t.draft;
  const painting = brush !== null;
  const lanes = elements.filter((element) => element.kind === 'walkway' && element.orientation === 'vertical').sort((a, b) => (a.colStart ?? 0) - (b.colStart ?? 0));
  const size = planSize(spots, elements);
  // One growth column, so a new element can land right past the current drawing.
  const cols = Math.min(size.cols + 1, maxColumns);
  const rectTool = !painting && (tool === 'struttura' || tool === 'blocco-cabine');
  const decorating = !painting && tool === 'decorazione';
  const spotting = !painting && tool === 'postazione';
  const eraser = !painting && tool === 'gomma';
  const flip = seaSide === 'bottom' ? ' draw-rows--flip' : '';
  const zones = spotZones.filter((zone) => spots.some((spot) => spot.zone === zone) || elements.some((element) => element.zone === zone && element.orientation !== 'vertical'));

  const stepText = painting
    ? brush === 'nessuna'
      ? d.brushActiveNone
      : d.brushActive(brushZoneName ?? '')
    : tool === null
      ? l.toolNone
      : tool === 'gomma'
        ? l.stepEraser
        : tool === 'postazione'
          ? d.stepSpot
          : tool === 'decorazione'
            ? l.stepDecoration
            : tool === 'passerella-verticale'
              ? `${l.stepSingle} ${l.verticalAllZones}`
              : step
                ? l.stepEnd(`${t.booking.zones[step.zone]}, ${step.row}, ${step.col}`)
                : l.stepStart;

  return (
    <form method="post" action={painting ? '/azioni/spiaggia-pennello' : '/azioni/spiaggia-disegno'} className="draw">
      <Hidden values={{ ...common, ...(painting ? { pennello: brush } : { strumento: tool ?? '', ...(step ? { passo: step.token } : {}) }) }} />
      <p className="draw__step" role="status">
        {stepText}
        {painting ? (
          <>
            {' '}
            <Link href="?#disegno">{d.brushStop}</Link>
          </>
        ) : step && tool ? (
          <>
            {' '}
            <Link href={`?strumento=${tool}#disegno`}>{l.cancelStep}</Link>
          </>
        ) : null}
      </p>
      {spotting ? (
        <div className="field draw__label-field">
          <label htmlFor="disegno-tipo-postazione">{d.spotToolType}</label>
          <select id="disegno-tipo-postazione" name="tipo-postazione">
            {types.map((type) => (
              <option key={type.typeId} value={type.typeId}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {decorating ? (
        <div className="field draw__label-field">
          <label htmlFor="disegno-soggetto">{l.signField}</label>
          <select id="disegno-soggetto" name="segno" required>
            {decorationSigns.map((sign) => (
              <option key={sign} value={sign}>
                {t.booking.decorations[sign]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {rectTool || decorating ? (
        <div className="field draw__label-field">
          <label htmlFor="disegno-etichetta">{l.labelField}</label>
          <input id="disegno-etichetta" name="etichetta" maxLength={elementLabelMaxLength} autoComplete="off" defaultValue={label} aria-describedby="disegno-etichetta-aiuto" />
          <p className="field__hint" id="disegno-etichetta-aiuto">
            {l.labelHint}
          </p>
        </div>
      ) : null}
      {tool === 'passerella-verticale' && !painting ? (
        <div className="draw-strip" role="group" aria-label={l.verticalStrip}>
          <p className="draw-strip__label">{l.verticalStrip}</p>
          <ol className="draw-strip__cells">
            {Array.from({ length: cols }, (_, index) => (
              <li key={index + 1}>
                <button type="submit" name="colonna" value={index + 1} className="draw-cell draw-cell--vertical">
                  <span aria-hidden="true">{index + 1}·{index + 2}</span>
                  <span className="visually-hidden">{l.verticalCell(index + 1)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="draw-scroll" role="region" aria-label={l.gridLabel} tabIndex={0}>
        <div className={`draw-rows${flip}`}>
          <p className="plan__sea">
            <span className="plan__sea-label">{t.booking.planSea}</span>
          </p>
          {zones.map((zone) => {
            const inZone = spots.filter((spot) => spot.zone === zone);
            const rects = elements.filter((element) => element.zone === zone && (element.kind === 'structure' || element.kind === 'cabin_block' || element.kind === 'decoration'));
            const walkways = elements.filter((element) => element.zone === zone && element.kind === 'walkway' && element.orientation === 'horizontal');
            const rows = [...new Set([...inZone.map((spot) => spot.rowNumber), ...rects.map((rect) => rect.rowNumber ?? 1)])].sort((a, b) => a - b);
            const horizontalActive = (rowAfter: number) =>
              !painting && tool === 'passerella-orizzontale' && (step === null || (step.zone === zone && step.row === rowAfter));
            return (
              <section className="draw-zone" key={zone} aria-label={t.booking.zones[zone]}>
                <p className="plan-zone__label">
                  <strong>{t.booking.zones[zone]}</strong>
                </p>
                <div className={`draw-zone__rows${flip ? ' draw-rows--flip' : ''}`}>
                  {tool === 'passerella-orizzontale' && !painting ? (
                    <InterticeRow locale={locale} zone={zone} rowAfter={0} cols={cols} active={horizontalActive(0)} lanes={lanes} />
                  ) : null}
                  {walkways.filter((lane) => (lane.rowAfter ?? 0) === 0).map((lane) => (
                    <DrawHorizontalLane key={lane.elementId} locale={locale} element={lane} lanes={lanes} eraser={eraser} />
                  ))}
                  {rows.map((row) => {
                    const bySpotCol = new Map(inZone.filter((spot) => spot.rowNumber === row).map((spot) => [spot.col, spot]));
                    const byRectStart = new Map(rects.filter((rect) => rect.rowNumber === row).map((rect) => [rect.colStart ?? 1, rect]));
                    const cellActive = decorating || spotting || (rectTool && (step === null || (step.zone === zone && step.row === row)));
                    const cells: ReactNode[] = [];
                    let col = 1;
                    while (col <= cols) {
                      const rect = byRectStart.get(col);
                      const spot = bySpotCol.get(col);
                      const last = rect ? (rect.colEnd ?? col) : col;
                      const cella = `${zone}/${row}/${col}`;
                      if (rect && rect.kind === 'decoration') {
                        cells.push(
                          <li key={`deco-${col}`}>
                            <DrawElement locale={locale} element={rect} eraser={eraser} className="draw-cell draw-deco">
                              {rect.sign ? <DecorationMark sign={rect.sign} /> : null}
                              <span className="visually-hidden">
                                {t.booking.decorationKind}: {rect.sign ? t.booking.decorations[rect.sign] : ''}
                                {rect.label ? `, ${rect.label}` : ''}
                              </span>
                              {rect.label ? (
                                <span className="draw-deco__label" aria-hidden="true">
                                  {rect.label}
                                </span>
                              ) : null}
                            </DrawElement>
                          </li>,
                        );
                      } else if (rect) {
                        cells.push(
                          <li key={`box-${col}`}>
                            <DrawElement
                              locale={locale}
                              element={rect}
                              eraser={eraser}
                              className={rect.kind === 'cabin_block' ? 'draw-box draw-box--cabins' : 'draw-box'}
                              style={{ width: `${drawSpan(col, last, lanes)}rem` }}
                            >
                              <span className="visually-hidden">{rect.kind === 'cabin_block' ? t.booking.cabinBlockKind : t.booking.structureKind}: </span>
                              {rect.label ?? (rect.kind === 'cabin_block' ? t.booking.cabinsBox : t.booking.structureKind)}
                            </DrawElement>
                          </li>,
                        );
                      } else if (spot) {
                        const veil = spot.namedZoneId ? veils.get(spot.namedZoneId) : undefined;
                        const veiled = veil ? ' draw-cell--velo' : '';
                        const content = (
                          <>
                            <SpotSymbol sign={spot.typeMark} state={manageArtState(spot)} />
                            <span className="draw-cell__code" aria-hidden="true">
                              {spot.code}
                            </span>
                          </>
                        );
                        cells.push(
                          <li key={`spot-${col}`}>
                            {painting ? (
                              <button
                                type="submit"
                                name="postazione"
                                value={spot.spotId}
                                className={`draw-cell draw-cell--spot draw-cell--pennello${veiled}`}
                                style={veil}
                                data-pf-spot={spot.spotId}
                                data-pf-cella={cella}
                              >
                                {content}
                                <span className="visually-hidden">{d.brushSpot(spot.code)}</span>
                              </button>
                            ) : (
                              <span className={`draw-cell draw-cell--spot${veiled}`} style={veil} data-pf-spot={spot.spotId} data-pf-code={spot.code} data-pf-cella={cella}>
                                {content}
                                <span className="visually-hidden">
                                  {l.cellTaken(t.booking.zones[zone], row, col, spot.code)}
                                  {spot.zoneName ? `. ${t.zone.badge(spot.zoneName)}` : ''}
                                </span>
                              </span>
                            )}
                          </li>,
                        );
                      } else {
                        cells.push(
                          <li key={`free-${col}`}>
                            {cellActive ? (
                              <button type="submit" name="cella" value={cella} className="draw-cell draw-cell--free" data-pf-cella={cella}>
                                <span className="visually-hidden">{l.cellFree(t.booking.zones[zone], row, col)}</span>
                              </button>
                            ) : (
                              <span className="draw-cell draw-cell--idle" aria-hidden="true" data-pf-cella={cella} />
                            )}
                          </li>,
                        );
                      }
                      for (const lane of lanes.filter((candidate) => (candidate.colStart ?? 0) === last)) {
                        cells.push(
                          <li key={`lane-${last}-${lane.elementId}`}>
                            <DrawElement locale={locale} element={lane} eraser={eraser} className="draw-vlane">
                              <span className="draw-vlane__label">{t.booking.walkway}</span>
                            </DrawElement>
                          </li>,
                        );
                      }
                      col = last + 1;
                    }
                    return (
                      <Fragment key={row}>
                        <div className="draw-row">
                          <p className="draw-row__label">{t.booking.row(row)}</p>
                          <ol className="draw-row__cells">{cells}</ol>
                        </div>
                        {tool === 'passerella-orizzontale' && !painting ? (
                          <InterticeRow locale={locale} zone={zone} rowAfter={row} cols={cols} active={horizontalActive(row)} lanes={lanes} />
                        ) : null}
                        {walkways.filter((lane) => (lane.rowAfter ?? 0) === row).map((lane) => (
                          <DrawHorizontalLane key={lane.elementId} locale={locale} element={lane} lanes={lanes} eraser={eraser} />
                        ))}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </form>
  );
}

/** An existing horizontal walkway in the editor grid, aligned to its columns. */
function DrawHorizontalLane({ locale, element, lanes, eraser }: { locale: Locale; element: ApiLayoutElement; lanes: ApiLayoutElement[]; eraser: boolean }) {
  const t = getDictionary(locale, config.brandName).booking;
  const from = element.colStart ?? 1;
  const to = element.colEnd ?? from;
  return (
    <div className="draw-row draw-row--lane">
      <p className="draw-row__label" aria-hidden="true" />
      <div className="draw-row__cells draw-row__cells--open">
        <DrawElement
          locale={locale}
          element={element}
          eraser={eraser}
          className="draw-hlane"
          style={{ marginInlineStart: `${drawOffset(from, lanes)}rem`, width: `${drawSpan(from, to, lanes)}rem` }}
        >
          <span className="plan-lane__label">
            {t.walkway}
            {element.label ? ` · ${element.label}` : ''}
          </span>
        </DrawElement>
      </div>
    </div>
  );
}

function ZoneSelect({ locale, id, allZones = false }: { locale: Locale; id: string; allZones?: boolean }) {
  const t = getDictionary(locale, config.brandName);
  return (
    <div className="field">
      <label htmlFor={id}>{t.layout.zone}</label>
      <select id={id} name="zone" required>
        {allZones ? <option value="tutte">{t.layout.allZonesOption}</option> : null}
        {spotZones.map((zone) => (
          <option key={zone} value={zone}>
            {t.booking.zones[zone]}
          </option>
        ))}
      </select>
    </div>
  );
}

function EquipmentFields({ locale, prefix, spot }: { locale: Locale; prefix: string; spot?: EditorSpot }) {
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

/** The spot type picker of "Add a row" and "Add a spot": the defaults of each type are written next to it. */
function TypeSelect({ locale, id, types }: { locale: Locale; id: string; types: ApiSpotType[] }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  return (
    <>
      <div className="field">
        <label htmlFor={id}>{l.spotType}</label>
        <select id={id} name="type" aria-describedby={`${id}-predefiniti`}>
          {types.map((type) => (
            <option key={type.typeId} value={type.typeId}>
              {type.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field__hint" id={`${id}-predefiniti`}>
        <p>{l.typeDefaultsTitle}:</p>
        <ul className="type-defaults">
          {types.map((type) => (
            <li key={type.typeId}>
              {type.name}: {t.booking.equipment(type.umbrellas, type.sunbeds).toLowerCase()}, {t.booking.guests(type.maxGuests).toLowerCase()},{' '}
              {type.defaultPriceCents === null ? l.noDefaultPrice : `${l.defaultPriceShort.toLowerCase()} ${formatMoney(type.defaultPriceCents, locale)}`}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * One spot of the planner: every form queues an operation on the draft (D57). A spot that
 * exists only in the draft has no contract and cannot be retired: those gestures need the
 * saved spot. The maintenance box (D56) travels with the edit form.
 */
function SpotEditor({ locale, spot, types, zones, common }: { locale: Locale; spot: EditorSpot; types: ApiSpotType[]; zones: ApiNamedZone[]; common: Record<string, string> }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const d = t.draft;
  const seasonal = labelledSeasonal(spot.rentalType);
  const htmlId = `postazione-${spot.spotId}`;
  return (
    <li className="layout-spot" id={htmlId} aria-labelledby={`${htmlId}-titolo`}>
      <p className="layout-spot__head" id={`${htmlId}-titolo`}>
        <strong>{t.booking.spot(spot.code)}</strong>
        <span className="badge">{spot.typeName}</span>
        {/* La zona con nome (D50), dove l'editor mostra la postazione. */}
        {spot.zoneName ? <span className="badge">{t.zone.badge(spot.zoneName)}</span> : null}
        {spot.retired ? <span className="badge">{l.retiredBadge}</span> : null}
        {spot.maintenance ? <span className="badge">{d.maintenanceBadge}</span> : null}
        {spot.draftOnly ? <span className="badge">{d.draftOnlyBadge}</span> : null}
      </p>
      {spot.draftOnly ? null : (
        <p className="layout-spot__contract">
          {spot.activeContract ? l.activeContract(formatPeriod(spot.activeContract.validFrom, spot.activeContract.validTo, locale)) : l.noContract}
        </p>
      )}
      {/* An annotation out of step with the contracts is allowed, but never silent. */}
      {!spot.draftOnly && seasonal && !spot.activeContract ? <p className="layout-warn">{l.warnLabelWithoutContract}</p> : null}
      {!spot.draftOnly && !seasonal && spot.activeContract ? <p className="layout-warn">{l.warnContractWithoutLabel}</p> : null}
      <form method="post" action="/azioni/spiaggia-modifica" className="form-row layout-spot__form">
        <Hidden values={{ ...common, spot: spot.spotId }} />
        <div className="field">
          <label htmlFor={`${htmlId}-codice`}>{l.code}</label>
          <input id={`${htmlId}-codice`} name="code" maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,9}" autoComplete="off" defaultValue={spot.code} required />
        </div>
        <EquipmentFields locale={locale} prefix={htmlId} spot={spot} />
        <RentalFields locale={locale} prefix={htmlId} rentalType={spot.rentalType} rentalNotes={spot.rentalNotes} />
        {/* La tendina della zona con nome (D50): «Nessuna zona» stacca la postazione. */}
        <div className="field">
          <label htmlFor={`${htmlId}-zona-nome`}>{t.zone.assignSpot}</label>
          <select id={`${htmlId}-zona-nome`} name="namedZone" defaultValue={spot.namedZoneId ?? ''}>
            <option value="">{t.zone.assignRowNone}</option>
            {zones.map((zone) => (
              <option key={zone.zoneId} value={zone.zoneId}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
        {/* La manutenzione (D56): non prenotabile finché dura, resta nel disegno. */}
        <div className="field">
          <label>
            <input type="checkbox" name="maintenance" value="yes" defaultChecked={spot.maintenance} /> {d.maintenanceField}
          </label>
        </div>
        <button className="button button--secondary button--small" type="submit">
          {l.saveSpot} <span className="visually-hidden">{spot.code}</span>
        </button>
      </form>
      <form method="post" action="/azioni/spiaggia-tipo" className="form-row layout-spot__type">
        <Hidden values={{ ...common, spot: spot.spotId }} />
        <div className="field">
          <label htmlFor={`${htmlId}-tipo-postazione`}>{l.spotType}</label>
          <select id={`${htmlId}-tipo-postazione`} name="type" defaultValue={spot.typeId} aria-describedby={`${htmlId}-tipo-nota`}>
            {types.map((type) => (
              <option key={type.typeId} value={type.typeId}>
                {type.name}
              </option>
            ))}
          </select>
          <p className="field__hint" id={`${htmlId}-tipo-nota`}>
            {l.changeTypeNote}
          </p>
        </div>
        <button className="button button--secondary button--small" type="submit">
          {l.changeType} <span className="visually-hidden">{spot.code}</span>
        </button>
      </form>
      <div className="layout-spot__actions">
        {spot.draftOnly ? null : (
          <form method="post" action="/azioni/spiaggia-ritiro" className="inline-form">
            <Hidden values={{ ...common, spot: spot.spotId, retired: spot.retired ? 'no' : 'yes' }} />
            <button className="button button--secondary button--small" type="submit">
              {spot.retired ? l.restore : l.retire} <span className="visually-hidden">{spot.code}</span>
            </button>
          </form>
        )}
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

/** One spot type of the club: its mark, its defaults and the forms to change or delete it. */
function TypeEditor({ locale, type, common }: { locale: Locale; type: ApiSpotType; common: Record<string, string> }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const htmlId = `tipo-${type.typeId}`;
  const euro = type.defaultPriceCents === null ? '' : (type.defaultPriceCents / 100).toFixed(2).replace('.', locale === 'it' ? ',' : '.');
  return (
    <li className="layout-spot" aria-labelledby={`${htmlId}-titolo`}>
      <p className="layout-spot__head" id={`${htmlId}-titolo`}>
        <SpotMark mark={type.mark} status="free" />
        <strong>{type.name}</strong>
        {type.builtin ? <span className="badge">{l.builtinBadge}</span> : null}
      </p>
      <p className="layout-spot__contract">
        {t.booking.equipment(type.umbrellas, type.sunbeds)}. {t.booking.guests(type.maxGuests)}.{' '}
        {type.defaultPriceCents === null ? `${l.defaultPriceShort}: ${l.noDefaultPrice}.` : `${l.defaultPriceShort}: ${formatMoney(type.defaultPriceCents, locale)}.`}{' '}
        {l.typeSpots(type.spots)}.
      </p>
      <form method="post" action="/azioni/tipo-modifica" className="form-row">
        <Hidden values={{ ...common, type: type.typeId }} />
        {type.builtin ? null : (
          <>
            <div className="field">
              <label htmlFor={`${htmlId}-nome`}>{l.typeName}</label>
              <input id={`${htmlId}-nome`} name="name" maxLength={spotTypeNameMaxLength} defaultValue={type.name} autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor={`${htmlId}-segno`}>{l.typeMark}</label>
              <select id={`${htmlId}-segno`} name="mark" defaultValue={type.mark}>
                {spotMarks.map((mark) => (
                  <option key={mark} value={mark}>
                    {l.markNames[mark]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor={`${htmlId}-umbrellas`}>{l.umbrellas}</label>
          <input id={`${htmlId}-umbrellas`} name="umbrellas" type="number" inputMode="numeric" min={0} max={10} defaultValue={type.umbrellas} required />
        </div>
        <div className="field">
          <label htmlFor={`${htmlId}-sunbeds`}>{l.sunbeds}</label>
          <input id={`${htmlId}-sunbeds`} name="sunbeds" type="number" inputMode="numeric" min={0} max={10} defaultValue={type.sunbeds} required />
        </div>
        <div className="field">
          <label htmlFor={`${htmlId}-guests`}>{l.maxGuests}</label>
          <input id={`${htmlId}-guests`} name="guests" type="number" inputMode="numeric" min={1} max={20} defaultValue={type.maxGuests} required />
        </div>
        <div className="field">
          <label htmlFor={`${htmlId}-prezzo`}>{l.defaultPrice}</label>
          <input id={`${htmlId}-prezzo`} name="price" inputMode="decimal" autoComplete="off" defaultValue={euro} />
        </div>
        <button className="button button--secondary button--small" type="submit">
          {l.saveType} <span className="visually-hidden">{type.name}</span>
        </button>
      </form>
      {type.builtin ? (
        <p className="layout-spot__note">{l.builtinNote}</p>
      ) : type.spots > 0 ? (
        <p className="layout-spot__note">{l.deleteTypeNote}</p>
      ) : (
        <div className="layout-spot__actions">
          <form method="post" action="/azioni/tipo-elimina" className="inline-form">
            <Hidden values={{ ...common, type: type.typeId }} />
            <button className="button button--secondary button--small" type="submit">
              {l.deleteType} <span className="visually-hidden">{type.name}</span>
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

/** The numbered operations of the draft, in words; the culprit of a refused save stands out. */
function DraftOpsList({ locale, ops, culprit, culpritReason }: { locale: Locale; ops: ApiDraftOpView[]; culprit?: number; culpritReason?: string }) {
  const t = getDictionary(locale, config.brandName);
  const d = t.draft;
  return (
    <ol className="bozza-ops">
      {ops.map((view, index) => (
        <li key={index} className={index === culprit ? 'bozza-ops__colpevole' : undefined}>
          {opPhrase(t, view)}
          {view.stale ? (
            <>
              {' '}
              <strong>{d.stale(reasonText(t, String(view.description.reason ?? 'invalid_request')))}</strong>
            </>
          ) : null}
          {index === culprit ? (
            <>
              {' '}
              <strong>
                {d.failedBadge}
                {culpritReason ? `: ${reasonText(t, culpritReason)}` : ''}
              </strong>
            </>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** The confirmation summary of «Salva la spiaggia» (?salva=1): words first, one POST to apply. */
function SaveSummary({ locale, beachSlug, draft, common, query }: { locale: Locale; beachSlug: string; draft: ApiDraft; common: Record<string, string>; query: Query }) {
  const t = getDictionary(locale, config.brandName);
  const d = t.draft;
  const failedRaw = first(query.fallita);
  const culprit = failedRaw !== undefined && /^\d{1,3}$/.test(failedRaw) ? Number(failedRaw) : undefined;
  const reason = first(query.motivo);
  const hasStale = draft.ops.some((view) => view.stale);
  return (
    <div className="panel" id="riepilogo">
      <h2>{d.summaryTitle}</h2>
      <p className="prose">{d.summaryLead}</p>
      {culprit !== undefined || reason ? (
        <div className="alert" role="alert">
          <p>
            <strong>{d.failedTitle}</strong> {culprit !== undefined ? d.failedAt(culprit + 1) : ''} {reason ? reasonText(t, reason) : ''}
          </p>
          <p>{d.failedNothing}</p>
        </div>
      ) : null}
      {draft.ops.length === 0 ? (
        <p className="prose">{d.empty}</p>
      ) : (
        <>
          <DraftOpsList locale={locale} ops={draft.ops} culprit={culprit} culpritReason={reason} />
          {hasStale ? <p className="layout-warn">{reasonText(t, 'draft_apply_failed')}</p> : null}
          <form method="post" action="/azioni/spiaggia-bozza-salva" className="inline-form">
            <Hidden values={common} />
            <button className="button" type="submit">
              {d.confirm}
            </button>
          </form>
        </>
      )}
      <p>
        <Link className="button button--secondary" href={beachLayoutPath(locale, beachSlug)}>
          {d.backToPlanner}
        </Link>
      </p>
    </div>
  );
}

export async function BeachLayoutView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const d = t.draft;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'layout.gaps')) notFound();
  const editor = can(membership.role, 'layout.edit');
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const [layout, typesResult, zonesResult, draftResult] = await Promise.all([
    apiCall<ApiLayout>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token }),
    editor ? apiCall<{ types: ApiSpotType[] }>('GET', `/v1/manage/beaches/${beachSlug}/types`, { token }) : null,
    editor ? apiCall<{ zones: ApiNamedZone[] }>('GET', `/v1/manage/beaches/${beachSlug}/zones`, { token }) : null,
    // The draft with its preview (D57): the planner draws THIS, never the saved layout.
    editor ? apiCall<ApiDraft>('GET', `/v1/manage/beaches/${beachSlug}/layout/draft`, { token }) : null,
  ]);
  const draft = draftResult?.ok ? draftResult.data : null;
  const savedSpots = layout.ok ? layout.data.spots : [];
  // The saved contracts by spot: a spot born in the draft has none yet.
  const contractOf = new Map(savedSpots.map((spot) => [spot.spotId, spot.activeContract]));
  const spots: EditorSpot[] = draft
    ? draft.preview.spots.map((spot) => ({ ...spot, activeContract: contractOf.get(spot.spotId) ?? null }))
    : savedSpots.map((spot) => ({ ...spot, draftOnly: false }));
  const elements: ApiLayoutElement[] = draft ? draft.preview.elements : layout.ok ? layout.data.elements : [];
  const seaSide: SeaSide = draft ? draft.preview.seaSide : layout.ok ? layout.data.seaSide : 'top';
  const gaps = draft
    ? { shoreGapRows: draft.preview.shoreGapRows, landGapRows: draft.preview.landGapRows }
    : layout.ok
      ? { shoreGapRows: layout.data.shoreGapRows, landGapRows: layout.data.landGapRows }
      : { shoreGapRows: 1, landGapRows: 1 };
  const types = typesResult?.ok ? typesResult.data.types : [];
  const namedZones = zonesResult?.ok ? zonesResult.data.zones : [];
  const common = { lang: locale, beach: beachSlug };
  // Quick choices first, then every label already used in this club: the manager stays free to type anything.
  const rentalOptions = [...new Set<string>([...rentalTypeSuggestions, ...spots.flatMap((spot) => (spot.rentalType ? [spot.rentalType] : []))])];
  const hasRetired = spots.some((spot) => spot.retired);
  const hasMaintenance = spots.some((spot) => spot.maintenance);
  const size = planSize(spots, elements);
  const veils = zoneVeils(namedZones);
  const draftOps = draft?.ops ?? [];

  // The zone brush (D59) excludes the drawing tools: one form, one gesture at a time.
  const brushAsked = first(query.pennello);
  const brush = brushAsked === 'nessuna' || namedZones.some((zone) => zone.zoneId === brushAsked) ? (brushAsked as string) : null;
  const brushZoneName = brush && brush !== 'nessuna' ? (namedZones.find((zone) => zone.zoneId === brush)?.name ?? null) : null;
  const tool = brush ? null : readTool(first(query.strumento));
  const step = tool === 'passerella-orizzontale' || tool === 'struttura' || tool === 'blocco-cabine' ? readStep(first(query.passo)) : null;
  const stepLabel = (first(query.etichetta) ?? '').slice(0, elementLabelMaxLength);

  const shell = (children: ReactNode) => (
    <ManageShell
      locale={locale}
      beachSlug={beachSlug}
      beachName={membership.beachName}
      role={membership.role}
      active="beach"
      userName={me.user.name}
      alternatePath={beachLayoutPath(other, beachSlug)}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: l.short },
      ]}
    >
      {children}
    </ManageShell>
  );

  // «Salva la spiaggia» (D57): the summary view, reached by address, confirms or names the culprit.
  if (editor && draft && first(query.salva) === '1') {
    return shell(
      <>
        <PageHead title={l.title(membership.beachName)} lead={d.summaryLead} />
        <section className="section">
          <div className="container stack">
            <SaveSummary locale={locale} beachSlug={beachSlug} draft={draft} common={common} query={query} />
          </div>
        </section>
      </>,
    );
  }

  return shell(
    <>
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
              {/* ---- The draft panel (D57): the operations in words, undo, discard, save ---- */}
              {editor && draft ? (
                <div className="panel" id="bozza">
                  <h2>{d.panelTitle}</h2>
                  <p className="prose">{d.panelLead}</p>
                  {draftOps.length === 0 ? (
                    <p className="prose">{d.empty}</p>
                  ) : (
                    <>
                      <p>
                        <strong>{d.opsCount(draftOps.length)}</strong>
                        {draft.updatedAt ? ` · ${d.lastTouch(formatWhen(draft.updatedAt, locale))}` : ''}
                      </p>
                      <DraftOpsList locale={locale} ops={draftOps} />
                      <div className="layout-spot__actions">
                        <form method="post" action="/azioni/spiaggia-bozza-annulla" className="inline-form">
                          <Hidden values={common} />
                          <button className="button button--secondary" type="submit">
                            {d.undo}
                          </button>
                        </form>
                        <form method="post" action="/azioni/spiaggia-bozza-scarta" className="inline-form">
                          <Hidden values={common} />
                          <button className="button button--secondary" type="submit">
                            {d.discard}
                          </button>
                        </form>
                        <Link className="button" href={`${beachLayoutPath(locale, beachSlug)}?salva=1#riepilogo`}>
                          {d.save}
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              <div className="plan" role="group" aria-labelledby="anteprima-titolo" style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes } as CSSProperties}>
                <div className="plan__head">
                  <h2 id="anteprima-titolo">{l.previewTitle}</h2>
                  {/* L'anteprima della bozza (D57): etichetta chiara finché non si salva. */}
                  {editor && draft && draftOps.length > 0 ? (
                    <p>
                      <strong>{d.previewBadge}</strong> — {d.previewNote}
                    </p>
                  ) : (
                    <p>{l.previewLead}</p>
                  )}
                </div>
                {spots.length === 0 && elements.length === 0 ? (
                  <div className="empty">
                    <h3>{l.emptyTitle}</h3>
                    <p>{l.emptyText}</p>
                  </div>
                ) : (
                  <>
                    {hasRetired || hasMaintenance || spots.some((spot) => spot.typeMark !== 'umbrella') ? (
                      <ul className="plan-legend" aria-label={t.booking.legendTitle}>
                        <MarkLegendItems locale={locale} marks={spots.map((spot) => spot.typeMark)} />
                        {hasRetired ? (
                          <li>
                            <SpotMark mark="umbrella" status="unavailable" />
                            {l.retiredBadge}
                          </li>
                        ) : null}
                        {hasMaintenance ? (
                          <li>
                            <SpotSymbol sign="umbrella" state="maintenance" size={44} />
                            {d.maintenanceBadge}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                    <PlanCanvas
                      locale={locale}
                      gaps={gaps}
                      seaSide={seaSide}
                      elements={elements}
                      spots={spots}
                      idPrefix="anteprima"
                      renderSpot={(spot) => {
                        const veil = spot.namedZoneId ? veils.get(spot.namedZoneId) : undefined;
                        return (
                          <li>
                            <span
                              className={`plan-spot${spot.retired ? ' plan-spot--taken' : ''}${veil ? ' plan-spot--velo' : ''}`}
                              style={veil}
                            >
                              <SpotSymbol sign={spot.typeMark} state={manageArtState(spot)} umbrellas={spot.umbrellas} sunbeds={spot.sunbeds} />
                              <span className="plan-spot__code" aria-hidden="true">
                                {spot.code}
                              </span>
                              <span className="visually-hidden">
                                {t.booking.mapSpot(spot.typeName, spot.code, spot.retired ? t.booking.retiredMark : spot.maintenance ? d.maintenanceBadge : t.booking.status.free)}.{' '}
                                {spot.zoneName ? `${t.zone.badge(spot.zoneName)}. ` : ''}
                                {t.booking.equipment(spot.umbrellas, spot.sunbeds)}. {t.booking.guests(spot.maxGuests)}
                              </span>
                            </span>
                          </li>
                        );
                      }}
                    />
                  </>
                )}
              </div>

              {editor ? (
                <div className="panel" id="disegno">
                  <h2>{l.drawTitle}</h2>
                  <p className="prose">{l.drawLead}</p>
                  <SectionNotice locale={locale} query={query} okKey="dok" errKey="derr" />
                  <h3>{l.seaSideTitle}</h3>
                  <p className="prose">{l.seaSideLead}</p>
                  <form method="post" action="/azioni/spiaggia-lato" className="form-row">
                    <Hidden values={common} />
                    <fieldset className="checks">
                      <legend className="visually-hidden">{l.seaSideTitle}</legend>
                      <label>
                        <input type="radio" name="side" value="top" defaultChecked={seaSide === 'top'} /> {l.seaTop}
                      </label>
                      <label>
                        <input type="radio" name="side" value="bottom" defaultChecked={seaSide === 'bottom'} /> {l.seaBottom}
                      </label>
                    </fieldset>
                    <button className="button button--secondary" type="submit">
                      {l.saveSeaSide}
                    </button>
                  </form>
                  <h3>{l.toolsTitle}</h3>
                  <ul className="draw-tools">
                    {toolIds.map((id) => (
                      <li key={id}>
                        <Link
                          className={tool === id ? 'button button--small' : 'button button--secondary button--small'}
                          href={`?strumento=${id}#disegno`}
                          aria-current={tool === id ? 'true' : undefined}
                        >
                          {l.tools[id]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {/* Il pennello di zona (D59): scelta la zona, ogni tocco su una postazione accoda l'assegnazione. */}
                  <h3>{d.brushTitle}</h3>
                  <p className="prose">{d.brushLead}</p>
                  {namedZones.length > 0 ? (
                    <form method="get" action={beachLayoutPath(locale, beachSlug)} className="form-row">
                      <div className="field">
                        <label htmlFor="pennello-zona">{d.brushField}</label>
                        <select id="pennello-zona" name="pennello" defaultValue={brush ?? ''}>
                          {namedZones.map((zone) => (
                            <option key={zone.zoneId} value={zone.zoneId}>
                              {zone.name}
                            </option>
                          ))}
                          <option value="nessuna">{d.brushNone}</option>
                        </select>
                      </div>
                      <button className="button button--secondary" type="submit">
                        {d.brushStart}
                      </button>
                    </form>
                  ) : (
                    <p className="prose">{t.zone.manageLead}</p>
                  )}
                  <DrawGrid
                    locale={locale}
                    spots={spots}
                    elements={elements}
                    seaSide={seaSide}
                    tool={tool}
                    step={step}
                    label={stepLabel}
                    types={types}
                    brush={brush}
                    brushZoneName={brushZoneName}
                    veils={veils}
                    common={common}
                  />
                  <h3>{l.coordTitle}</h3>
                  <p className="prose">{l.coordLead}</p>
                  <form method="post" action="/azioni/spiaggia-disegno-modulo" className="form-row">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="modulo-elemento">{l.elementKind}</label>
                      <select id="modulo-elemento" name="kind" required>
                        <option value="passerella-orizzontale">{l.tools['passerella-orizzontale']}</option>
                        <option value="passerella-verticale">{l.tools['passerella-verticale']}</option>
                        <option value="struttura">{l.tools.struttura}</option>
                        <option value="blocco-cabine">{l.tools['blocco-cabine']}</option>
                        <option value="decorazione">{l.tools.decorazione}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="modulo-soggetto">{l.signField}</label>
                      <select id="modulo-soggetto" name="sign" aria-describedby="modulo-soggetto-aiuto">
                        {decorationSigns.map((sign) => (
                          <option key={sign} value={sign}>
                            {t.booking.decorations[sign]}
                          </option>
                        ))}
                      </select>
                      <p className="field__hint" id="modulo-soggetto-aiuto">
                        {l.signHint}
                      </p>
                    </div>
                    <ZoneSelect locale={locale} id="modulo-zona" allZones />
                    <div className="field">
                      <label htmlFor="modulo-fila">{l.rowAfterField}</label>
                      <input id="modulo-fila" name="row" type="number" inputMode="numeric" min={0} max={200} required />
                    </div>
                    <div className="field">
                      <label htmlFor="modulo-da">{l.colFrom}</label>
                      <input id="modulo-da" name="from" type="number" inputMode="numeric" min={1} max={maxColumns} required />
                    </div>
                    <div className="field">
                      <label htmlFor="modulo-a">{l.colTo}</label>
                      <input id="modulo-a" name="to" type="number" inputMode="numeric" min={1} max={maxColumns} />
                    </div>
                    <div className="field">
                      <label htmlFor="modulo-etichetta">{l.labelField}</label>
                      <input id="modulo-etichetta" name="label" maxLength={elementLabelMaxLength} autoComplete="off" aria-describedby="modulo-etichetta-aiuto" />
                      <p className="field__hint" id="modulo-etichetta-aiuto">
                        {l.labelHint}
                      </p>
                    </div>
                    <button className="button button--secondary" type="submit">
                      {l.draw}
                    </button>
                  </form>
                  <h3>{l.elementsTitle}</h3>
                  {elements.length === 0 ? (
                    <p className="prose">{l.elementsEmpty}</p>
                  ) : (
                    <ul className="layout-spots">
                      {elements.map((element) => (
                        <li className="layout-spot layout-spot--element" key={element.elementId}>
                          <p className="layout-spot__head">
                            <strong>{l.elementKinds[element.kind]}</strong>
                            {element.sign ? <span className="badge">{t.booking.decorations[element.sign]}</span> : null}
                            {element.label ? <span className="badge">{element.label}</span> : null}
                            {(element as ApiLayoutElement & { draftOnly?: boolean }).draftOnly ? <span className="badge">{d.draftOnlyBadge}</span> : null}
                          </p>
                          <p className="layout-spot__contract">{placeOf(locale, element)}</p>
                          {/* Lo spostamento della scenografia (D58): un'operazione di bozza come le altre. */}
                          <form method="post" action="/azioni/spiaggia-elemento-sposta" className="form-row">
                            <Hidden values={{ ...common, elemento: element.elementId }} />
                            <div className="field">
                              <label htmlFor={`elemento-${element.elementId}-zona`}>{l.zone}</label>
                              <select
                                id={`elemento-${element.elementId}-zona`}
                                name="zone"
                                defaultValue={element.zone ?? 'tutte'}
                              >
                                <option value="tutte">{l.allZonesOption}</option>
                                {spotZones.map((zone) => (
                                  <option key={zone} value={zone}>
                                    {t.booking.zones[zone]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`elemento-${element.elementId}-fila`}>{l.rowAfterField}</label>
                              <input
                                id={`elemento-${element.elementId}-fila`}
                                name="row"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={200}
                                defaultValue={element.rowNumber ?? element.rowAfter ?? 0}
                                required
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`elemento-${element.elementId}-colonna`}>{d.moveColField}</label>
                              <input
                                id={`elemento-${element.elementId}-colonna`}
                                name="col"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={maxColumns}
                                defaultValue={element.colStart ?? 1}
                                required
                              />
                            </div>
                            <button className="button button--secondary button--small" type="submit">
                              {d.moveSubmit}{' '}
                              <span className="visually-hidden">
                                {l.elementKinds[element.kind]}, {placeOf(locale, element)}
                              </span>
                            </button>
                          </form>
                          <form method="post" action="/azioni/spiaggia-elemento-rimuovi" className="inline-form">
                            <Hidden values={{ ...common, elemento: element.elementId, ...(tool ? { strumento: tool } : {}) }} />
                            <button className="button button--secondary button--small" type="submit">
                              {l.removeElement}{' '}
                              <span className="visually-hidden">
                                {l.elementKinds[element.kind]}, {placeOf(locale, element)}
                              </span>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {/* ---- Lo spostamento (D60): il modulo che vale per tutti; il drag lo compila e lo invia ---- */}
              {editor && spots.length > 0 ? (
                <div className="panel" id="sposta">
                  <h2>{d.moveTitle}</h2>
                  <p className="prose">{d.moveLead}</p>
                  <p className="field__hint">{d.dragHint}</p>
                  <form method="post" action="/azioni/spiaggia-sposta" className="form-row" id="modulo-sposta">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="sposta-postazione">{d.moveSpotField}</label>
                      <select id="sposta-postazione" name="spot" required>
                        {spots.map((spot) => (
                          <option key={spot.spotId} value={spot.spotId}>
                            {spot.code} — {t.booking.zones[spot.zone]}, {spot.rowNumber}/{spot.col}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="sposta-zona">{d.moveZoneField}</label>
                      <select id="sposta-zona" name="zone" required>
                        {spotZones.map((zone) => (
                          <option key={zone} value={zone}>
                            {t.booking.zones[zone]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="sposta-fila">{d.moveRowField}</label>
                      <input id="sposta-fila" name="row" type="number" inputMode="numeric" min={1} max={200} required />
                    </div>
                    <div className="field">
                      <label htmlFor="sposta-colonna">{d.moveColField}</label>
                      <input id="sposta-colonna" name="col" type="number" inputMode="numeric" min={1} max={maxColumns} required />
                    </div>
                    <button className="button button--secondary" type="submit">
                      {d.moveSubmit}
                    </button>
                  </form>
                </div>
              ) : null}

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

                  {/* Zone con nome (D50): crea, rinomina ed elimina; l'assegnazione passa dal
                      pennello (D59), dalla postazione e dal gesto per fila, qui sotto. */}
                  <div className="panel" id="zone">
                    <h2>{t.zone.manageTitle}</h2>
                    <p className="prose">{t.zone.manageLead}</p>
                    <SectionNotice locale={locale} query={query} okKey="zok" errKey="zerr" />
                    {namedZones.length > 0 ? (
                      <ul className="layout-spots">
                        {namedZones.map((zone) => (
                          <li className="layout-spot" key={zone.zoneId} aria-labelledby={`zona-${zone.zoneId}-titolo`}>
                            <p className="layout-spot__head" id={`zona-${zone.zoneId}-titolo`}>
                              <strong>{t.zone.badge(zone.name)}</strong>
                              <span className="badge">{t.zone.spots(zone.spots)}</span>
                            </p>
                            <form method="post" action="/azioni/zona-rinomina" className="form-row">
                              <Hidden values={{ ...common, zona: zone.zoneId }} />
                              <div className="field">
                                <label htmlFor={`zona-${zone.zoneId}-nome`}>{t.zone.nameField}</label>
                                <input
                                  id={`zona-${zone.zoneId}-nome`}
                                  name="name"
                                  minLength={zoneNameMinLength}
                                  maxLength={zoneNameMaxLength}
                                  defaultValue={zone.name}
                                  autoComplete="off"
                                  required
                                />
                              </div>
                              <button className="button button--secondary button--small" type="submit">
                                {t.zone.rename} <span className="visually-hidden">{zone.name}</span>
                              </button>
                            </form>
                            <div className="layout-spot__actions">
                              <form method="post" action="/azioni/zona-elimina" className="inline-form">
                                <Hidden values={{ ...common, zona: zone.zoneId }} />
                                <button className="button button--secondary button--small" type="submit">
                                  {t.zone.delete} <span className="visually-hidden">{zone.name}</span>
                                </button>
                              </form>
                            </div>
                            {/* L'avvertenza sta PRIMA del tasto nell'ordine di lettura della carta: le postazioni non spariscono. */}
                            <p className="layout-spot__note">{t.zone.deleteWarning}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <h3>{t.zone.create}</h3>
                    <form method="post" action="/azioni/zona-crea" className="form-row">
                      <Hidden values={common} />
                      <div className="field">
                        <label htmlFor="zona-nuova-nome">{t.zone.nameField}</label>
                        <input
                          id="zona-nuova-nome"
                          name="name"
                          minLength={zoneNameMinLength}
                          maxLength={zoneNameMaxLength}
                          autoComplete="off"
                          required
                          aria-describedby="zona-nuova-aiuto"
                        />
                        <p className="field__hint" id="zona-nuova-aiuto">{t.zone.nameWarning}</p>
                      </div>
                      <button className="button button--secondary" type="submit">{t.zone.create}</button>
                    </form>
                    <p className="field__hint">{t.zone.limit}</p>
                  </div>

                  <div className="panel" id="tipi">
                    <h2>{l.typesTitle}</h2>
                    <p className="prose">{l.typesLead}</p>
                    <SectionNotice locale={locale} query={query} okKey="tok" errKey="terr" />
                    <ul className="layout-spots">
                      {types.map((type) => (
                        <TypeEditor key={type.typeId} locale={locale} type={type} common={common} />
                      ))}
                    </ul>
                    <h3>{l.addTypeTitle}</h3>
                    <form method="post" action="/azioni/tipo-crea" className="form-row">
                      <Hidden values={common} />
                      <div className="field">
                        <label htmlFor="nuovo-tipo-nome">{l.typeName}</label>
                        <input id="nuovo-tipo-nome" name="name" maxLength={spotTypeNameMaxLength} autoComplete="off" required />
                      </div>
                      <div className="field">
                        <label htmlFor="nuovo-tipo-segno">{l.typeMark}</label>
                        <select id="nuovo-tipo-segno" name="mark" required>
                          {spotMarks.map((mark) => (
                            <option key={mark} value={mark}>
                              {l.markNames[mark]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="nuovo-tipo-umbrellas">{l.umbrellas}</label>
                        <input id="nuovo-tipo-umbrellas" name="umbrellas" type="number" inputMode="numeric" min={0} max={10} required />
                      </div>
                      <div className="field">
                        <label htmlFor="nuovo-tipo-sunbeds">{l.sunbeds}</label>
                        <input id="nuovo-tipo-sunbeds" name="sunbeds" type="number" inputMode="numeric" min={0} max={10} required />
                      </div>
                      <div className="field">
                        <label htmlFor="nuovo-tipo-guests">{l.maxGuests}</label>
                        <input id="nuovo-tipo-guests" name="guests" type="number" inputMode="numeric" min={1} max={20} required />
                      </div>
                      <div className="field">
                        <label htmlFor="nuovo-tipo-prezzo">{l.defaultPrice}</label>
                        <input id="nuovo-tipo-prezzo" name="price" inputMode="decimal" autoComplete="off" />
                      </div>
                      <button className="button button--secondary" type="submit">
                        {l.addType}
                      </button>
                    </form>
                  </div>

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
                      <TypeSelect locale={locale} id="fila-tipo" types={types} />
                      <EquipmentFields locale={locale} prefix="fila" />
                      <p className="field__hint">{l.typeDefaultsHint}</p>
                      <button className="button button--secondary" type="submit">
                        {l.addRow}
                      </button>
                    </form>
                  </div>

                  {/* Bulk generation of rows (spec §4, D34): one prefix, progressive numbering — as ONE draft op. */}
                  <div className="panel" id="aggiungi-file">
                    <h2>{l.addRowsTitle}</h2>
                    <p className="prose">{l.addRowsLead}</p>
                    <form method="post" action="/azioni/spiaggia-file" className="form-row">
                      <Hidden values={common} />
                      <ZoneSelect locale={locale} id="file-zona" />
                      <div className="field">
                        <label htmlFor="file-prefisso">{l.prefix}</label>
                        <input id="file-prefisso" name="prefix" maxLength={4} pattern="[A-Za-z]{1,4}" autoComplete="off" required />
                      </div>
                      <div className="field">
                        <label htmlFor="file-quante">{l.rowsCount}</label>
                        <input id="file-quante" name="rows" type="number" inputMode="numeric" min={1} max={10} required />
                      </div>
                      <div className="field">
                        <label htmlFor="file-per-fila">{l.perRowCount}</label>
                        <input id="file-per-fila" name="perRow" type="number" inputMode="numeric" min={1} max={50} required />
                      </div>
                      <TypeSelect locale={locale} id="file-tipo" types={types} />
                      <EquipmentFields locale={locale} prefix="file" />
                      <p className="field__hint">{l.typeDefaultsHint}</p>
                      <button className="button button--secondary" type="submit">
                        {l.addRows}
                      </button>
                    </form>
                  </div>

                  {/* The single spot in a chosen cell (D57): zone, row and column name the cell. */}
                  <div className="panel" id="aggiungi-postazione">
                    <h2>{l.addSpotTitle}</h2>
                    <p className="prose">{d.stepSpot}</p>
                    <form method="post" action="/azioni/spiaggia-postazione" className="form-row">
                      <Hidden values={common} />
                      <ZoneSelect locale={locale} id="postazione-zona" />
                      <div className="field">
                        <label htmlFor="postazione-fila">{d.moveRowField}</label>
                        <input id="postazione-fila" name="row" type="number" inputMode="numeric" min={1} max={200} required />
                      </div>
                      <div className="field">
                        <label htmlFor="postazione-colonna">{d.moveColField}</label>
                        <input id="postazione-colonna" name="col" type="number" inputMode="numeric" min={1} max={maxColumns} required />
                      </div>
                      <div className="field">
                        <label htmlFor="postazione-codice">{d.codeOptional}</label>
                        <input id="postazione-codice" name="code" maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,9}" autoComplete="off" />
                      </div>
                      <TypeSelect locale={locale} id="postazione-tipo" types={types} />
                      <EquipmentFields locale={locale} prefix="postazione" />
                      <p className="field__hint">{l.typeDefaultsHint}</p>
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
                            {/* Il gesto per fila delle zone con nome (D50), accanto all'affitto per fila. */}
                            <form method="post" action="/azioni/zona-fila" className="form-row layout-row__rental">
                              <Hidden values={{ ...common, zone, row: String(row) }} />
                              <p className="layout-row__lead">
                                <strong>{t.zone.assignRow}</strong>
                              </p>
                              <div className="field">
                                <label htmlFor={`zona-fila-${zone}-${row}`}>{t.zone.assignSpot}</label>
                                <select
                                  id={`zona-fila-${zone}-${row}`}
                                  name="namedZone"
                                  defaultValue={inRow.every((entry) => entry.namedZoneId === inRow[0]?.namedZoneId) ? (inRow[0]?.namedZoneId ?? '') : ''}
                                >
                                  <option value="">{t.zone.assignRowNone}</option>
                                  {namedZones.map((named) => (
                                    <option key={named.zoneId} value={named.zoneId}>
                                      {named.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button className="button button--secondary button--small" type="submit">
                                {l.applyRow}{' '}
                                <span className="visually-hidden">
                                  {t.zone.manageTitle}: {t.booking.zones[zone]}, {t.booking.row(row)}
                                </span>
                              </button>
                            </form>
                            <ul className="layout-spots">
                              {inRow.map((spot) => (
                                <SpotEditor key={spot.spotId} locale={locale} spot={spot} types={types} zones={namedZones} common={common} />
                              ))}
                            </ul>
                          </section>
                        )),
                      )}
                    </div>
                  ) : null}

                  {/* Il trascinamento progressivo (D60): vanilla, statico, solo su questa pagina.
                      Senza JavaScript tutto funziona identico via modulo. */}
                  <script src="/pianificatore.js" defer />
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>,
  );
}
