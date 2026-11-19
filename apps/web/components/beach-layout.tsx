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
import { MarkLegendItems, PlanCanvas, planSize, SpotMark, zoneRows } from './beach';
import { DecorationMark } from './decorations';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';

// The "Spiaggia" page of the reserved area: the preview of the beach map with its zones on
// top, then the drawing editor (sea side, walkways, structures, cabin blocks), the zone
// distances, the spot types and the configuration forms. Everything works without JavaScript,
// like the rest of the area: the chosen tool lives in the query string and every grid cell is
// a submit button with its coordinates. The reception sees and uses the zone distances only.

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

/** The label "Stagionale" is an annotation: here it is read without regard for case. */
function labelledSeasonal(rentalType: string | null): boolean {
  return rentalType !== null && rentalType.trim().toLowerCase() === 'stagionale';
}

const rentalListId = 'tipi-affitto';

// ---- The drawing editor ----

/** The tools of the drawing, as they travel in the query string. */
const toolIds = ['passerella-orizzontale', 'passerella-verticale', 'struttura', 'blocco-cabine', 'decorazione', 'gomma'] as const;
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
 * up in place and become remove buttons under the eraser. One form, no scripts.
 */
function DrawGrid({
  locale,
  spots,
  elements,
  seaSide,
  tool,
  step,
  label,
  common,
}: {
  locale: Locale;
  spots: ApiLayoutSpot[];
  elements: ApiLayoutElement[];
  seaSide: SeaSide;
  tool: Tool | null;
  step: StepStart | null;
  label: string;
  common: Record<string, string>;
}) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const lanes = elements.filter((element) => element.kind === 'walkway' && element.orientation === 'vertical').sort((a, b) => (a.colStart ?? 0) - (b.colStart ?? 0));
  const size = planSize(spots, elements);
  // One growth column, so a new element can land right past the current drawing.
  const cols = Math.min(size.cols + 1, maxColumns);
  const rectTool = tool === 'struttura' || tool === 'blocco-cabine';
  const decorating = tool === 'decorazione';
  const eraser = tool === 'gomma';
  const flip = seaSide === 'bottom' ? ' draw-rows--flip' : '';
  const zones = spotZones.filter((zone) => spots.some((spot) => spot.zone === zone) || elements.some((element) => element.zone === zone && element.orientation !== 'vertical'));

  const stepText =
    tool === null
      ? l.toolNone
      : tool === 'gomma'
        ? l.stepEraser
        : tool === 'decorazione'
          ? l.stepDecoration
          : tool === 'passerella-verticale'
            ? `${l.stepSingle} ${l.verticalAllZones}`
            : step
              ? l.stepEnd(`${t.booking.zones[step.zone]}, ${step.row}, ${step.col}`)
              : l.stepStart;

  return (
    <form method="post" action="/azioni/spiaggia-disegno" className="draw">
      <Hidden values={{ ...common, strumento: tool ?? '', ...(step ? { passo: step.token } : {}) }} />
      <p className="draw__step" role="status">
        {stepText}
        {step && tool ? (
          <>
            {' '}
            <Link href={`?strumento=${tool}#disegno`}>{l.cancelStep}</Link>
          </>
        ) : null}
      </p>
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
      {tool === 'passerella-verticale' ? (
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
              tool === 'passerella-orizzontale' && (step === null || (step.zone === zone && step.row === rowAfter));
            return (
              <section className="draw-zone" key={zone} aria-label={t.booking.zones[zone]}>
                <p className="plan-zone__label">
                  <strong>{t.booking.zones[zone]}</strong>
                </p>
                <div className={`draw-zone__rows${flip ? ' draw-rows--flip' : ''}`}>
                  {tool === 'passerella-orizzontale' ? (
                    <InterticeRow locale={locale} zone={zone} rowAfter={0} cols={cols} active={horizontalActive(0)} lanes={lanes} />
                  ) : null}
                  {walkways.filter((lane) => (lane.rowAfter ?? 0) === 0).map((lane) => (
                    <DrawHorizontalLane key={lane.elementId} locale={locale} element={lane} lanes={lanes} eraser={eraser} />
                  ))}
                  {rows.map((row) => {
                    const bySpotCol = new Map(inZone.filter((spot) => spot.rowNumber === row).map((spot) => [spot.col, spot]));
                    const byRectStart = new Map(rects.filter((rect) => rect.rowNumber === row).map((rect) => [rect.colStart ?? 1, rect]));
                    const cellActive = decorating || (rectTool && (step === null || (step.zone === zone && step.row === row)));
                    const cells: ReactNode[] = [];
                    let col = 1;
                    while (col <= cols) {
                      const rect = byRectStart.get(col);
                      const spot = bySpotCol.get(col);
                      const last = rect ? (rect.colEnd ?? col) : col;
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
                        cells.push(
                          <li key={`spot-${col}`}>
                            <span className="draw-cell draw-cell--spot">
                              <SpotMark mark={spot.typeMark} status={spot.retired ? 'unavailable' : 'free'} />
                              <span className="draw-cell__code" aria-hidden="true">
                                {spot.code}
                              </span>
                              <span className="visually-hidden">{l.cellTaken(t.booking.zones[zone], row, col, spot.code)}</span>
                            </span>
                          </li>,
                        );
                      } else {
                        cells.push(
                          <li key={`free-${col}`}>
                            {cellActive ? (
                              <button type="submit" name="cella" value={`${zone}/${row}/${col}`} className="draw-cell draw-cell--free">
                                <span className="visually-hidden">{l.cellFree(t.booking.zones[zone], row, col)}</span>
                              </button>
                            ) : (
                              <span className="draw-cell draw-cell--idle" aria-hidden="true" />
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
                        {tool === 'passerella-orizzontale' ? (
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

function SpotEditor({ locale, spot, types, zones, common }: { locale: Locale; spot: ApiLayoutSpot; types: ApiSpotType[]; zones: ApiNamedZone[]; common: Record<string, string> }) {
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
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

export async function BeachLayoutView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const l = t.layout;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'layout.gaps')) notFound();
  const editor = can(membership.role, 'layout.edit');
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const [layout, typesResult, zonesResult] = await Promise.all([
    apiCall<ApiLayout>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token }),
    editor ? apiCall<{ types: ApiSpotType[] }>('GET', `/v1/manage/beaches/${beachSlug}/types`, { token }) : null,
    editor ? apiCall<{ zones: ApiNamedZone[] }>('GET', `/v1/manage/beaches/${beachSlug}/zones`, { token }) : null,
  ]);
  const spots = layout.ok ? layout.data.spots : [];
  const elements = layout.ok ? layout.data.elements : [];
  const seaSide: SeaSide = layout.ok ? layout.data.seaSide : 'top';
  const gaps = layout.ok ? { shoreGapRows: layout.data.shoreGapRows, landGapRows: layout.data.landGapRows } : { shoreGapRows: 1, landGapRows: 1 };
  const types = typesResult?.ok ? typesResult.data.types : [];
  const namedZones = zonesResult?.ok ? zonesResult.data.zones : [];
  const common = { lang: locale, beach: beachSlug };
  // Quick choices first, then every label already used in this club: the manager stays free to type anything.
  const rentalOptions = [...new Set<string>([...rentalTypeSuggestions, ...spots.flatMap((spot) => (spot.rentalType ? [spot.rentalType] : []))])];
  const hasRetired = spots.some((spot) => spot.retired);
  const size = planSize(spots, elements);

  const tool = readTool(first(query.strumento));
  const step = tool === 'passerella-orizzontale' || tool === 'struttura' || tool === 'blocco-cabine' ? readStep(first(query.passo)) : null;
  const stepLabel = (first(query.etichetta) ?? '').slice(0, elementLabelMaxLength);

  return (
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
              <div className="plan" role="group" aria-labelledby="anteprima-titolo" style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes } as CSSProperties}>
                <div className="plan__head">
                  <h2 id="anteprima-titolo">{l.previewTitle}</h2>
                  <p>{l.previewLead}</p>
                </div>
                {spots.length === 0 && elements.length === 0 ? (
                  <div className="empty">
                    <h3>{l.emptyTitle}</h3>
                    <p>{l.emptyText}</p>
                  </div>
                ) : (
                  <>
                    {hasRetired || spots.some((spot) => spot.typeMark !== 'umbrella') ? (
                      <ul className="plan-legend" aria-label={t.booking.legendTitle}>
                        <MarkLegendItems locale={locale} marks={spots.map((spot) => spot.typeMark)} />
                        {hasRetired ? (
                          <li>
                            <SpotMark mark="umbrella" status="unavailable" />
                            {l.retiredBadge}
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
                      renderSpot={(spot) => (
                        <li>
                          <span className={spot.retired ? 'plan-spot plan-spot--taken' : 'plan-spot'}>
                            <SpotMark mark={spot.typeMark} status={spot.retired ? 'unavailable' : 'free'} />
                            <span className="plan-spot__code" aria-hidden="true">
                              {spot.code}
                            </span>
                            <span className="visually-hidden">
                              {t.booking.mapSpot(spot.typeName, spot.code, spot.retired ? t.booking.retiredMark : t.booking.status.free)}.{' '}
                              {t.booking.equipment(spot.umbrellas, spot.sunbeds)}. {t.booking.guests(spot.maxGuests)}
                            </span>
                          </span>
                        </li>
                      )}
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
                  <DrawGrid locale={locale} spots={spots} elements={elements} seaSide={seaSide} tool={tool} step={step} label={stepLabel} common={common} />
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
                          </p>
                          <p className="layout-spot__contract">{placeOf(locale, element)}</p>
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

                  {/* Zone con nome (D50): crea, rinomina ed elimina; l'assegnazione passa dalla
                      postazione e dal gesto per fila, qui sotto tra le postazioni. */}
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

                  {/* Bulk generation of rows (spec §4, D34): one prefix, progressive numbering. */}
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
                      <TypeSelect locale={locale} id="postazione-tipo" types={types} />
                      <EquipmentFields locale={locale} prefix="postazione" />
                      <p className="field__hint">{l.typeDefaultsHint}</p>
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
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
    </ManageShell>
  );
}
