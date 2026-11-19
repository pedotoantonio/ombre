import type { ReactElement, ReactNode } from 'react';
import type { AnyDecorationSign, LayoutElementKind } from '@ombre/shared';

// Il linguaggio grafico «beach-art» (D55/D56): la famiglia unica di SVG originali
// della spiaggia illustrata. Vista dall'alto, contorni morbidi, palette pastello dai
// gettoni Solar & Fresh (le tinte derivate vivono in @ombre/ui/beach-art.css).
// Componenti presentazionali resi dal server: nessun JavaScript al cliente, nessun
// id SVG (niente pattern, clipPath o <use>), tutto deterministico. I soggetti dei
// riferimenti del committente dettano i temi, mai i disegni: ogni segno è vettoriale
// originale. I testi arrivano sempre da fuori: qui dentro non ci sono chiavi i18n.

/* ------------------------------------------------------------------ */
/* Stati (D56): cinque del gestionale e quattro del pubblico.          */
/* ------------------------------------------------------------------ */

export const spotArtStates = [
  'available',
  'booked',
  'occupied',
  'seasonal',
  'maintenance',
  'unavailable',
  'shared',
  'selected',
  'suggested',
] as const;
export type SpotArtState = (typeof spotArtStates)[number];

/* ------------------------------------------------------------------ */
/* Geometria deterministica: spicchi, stelle e onde precalcolati.      */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [cx + r * Math.cos(deg * DEG), cy + r * Math.sin(deg * DEG)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Uno spicchio di tela: fetta di torta con l'orlo esterno ad arco. */
function wedgePath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x0, y0] = polar(cx, cy, r, fromDeg).map(round2) as [number, number];
  const [x1, y1] = polar(cx, cy, r, toDeg).map(round2) as [number, number];
  return `M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}Z`;
}

/** Le cuciture radiali della tela, otto raggi. */
function seamsPath(cx: number, cy: number, r: number, count: number, offset: number): string {
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const [x, y] = polar(cx, cy, r, offset + (360 / count) * i).map(round2) as [number, number];
    d += `M${cx} ${cy}L${x} ${y}`;
  }
  return d;
}

/** La stella a cinque punte del distintivo «proposta». */
function starPath(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? rOut : rIn;
    const [x, y] = polar(cx, cy, r, -90 + 36 * i).map(round2) as [number, number];
    pts.push(`${x} ${y}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Un'onda dolce che attraversa la fascia: mezzi periodi alternati ogni 32 unità. */
function wavePath(width: number, y: number, amp: number): string {
  let d = `M0 ${y}`;
  const halves = Math.ceil(width / 32);
  for (let i = 0; i < halves; i += 1) {
    d += `q16 ${i % 2 === 0 ? -amp : amp} 32 0`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Il distintivo circolare colore+glifo (D56), riusabile da solo.      */
/* ------------------------------------------------------------------ */

// Glifi disegnati a mano in una cella 24×24, centro (12, 12). Mai emoji.
const BADGE_GLYPHS: Record<SpotArtState, ReactElement> = {
  available: <path className="beach-badge__glifo" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M7 12.6l3.4 3.4 6.6-7.6" />,
  booked: (
    <g className="beach-badge__glifo" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.8" y="7.4" width="10.4" height="9.6" rx="1.6" />
      <path d="M6.8 10.8h10.4M9.7 5.4v2.4M14.3 5.4v2.4" />
    </g>
  ),
  occupied: (
    <g className="beach-badge__glifo-pieno">
      <circle cx="12" cy="9.1" r="2.8" />
      <path d="M6.6 18.4c.6-3.7 2.7-5.5 5.4-5.5s4.8 1.8 5.4 5.5z" />
    </g>
  ),
  seasonal: (
    <g className="beach-badge__glifo" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.8" y="7.4" width="12.4" height="9.2" rx="1.5" />
      <path d="M5.8 10.6h12.4M8.2 13.8h4.2" />
    </g>
  ),
  maintenance: (
    <path
      className="beach-badge__glifo-pieno"
      d="M17.9 6.9a4.5 4.5 0 0 1-5.4 6.2l-4.2 4.2a2 2 0 0 1-2.8-2.8l4.2-4.2a4.5 4.5 0 0 1 6.2-5.4L13 7.8l.6 2.6 2.6.6z"
    />
  ),
  unavailable: <path className="beach-badge__glifo" strokeWidth="2.6" strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />,
  shared: (
    <g>
      <circle className="beach-badge__glifo" strokeWidth="2" cx="12" cy="12" r="5.6" />
      <path className="beach-badge__glifo-pieno" d="M12 6.4a5.6 5.6 0 0 1 0 11.2z" />
    </g>
  ),
  selected: (
    <path
      className="beach-badge__glifo-pieno"
      d="M12 17.8c-4-2.8-6.3-5-6.3-7.6 0-1.9 1.4-3.3 3.2-3.3 1.3 0 2.4.7 3.1 1.8.7-1.1 1.8-1.8 3.1-1.8 1.8 0 3.2 1.4 3.2 3.3 0 2.6-2.3 4.8-6.3 7.6z"
    />
  ),
  suggested: <path className="beach-badge__glifo-pieno" d={starPath(12, 12.6, 6.6, 2.7)} />,
};

/** Il tondo del distintivo con il suo glifo, da comporre dentro un SVG già aperto. */
function BadgeArt({ state }: { state: SpotArtState }): ReactElement {
  return (
    <g>
      <circle className="beach-badge__fondo" cx="12" cy="12" r="10.6" strokeWidth="2.2" />
      {BADGE_GLYPHS[state]}
    </g>
  );
}

/**
 * Distintivo circolare colore+glifo di uno stato (D56), riusabile da solo in
 * legende e tabelle. Decorativo: il nome dello stato viaggia come testo accanto.
 */
export function StateBadge({ state, size = 20 }: { state: SpotArtState; size?: number }): ReactElement {
  return (
    <svg
      className={`beach-art beach-badge beach-art--st-${state}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <BadgeArt state={state} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* I segni delle postazioni: cella 64×64, tela colorata dallo stato.   */
/* ------------------------------------------------------------------ */

/** Un lettino accostato, visto dall'alto: scocca, cuscino e telo. */
function SideBed({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g>
      <rect className="beach-spot__bianco" strokeWidth="1.6" x={x} y={y} width="9" height="20" rx="2.8" />
      <path className="beach-spot__tratto" strokeWidth="1.6" strokeLinecap="round" d={`M${x + 2.4} ${y + 4}h4.2`} />
      <rect className="beach-spot__spicchio" opacity=".35" x={x + 1.4} y={y + 8.5} width="6.2" height="5" rx="1.4" />
    </g>
  );
}

/** L'ombrellone a spicchi visto dall'alto, con i lettini accostati (fino a 2+2). */
function UmbrellaArt({ beds }: { beds: number }): ReactElement {
  const cx = 32;
  const cy = 31;
  const r = 19;
  const shown = Math.max(0, Math.min(4, beds));
  const slots: ReadonlyArray<[number, number]> = [
    [53, 8],
    [2, 8],
    [53, 36],
    [2, 36],
  ];
  return (
    <g>
      {slots.slice(0, shown).map(([x, y]) => (
        <SideBed key={`${x}-${y}`} x={x} y={y} />
      ))}
      <circle cx={cx + 1.6} cy={cy + 2.2} r={r} fill="var(--abisso)" opacity=".10" />
      <circle className="beach-spot__tela" strokeWidth="2" cx={cx} cy={cy} r={r} />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} className="beach-spot__spicchio" d={wedgePath(cx, cy, r - 1, a - 112.5, a - 67.5)} />
      ))}
      <path className="beach-spot__tratto" strokeWidth="1" opacity=".45" d={seamsPath(cx, cy, r - 1, 8, -112.5)} />
      <circle className="beach-spot__bianco" strokeWidth="1.6" cx={cx} cy={cy} r="2.6" />
    </g>
  );
}

/** Lettino singolo visto dall'alto: scocca, cuscino e fascia del telo. */
function SunbedArt(): ReactElement {
  return (
    <g>
      <rect x="25.6" y="9.8" width="16" height="46" rx="5" fill="var(--abisso)" opacity=".08" />
      <rect className="beach-spot__tela" strokeWidth="2" x="24" y="8" width="16" height="46" rx="5" />
      <path className="beach-spot__tratto" strokeWidth="2.2" strokeLinecap="round" d="M28.5 16h7" />
      <rect className="beach-spot__spicchio" opacity=".45" x="26.5" y="27" width="11" height="12" rx="2" />
      <path className="beach-spot__tratto" strokeWidth="1.2" opacity=".5" d="M26.5 46.5h11" />
    </g>
  );
}

/** Sdraio vista dall'alto: telaio stretto e stecche del telo. */
function DeckchairArt(): ReactElement {
  return (
    <g>
      <rect x="23.6" y="11.6" width="18" height="42" rx="4" fill="var(--abisso)" opacity=".08" />
      <rect className="beach-spot__tela" strokeWidth="2" x="22" y="10" width="18" height="42" rx="4" />
      <path className="beach-spot__tratto" strokeWidth="2" strokeLinecap="round" d="M26 18.5h10M26 26h10M26 33.5h10M26 41h10" />
      <path className="beach-spot__spicchio" d="M22 24h3.2v14H22ZM36.8 24H40v14h-3.2Z" opacity=".5" />
    </g>
  );
}

/** Gazebo rigido visto dall'alto: telo quadrato, cuciture in croce, quattro montanti. */
function GazeboArt(): ReactElement {
  return (
    <g>
      <rect x="12" y="12.4" width="42" height="42" rx="7" fill="var(--abisso)" opacity=".08" />
      <rect className="beach-spot__tela" strokeWidth="2" x="10" y="10" width="42" height="42" rx="7" />
      <path className="beach-spot__tratto" strokeWidth="1.2" opacity=".45" d="M31 31 14 14M31 31l17-17M31 31 14 48M31 31l17 17" />
      <path className="beach-spot__spicchio" d="M31 31 14 14q17-6.5 34 0z" opacity=".5" />
      <circle className="beach-spot__spicchio" cx="14.5" cy="14.5" r="2.4" />
      <circle className="beach-spot__spicchio" cx="47.5" cy="14.5" r="2.4" />
      <circle className="beach-spot__spicchio" cx="14.5" cy="47.5" r="2.4" />
      <circle className="beach-spot__spicchio" cx="47.5" cy="47.5" r="2.4" />
      <circle className="beach-spot__bianco" strokeWidth="1.6" cx="31" cy="31" r="2.6" />
    </g>
  );
}

/** Tenda vista dall'alto: telo quadrato dai fianchi morbidi e falda d'ingresso. */
function TentArt(): ReactElement {
  const cloth = 'M15 13C26 9 38 9 49 13C53 24 53 38 49 49C38 53 26 53 15 49C11 38 11 24 15 13Z';
  return (
    <g>
      <path d={cloth} transform="translate(2 2.4)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={cloth} />
      <path className="beach-spot__tratto" strokeWidth="1.2" opacity=".45" d="M32 31V11.2M32 31l18.4 15M32 31 13.6 46" />
      <path className="beach-spot__spicchio" opacity=".55" d="M32 31 22 50.6q10 2.6 20 0z" />
      <circle className="beach-spot__bianco" strokeWidth="1.6" cx="32" cy="31" r="2.6" />
    </g>
  );
}

/** Daybed visto dall'alto: isola larga con i due cuscini alla testa. */
function DaybedArt(): ReactElement {
  return (
    <g>
      <rect x="10" y="14.4" width="46" height="38" rx="8" fill="var(--abisso)" opacity=".08" />
      <rect className="beach-spot__tela" strokeWidth="2" x="8" y="12" width="46" height="38" rx="8" />
      <rect className="beach-spot__bianco" strokeWidth="1.6" x="13" y="17" width="16" height="9" rx="3" />
      <rect className="beach-spot__bianco" strokeWidth="1.6" x="33" y="17" width="16" height="9" rx="3" />
      <rect className="beach-spot__spicchio" opacity=".4" x="13" y="33" width="36" height="11" rx="3" />
    </g>
  );
}

/** Gazebo a telo visto dall'alto: vela gonfia, cuciture in croce. */
function CanopyArt(): ReactElement {
  const sail = 'M14 14C23.5 8.5 40.5 8.5 50 14C55.5 23.5 55.5 40.5 50 50C40.5 55.5 23.5 55.5 14 50C8.5 40.5 8.5 23.5 14 14Z';
  return (
    <g>
      <path d={sail} transform="translate(2 2.4)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={sail} />
      <path className="beach-spot__spicchio" opacity=".5" d="M32 32 14 14C23.5 8.5 40.5 8.5 50 14ZM32 32 14 50C23.5 55.5 40.5 55.5 50 50Z" />
      <path className="beach-spot__tratto" strokeWidth="1.2" opacity=".45" d="M32 10v44M10 32h44" />
      <circle className="beach-spot__bianco" strokeWidth="1.6" cx="32" cy="32" r="2.6" />
    </g>
  );
}

/** Canoa vista dall'alto: scafo appuntito, due banchi e la pagaia di traverso. */
function CanoeArt(): ReactElement {
  const hull = 'M32 4C39 13 39 51 32 60C25 51 25 13 32 4Z';
  return (
    <g>
      <path d={hull} transform="translate(1.6 2)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={hull} />
      <path className="beach-spot__spicchio" opacity=".4" d="M32 9.5C35.5 15 36.6 22 36.9 30H27.1C27.4 22 28.5 15 32 9.5Z" />
      <path className="beach-spot__tratto" strokeWidth="2" strokeLinecap="round" d="M27.6 24.5h8.8M27.6 40h8.8" />
      <path className="beach-spot__tratto" strokeWidth="2" strokeLinecap="round" d="M15 50 49 36" />
      <path className="beach-spot__spicchio" d="M12 54.5c-2.4-1.6-2.4-4 .4-5.4 2.8-1.4 4.8.2 4.6 3zM52 31.5c2.4 1.6 2.4 4-.4 5.4-2.8 1.4-4.8-.2-4.6-3z" />
    </g>
  );
}

// La tavola SUP vista dall'alto: muso a punta dolce, coda quadra appena stondata.
const SUP_BOARD = 'M32 4C37.5 9 39.5 16 39.5 26V52C39.5 55.5 36.5 58 32 58C27.5 58 24.5 55.5 24.5 52V26C24.5 16 26.5 9 32 4Z';

/** Tavola SUP vista dall'alto: muso a punta, linea di colmo e tappetino. */
function SupArt(): ReactElement {
  return (
    <g>
      <path d={SUP_BOARD} transform="translate(1.6 2)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={SUP_BOARD} />
      <path className="beach-spot__tratto" strokeWidth="1.6" strokeLinecap="round" d="M32 14v34" />
      <path className="beach-spot__spicchio" opacity=".45" d="M26.6 26c3.6-1.6 7.2-1.6 10.8 0v16c-3.6 1.6-7.2 1.6-10.8 0z" />
      <circle className="beach-spot__spicchio" cx="32" cy="52.5" r="1.8" />
    </g>
  );
}

/** Pedalò visto dall'alto: scafo largo, due sedili e la barra delle pale. */
function PedaloArt(): ReactElement {
  const hull = 'M12 18C12 9.5 20 6 32 6C44 6 52 9.5 52 18V44C52 52.5 44 58 32 58C20 58 12 52.5 12 44Z';
  return (
    <g>
      <path d={hull} transform="translate(1.6 2)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={hull} />
      <path className="beach-spot__tratto" strokeWidth="2" strokeLinecap="round" d="M16 20h32" />
      <rect className="beach-spot__spicchio" x="17.5" y="26" width="11" height="12" rx="3" opacity=".85" />
      <rect className="beach-spot__spicchio" x="35.5" y="26" width="11" height="12" rx="3" opacity=".85" />
      <path className="beach-spot__tratto" strokeWidth="1.4" opacity=".5" d="M20 46h24M20 50.5h24" />
    </g>
  );
}

/** Moto d'acqua vista dall'alto: goccia, manubrio e sella. */
function JetskiArt(): ReactElement {
  const hull = 'M32 5C42 11.5 45.5 21 45.5 31.5C45.5 42 40 58 32 58C24 58 18.5 42 18.5 31.5C18.5 21 22 11.5 32 5Z';
  return (
    <g>
      <path d={hull} transform="translate(1.6 2)" fill="var(--abisso)" opacity=".08" />
      <path className="beach-spot__tela" strokeWidth="2" d={hull} />
      <path className="beach-spot__tratto" strokeWidth="2.4" strokeLinecap="round" d="M22.5 17.5C28.5 14 35.5 14 41.5 17.5" />
      <rect className="beach-spot__spicchio" x="27" y="26" width="10" height="22" rx="4.6" opacity=".85" />
    </g>
  );
}

const spotArtComponents: Record<string, (props: { beds: number }) => ReactElement> = {
  umbrella: ({ beds }) => <UmbrellaArt beds={beds} />,
  sunbed: () => <SunbedArt />,
  deckchair: () => <DeckchairArt />,
  gazebo: () => <GazeboArt />,
  tent: () => <TentArt />,
  daybed: () => <DaybedArt />,
  canopy: () => <CanopyArt />,
  canoe: () => <CanoeArt />,
  sup: () => <SupArt />,
  pedalo: () => <PedaloArt />,
  jetski: () => <JetskiArt />,
};

export interface SpotSymbolProps {
  /** Chiave del repertorio dei segni (D35, `spotMarks`); sconosciuta o assente: la dotazione decide. */
  sign?: string;
  state: SpotArtState;
  /** Ombrelloni in dotazione: con 0 il segno di ripiego è il lettino. */
  umbrellas?: number;
  /** Lettini in dotazione: accostati all'ombrellone fino a 2+2, oltre un numeretto. */
  sunbeds?: number;
  /** Lato della cella in pixel: ~48–64 normale, ~28–32 compatta (niente etichette né conteggi). */
  size?: number;
  /** Anello di selezione del pianificatore, oltre allo stato. */
  selected?: boolean;
  /** Numero e zona della postazione, nel gettone in alto; decorativo: il nome accessibile viaggia fuori. */
  label?: string;
}

/**
 * Il simbolo di una postazione in cella quadrata 64×64: segno del repertorio con
 * la dotazione visibile, tela colorata dallo stato e distintivo d'angolo colore+glifo.
 * Decorativo (`aria-hidden`): il nome accessibile della postazione viaggia come testo
 * nel componente che lo usa, come nel resto del portale.
 */
export function SpotSymbol({ sign, state, umbrellas = 1, sunbeds = 0, size = 48, selected = false, label }: SpotSymbolProps): ReactElement {
  const compact = size < 40;
  const key = sign && spotArtComponents[sign] ? sign : umbrellas === 0 && sunbeds > 0 ? 'sunbed' : 'umbrella';
  const Art = spotArtComponents[key] ?? spotArtComponents.umbrella!;
  const bedsShown = key === 'umbrella' ? Math.min(4, sunbeds) : 0;
  const extra = key === 'umbrella' ? Math.max(0, sunbeds - 4) : 0;
  const badgeScale = compact ? 1.05 : 0.92;
  const badgeCenter = 64 - 12 * badgeScale - 0.4;
  const labelWidth = label ? Math.min(58, 11 + label.length * 6.9) : 0;
  return (
    <svg
      className={`beach-art beach-spot beach-art--st-${state}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <Art beds={bedsShown} />
      {selected ? <rect className="beach-spot__anello" strokeWidth="2.6" x="1.6" y="1.6" width="60.8" height="60.8" rx="10" /> : null}
      {!compact && extra > 0 ? (
        <g>
          <rect className="beach-spot__conto" x="2" y="48" width="18" height="13" rx="6.5" />
          <text className="beach-spot__conto-testo" x="11" y="58" fontSize="10" textAnchor="middle">
            +{extra}
          </text>
        </g>
      ) : null}
      {!compact && label ? (
        <g>
          <rect className="beach-spot__gettone" strokeWidth="1" x="2.5" y="2.5" width={labelWidth} height="15" rx="7.5" />
          <text className="beach-spot__etichetta" x={2.5 + labelWidth / 2} y="14" fontSize="11" textAnchor="middle">
            {label}
          </text>
        </g>
      ) : null}
      <g transform={`translate(${round2(badgeCenter - 12 * badgeScale)} ${round2(badgeCenter - 12 * badgeScale)}) scale(${badgeScale})`}>
        <BadgeArt state={state} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scenografia (D35 ridisegnato + D58): celle 64×64, anche multiple.   */
/* ------------------------------------------------------------------ */

/**
 * Chiavi della scenografia: le forme di `layout_element` (migrazioni 011/017) e
 * l'intero repertorio delle decorazioni, D35 più le chiavi nuove di D58
 * (`allDecorationSigns`). La passerella verticale è la stessa chiave `walkway`
 * disegnata su una colonna: qui la variante è `walkway_vertical`, solo grafica.
 */
export type ElementArtKind = LayoutElementKind | AnyDecorationSign | 'walkway_vertical';

/** Passerella orizzontale: assi di legno affiancate per tutta la larghezza. */
function WalkwayArt({ w }: { w: number }): ReactElement {
  const width = 64 * w;
  const planks: ReactElement[] = [];
  for (let x = 8; x < width - 4; x += 10) {
    planks.push(<path key={x} d={`M${x} 24v16`} />);
  }
  return (
    <g>
      <rect x="1" y="20" width={width - 2} height="24" rx="5" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <g stroke="var(--arte-legno-scuro)" strokeWidth="1.4" strokeLinecap="round" opacity=".55">
        {planks}
      </g>
    </g>
  );
}

/** Passerella verticale: le stesse assi su una colonna. */
function WalkwayVerticalArt(): ReactElement {
  const planks: ReactElement[] = [];
  for (let y = 8; y < 60; y += 10) {
    planks.push(<path key={y} d={`M24 ${y}h16`} />);
  }
  return (
    <g>
      <rect x="20" y="1" width="24" height="62" rx="5" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <g stroke="var(--arte-legno-scuro)" strokeWidth="1.4" strokeLinecap="round" opacity=".55">
        {planks}
      </g>
    </g>
  );
}

/** Blocco cabine: una fila di cabine con la tenda a righe sul fronte. */
function CabinBlockArt({ w }: { w: number }): ReactElement {
  const width = 64 * w;
  const count = Math.max(2, Math.round(width / 26));
  const cw = (width - 8) / count;
  const cabins: ReactElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = 4 + i * cw;
    cabins.push(
      <g key={i}>
        <rect x={round2(x + 1.5)} y="14" width={round2(cw - 3)} height="36" rx="3.5" fill="var(--carta)" stroke="var(--oceano)" strokeWidth="1.8" />
        <path d={`M${round2(x + 1.5 + (cw - 3) / 2)} 36v10`} stroke="var(--oceano)" strokeWidth="1.6" strokeLinecap="round" opacity=".6" />
        <rect x={round2(x + 4)} y="17" width={round2(cw - 8)} height="9" rx="2" fill="var(--spuma)" stroke="var(--oceano)" strokeWidth="1.2" />
        <path d={`M${round2(x + 7)} 17.8v7.4M${round2(x + 10.5)} 17.8v7.4M${round2(x + 14)} 17.8v7.4`} stroke="var(--oceano)" strokeWidth="1.2" opacity=".55" />
      </g>,
    );
  }
  return <g>{cabins}</g>;
}

/** Struttura etichettata: pianta con tettoia a righe; l'etichetta la scrive chi la usa. */
function StructureArt({ w, label }: { w: number; label?: string }): ReactElement {
  const width = 64 * w;
  const stripes: ReactElement[] = [];
  for (let x = 12; x < width - 8; x += 12) {
    stripes.push(<path key={x} d={`M${x} 11v8`} />);
  }
  return (
    <g>
      <rect x="4" y="10" width={width - 8} height="44" rx="6" fill="var(--spuma)" stroke="var(--oceano)" strokeWidth="2" />
      <rect x="4" y="10" width={width - 8} height="10" rx="5" fill="var(--carta)" stroke="var(--oceano)" strokeWidth="2" />
      <g stroke="var(--oceano)" strokeWidth="1.6" opacity=".55">{stripes}</g>
      {label ? (
        <text x={width / 2} y="41" fontSize="12" textAnchor="middle">
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Palma vista dall'alto: corona di foglie su due verdi e tronco al centro. */
function PalmArt(): ReactElement {
  const leaf = 'M32 32C27.5 23 27.3 14.5 32 7.5C36.7 14.5 36.5 23 32 32Z';
  return (
    <g>
      <g transform="translate(1.6 2)" fill="var(--abisso)" opacity=".08">
        {[10, 110, 215, 320].map((a) => (
          <path key={a} transform={`rotate(${a} 32 32)`} d={leaf} />
        ))}
      </g>
      {[10, 60, 110, 162, 215, 268, 320].map((a, i) => (
        <path
          key={a}
          transform={`rotate(${a} 32 32)`}
          d={leaf}
          fill={i % 2 === 0 ? 'var(--arte-verde)' : 'var(--arte-verde-scuro)'}
        />
      ))}
      <circle cx="32" cy="32" r="4.4" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.6" />
    </g>
  );
}

/** Vegetazione bassa: tre cespugli tondi che si toccano. */
function VegetationArt(): ReactElement {
  return (
    <g>
      <circle cx="24" cy="28" r="13" fill="var(--arte-verde-scuro)" />
      <circle cx="42" cy="32" r="11" fill="var(--arte-verde)" />
      <circle cx="29" cy="42" r="10" fill="var(--arte-verde)" />
      <g stroke="var(--spuma)" strokeWidth="1.6" strokeLinecap="round" opacity=".7">
        <path d="M20 24l-3-3M28 24l2.6-3M40 28l2.6-2.6M26 40l-3 2.6M33 44l3 2" />
      </g>
    </g>
  );
}

/** Duna: gobba di sabbia con i ciuffi d'erba. */
function DuneArt(): ReactElement {
  return (
    <g>
      <path
        d="M6 46C10 30 22 20 34 20C47 20 56 30 58 44C59 51 54 54 46 54H16C9 54 5 51 6 46Z"
        fill="var(--arte-sabbia)"
        stroke="var(--arte-legno-scuro)"
        strokeWidth="2"
      />
      <path d="M14 46c7-2 14-2 21 0M30 36c5-1.6 10-1.6 15 0" stroke="var(--arte-legno-scuro)" strokeWidth="1.4" strokeLinecap="round" opacity=".45" fill="none" />
      <g stroke="var(--arte-verde-scuro)" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M22 28V18.5M22 28l-6-6.5M22 28l6-6.5" />
        <path d="M44 32v-8M44 32l-5.2-5.6M44 32l5.2-5.6" />
      </g>
    </g>
  );
}

/** Chiosco bar visto dall'alto: tetto di paglia a spicchi e bancone ad arco. */
function KioskArt(): ReactElement {
  return (
    <g>
      <path d="M10 50C16 56 48 56 54 50" stroke="var(--oceano)" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="33.6" cy="30.4" r="22" fill="var(--abisso)" opacity=".08" />
      <circle cx="32" cy="28" r="22" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d={wedgePath(32, 28, 21, a - 112.5, a - 67.5)} fill="var(--arte-legno-scuro)" opacity=".35" />
      ))}
      <path d={seamsPath(32, 28, 21, 8, -112.5)} stroke="var(--arte-legno-scuro)" strokeWidth="1.2" opacity=".6" />
      <circle cx="32" cy="28" r="3.4" fill="var(--arte-legno-scuro)" />
    </g>
  );
}

/** Doccia: pedana di legno tonda, soffione e gocce. */
function ShowerArt(): ReactElement {
  return (
    <g>
      <circle cx="30" cy="36" r="20" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <path d="M14 30h32M12 38h36M15 46h30" stroke="var(--arte-legno-scuro)" strokeWidth="1.4" opacity=".55" />
      <circle cx="30" cy="36" r="3" fill="var(--arte-legno-scuro)" />
      <circle cx="47" cy="15" r="7" fill="var(--oceano)" />
      <circle cx="47" cy="15" r="3" fill="var(--spuma)" />
      <path d="M38.5 22.5 34 27M43 26v5M49.5 23.5l3 4.4" stroke="var(--mare-foto)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Torretta del bagnino vista dall'alto: pedana, tettuccio corallo a spicchi e scaletta. */
function TowerArt(): ReactElement {
  return (
    <g>
      <rect x="10" y="10" width="44" height="44" rx="6" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <path d="M26 54v8M38 54v8M26 58h12" stroke="var(--arte-legno-scuro)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="33.4" cy="30.4" r="17" fill="var(--abisso)" opacity=".1" />
      <circle cx="32" cy="29" r="17" fill="var(--carta)" stroke="var(--occupato-testo)" strokeWidth="2" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d={wedgePath(32, 29, 16, a - 112.5, a - 67.5)} fill="var(--occupato-testo)" />
      ))}
      <circle cx="32" cy="29" r="2.6" fill="var(--carta)" stroke="var(--occupato-testo)" strokeWidth="1.4" />
    </g>
  );
}

/** Bandiera: pennone con fiamma al vento e basamento. */
function FlagArt(): ReactElement {
  return (
    <g>
      <circle cx="22" cy="52" r="6" fill="var(--arte-sabbia-grana)" stroke="var(--arte-legno-scuro)" strokeWidth="1.6" />
      <path d="M22 52V8" stroke="var(--abisso)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M25 9C33 6 38 12 46 9C44 15 46 19 46 19C38 22 33 16 25 19Z" fill="var(--ambra)" stroke="var(--abisso)" strokeWidth="1.6" strokeLinejoin="round" />
    </g>
  );
}

/** Cestino: corpo a doghe con il coperchio sporgente. */
function BinArt(): ReactElement {
  return (
    <g>
      <rect x="18" y="16" width="28" height="36" rx="5" fill="var(--oceano)" />
      <path d="M26 24v20M32 24v20M38 24v20" stroke="var(--spuma)" strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
      <rect x="14" y="10" width="36" height="8" rx="4" fill="var(--abisso)" />
      <rect x="27" y="6.5" width="10" height="5" rx="2.5" fill="var(--abisso)" />
    </g>
  );
}

/** Campo da beach volley visto dall'alto: sabbia, linee e rete di mezzo. */
function VolleyArt({ w }: { w: number }): ReactElement {
  const width = 64 * Math.max(2, w);
  const mid = width / 2;
  return (
    <g>
      <rect x="3" y="8" width={width - 6} height="48" rx="4" fill="var(--arte-sabbia-grana)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <rect x="9" y="14" width={width - 18} height="36" fill="none" stroke="var(--carta)" strokeWidth="2.4" />
      <path d={`M${mid} 6v52`} stroke="var(--abisso)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4.5 3.4" />
      <circle cx={mid - 1} cy="7" r="2.6" fill="var(--abisso)" />
      <circle cx={mid - 1} cy="57" r="2.6" fill="var(--abisso)" />
      <circle cx={round2(mid - width / 4.6)} cy="38" r="4.6" fill="var(--ambra)" stroke="var(--abisso)" strokeWidth="1.4" />
    </g>
  );
}

/** Campo da bocce visto dall'alto: cornice di legno, terra battuta e boccia. */
function BocceArt({ w }: { w: number }): ReactElement {
  const width = 64 * Math.max(2, w);
  return (
    <g>
      <rect x="3" y="14" width={width - 6} height="36" rx="4" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <rect x="9" y="20" width={width - 18} height="24" rx="2" fill="var(--arte-sabbia)" />
      <circle cx={round2(width * 0.3)} cy="29" r="3.6" fill="var(--oceano)" />
      <circle cx={round2(width * 0.42)} cy="37" r="3.6" fill="var(--occupato-testo)" />
      <circle cx={round2(width * 0.62)} cy="31" r="3.6" fill="var(--oceano)" />
      <circle cx={round2(width * 0.56)} cy="34.5" r="1.8" fill="var(--ambra)" />
      <circle cx={round2(width * 0.74)} cy="38" r="3.6" fill="var(--occupato-testo)" />
    </g>
  );
}

/** Area giochi: gonfiabile con bordo corallo, vasca e scivolo. */
function PlaygroundArt(): ReactElement {
  return (
    <g>
      <rect x="6" y="8" width="52" height="48" rx="9" fill="var(--occupato)" stroke="var(--occupato-testo)" strokeWidth="2" />
      <rect x="14" y="16" width="36" height="32" rx="5" fill="var(--mare-foto)" />
      <rect x="26" y="12" width="12" height="24" rx="3" fill="var(--ambra)" stroke="var(--occupato-testo)" strokeWidth="1.6" />
      <path d="M29.5 16v16M34.5 16v16" stroke="var(--carta)" strokeWidth="1.6" opacity=".7" />
      <path d="M20 42q6 3 12 0t12 0" stroke="var(--carta)" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".8" />
    </g>
  );
}

/** Salvagente: anello corallo a settori con la sagola. */
function LifebuoyArt(): ReactElement {
  return (
    <g>
      <circle cx="32" cy="32" r="18" fill="none" stroke="var(--abisso)" strokeWidth="1.6" strokeDasharray="3 6" opacity=".5" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="var(--occupato-testo)" strokeWidth="10" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="var(--carta)" strokeWidth="10" strokeDasharray="11.78 11.78" strokeDashoffset="5.89" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="var(--abisso)" strokeWidth="1.4" opacity=".4" />
      <circle cx="32" cy="32" r="10" fill="none" stroke="var(--abisso)" strokeWidth="1.4" opacity=".4" />
    </g>
  );
}

/** Cartello: pannello su palo con le righe del testo. */
function SignArt(): ReactElement {
  return (
    <g>
      <path d="M32 36v18" stroke="var(--arte-legno-scuro)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="55" r="4.5" fill="var(--arte-sabbia-grana)" stroke="var(--arte-legno-scuro)" strokeWidth="1.4" />
      <rect x="10" y="10" width="44" height="26" rx="4" fill="var(--ambra)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <path d="M17 19h30M17 27h19" stroke="var(--carta)" strokeWidth="3.4" strokeLinecap="round" />
    </g>
  );
}

/** Amaca vista dall'alto: rete tesa tra due pali. */
function HammockArt(): ReactElement {
  return (
    <g>
      <circle cx="8" cy="32" r="5" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.8" />
      <circle cx="56" cy="32" r="5" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.8" />
      <path d="M12 32h5M47 32h5" stroke="var(--abisso)" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 32C21 22 43 22 47 32C43 42 21 42 17 32Z" fill="var(--spuma)" stroke="var(--abisso)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 25.5v13M32 24.4v15.2M40 25.5v13M21 28h22M20.5 36h23" stroke="var(--abisso)" strokeWidth="1.2" opacity=".5" fill="none" />
    </g>
  );
}

/** Altalena vista dall'alto: traversa e due sedili appesi. */
function SwingArt(): ReactElement {
  return (
    <g>
      <path d="M8 18h48" stroke="var(--arte-legno-scuro)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="10" cy="18" r="4" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.6" />
      <circle cx="54" cy="18" r="4" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.6" />
      <path d="M22 18v16M30 18v16M38 18v16M46 18v16" stroke="var(--abisso)" strokeWidth="1.8" opacity=".6" />
      <rect x="18" y="34" width="16" height="7" rx="3" fill="var(--oceano)" stroke="var(--abisso)" strokeWidth="1.4" />
      <rect x="34" y="34" width="16" height="7" rx="3" fill="var(--ambra)" stroke="var(--abisso)" strokeWidth="1.4" />
    </g>
  );
}

/** Grill visto dall'alto: braciere tondo con la griglia e i manici. */
function GrillArt(): ReactElement {
  return (
    <g>
      <path d="M10 32h-5M59 32h-5" stroke="var(--arte-legno-scuro)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="21" fill="var(--abisso)" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="var(--carta)" strokeWidth="1.6" opacity=".7" />
      <path d="M20 26h24M18.5 32h27M20 38h24M26 19.5v25M32 18v28M38 19.5v25" stroke="var(--carta)" strokeWidth="1.6" opacity=".7" />
    </g>
  );
}

/** Distributore d'acqua: colonnina con il boccione azzurro. */
function WaterArt(): ReactElement {
  return (
    <g>
      <rect x="22" y="22" width="20" height="34" rx="4" fill="var(--carta)" stroke="var(--abisso)" strokeWidth="2" />
      <rect x="26" y="34" width="12" height="8" rx="2" fill="var(--spuma)" stroke="var(--abisso)" strokeWidth="1.4" />
      <path d="M32 42v6" stroke="var(--mare-foto)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M25 22V16a7 7 0 0 1 14 0v6" fill="var(--mare-foto)" stroke="var(--abisso)" strokeWidth="2" />
      <path d="M29 13.5a4 4 0 0 1 3-2" stroke="var(--spuma)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Armadietti: blocco con quattro antine e lucchetti. */
function LockersArt(): ReactElement {
  return (
    <g>
      <rect x="10" y="12" width="44" height="40" rx="4" fill="var(--oceano)" stroke="var(--oceano-scuro)" strokeWidth="2" />
      <path d="M32 12v40M10 32h44" stroke="var(--oceano-scuro)" strokeWidth="2" />
      <path d="M14.5 17h7M37 17h7M14.5 37h7M37 37h7" stroke="var(--spuma)" strokeWidth="2.6" strokeLinecap="round" opacity=".75" />
      <circle cx="27" cy="26" r="1.8" fill="var(--ambra)" />
      <circle cx="49" cy="26" r="1.8" fill="var(--ambra)" />
      <circle cx="27" cy="46" r="1.8" fill="var(--ambra)" />
      <circle cx="49" cy="46" r="1.8" fill="var(--ambra)" />
    </g>
  );
}

/** Campo da gioco generico: prato con riga e cerchio di metà campo. */
function FieldArt({ w }: { w: number }): ReactElement {
  const width = 64 * Math.max(1, w);
  const mid = width / 2;
  return (
    <g>
      <rect x="3" y="10" width={width - 6} height="44" rx="5" fill="var(--arte-verde)" stroke="var(--arte-verde-scuro)" strokeWidth="2" />
      <rect x="8" y="15" width={width - 16} height="34" fill="none" stroke="var(--carta)" strokeWidth="2" opacity=".9" />
      <path d={`M${mid} 15v34`} stroke="var(--carta)" strokeWidth="2" opacity=".9" />
      <circle cx={mid} cy="32" r="7" fill="none" stroke="var(--carta)" strokeWidth="2" opacity=".9" />
    </g>
  );
}

/** Tavolo da ping pong visto dall'alto: piano blu, rete e racchette. */
function PingPongArt(): ReactElement {
  return (
    <g>
      <rect x="8" y="13" width="48" height="38" rx="3" fill="var(--oceano)" stroke="var(--oceano-scuro)" strokeWidth="2" />
      <path d="M8 32h48" stroke="var(--carta)" strokeWidth="1.8" opacity=".8" />
      <path d="M32 10v44" stroke="var(--abisso)" strokeWidth="3" />
      <circle cx="43" cy="22" r="3.6" fill="var(--occupato)" stroke="var(--abisso)" strokeWidth="1.2" />
      <path d="M43 25.6l2.6 4.4" stroke="var(--abisso)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="42" r="2.2" fill="var(--carta)" />
    </g>
  );
}

/** Tavolino visto dall'alto: piano di legno e quattro sedute. */
function TableArt(): ReactElement {
  return (
    <g>
      {[45, 135, 225, 315].map((a) => {
        const [x, y] = polar(32, 32, 21.5, a).map(round2) as [number, number];
        return <circle key={a} cx={x} cy={y} r="6" fill="var(--spuma)" stroke="var(--oceano)" strokeWidth="1.8" />;
      })}
      <circle cx="33.4" cy="33.6" r="15" fill="var(--abisso)" opacity=".08" />
      <circle cx="32" cy="32" r="15" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="2" />
      <path d="M22 24.5c6.5-3.5 13.5-3.5 20 0M20 32h24M22 39.5c6.5 3.5 13.5 3.5 20 0" stroke="var(--arte-legno-scuro)" strokeWidth="1.3" opacity=".5" fill="none" />
    </g>
  );
}

/** Pedalò parcheggiato, colori di scena (non è una postazione). */
function SceneryPedaloArt(): ReactElement {
  return (
    <g>
      <path d="M12 18C12 9.5 20 6 32 6C44 6 52 9.5 52 18V44C52 52.5 44 58 32 58C20 58 12 52.5 12 44Z" fill="var(--spuma)" stroke="var(--oceano)" strokeWidth="2" />
      <path d="M16 20h32" stroke="var(--oceano)" strokeWidth="2" strokeLinecap="round" />
      <rect x="17.5" y="26" width="11" height="12" rx="3" fill="var(--occupato)" stroke="var(--occupato-testo)" strokeWidth="1.4" />
      <rect x="35.5" y="26" width="11" height="12" rx="3" fill="var(--occupato)" stroke="var(--occupato-testo)" strokeWidth="1.4" />
      <path d="M20 46h24M20 50.5h24" stroke="var(--oceano)" strokeWidth="1.4" opacity=".5" />
    </g>
  );
}

/** Canoa a riposo, colori di scena. */
function SceneryCanoeArt(): ReactElement {
  return (
    <g>
      <path d="M32 4C39 13 39 51 32 60C25 51 25 13 32 4Z" fill="var(--occupato)" stroke="var(--occupato-testo)" strokeWidth="2" />
      <path d="M32 9.5C35.5 15 36.6 22 36.9 30H27.1C27.4 22 28.5 15 32 9.5Z" fill="var(--carta)" opacity=".55" />
      <path d="M27.6 24.5h8.8M27.6 40h8.8" stroke="var(--occupato-testo)" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 50 49 36" stroke="var(--arte-legno-scuro)" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 54.5c-2.4-1.6-2.4-4 .4-5.4 2.8-1.4 4.8.2 4.6 3zM52 31.5c2.4 1.6 2.4 4-.4 5.4-2.8 1.4-4.8-.2-4.6-3z" fill="var(--arte-legno)" stroke="var(--arte-legno-scuro)" strokeWidth="1.2" />
    </g>
  );
}

/** Tavola SUP a riposo, colori di scena. */
function ScenerySupArt(): ReactElement {
  return (
    <g>
      <path d={SUP_BOARD} fill="var(--spuma)" stroke="var(--mare-foto)" strokeWidth="2" />
      <path d="M32 14v34" stroke="var(--mare-foto)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M26.6 26c3.6-1.6 7.2-1.6 10.8 0v16c-3.6 1.6-7.2 1.6-10.8 0z" fill="var(--mare-foto)" opacity=".4" />
      <circle cx="32" cy="52.5" r="1.8" fill="var(--mare-foto)" />
    </g>
  );
}

const elementArtComponents: Record<string, (props: { w: number; label?: string }) => ReactElement> = {
  walkway: ({ w }) => <WalkwayArt w={w} />,
  walkway_vertical: () => <WalkwayVerticalArt />,
  cabin_block: ({ w }) => <CabinBlockArt w={w} />,
  structure: ({ w, label }) => <StructureArt w={w} label={label} />,
  decoration: () => <PalmArt />,
  palma: () => <PalmArt />,
  vegetazione: () => <VegetationArt />,
  duna: () => <DuneArt />,
  chiosco: () => <KioskArt />,
  doccia: () => <ShowerArt />,
  torretta: () => <TowerArt />,
  bandiera: () => <FlagArt />,
  cestino: () => <BinArt />,
  beachvolley: ({ w }) => <VolleyArt w={w} />,
  bocce: ({ w }) => <BocceArt w={w} />,
  giochi: () => <PlaygroundArt />,
  salvagente: () => <LifebuoyArt />,
  cartello: () => <SignArt />,
  amaca: () => <HammockArt />,
  altalena: () => <SwingArt />,
  grill: () => <GrillArt />,
  acqua: () => <WaterArt />,
  armadietti: () => <LockersArt />,
  campo: ({ w }) => <FieldArt w={w} />,
  pingpong: () => <PingPongArt />,
  tavolino: () => <TableArt />,
  pedalo: () => <SceneryPedaloArt />,
  canoa: () => <SceneryCanoeArt />,
  sup: () => <ScenerySupArt />,
};

/** Larghezza predefinita in celle di qualche soggetto largo. */
const elementDefaultWidth: Partial<Record<string, number>> = {
  beachvolley: 2,
  bocce: 2,
  campo: 2,
  cabin_block: 2,
};

export interface ElementSymbolProps {
  /** Chiave del repertorio: forma di `layout_element` o segno di `allDecorationSigns`. */
  kind: ElementArtKind;
  /** Nome accessibile e, per una struttura, scritta nel disegno. Testi da fuori. */
  label?: string;
  /** Larghezza in celle da 64: 1 se non indicata (2 per campi e blocco cabine). */
  w?: number;
}

/**
 * Un elemento della scenografia su una o più celle. Con `label` il simbolo ha nome
 * accessibile (`role="img"`); senza, è decorativo e il testo viaggia fuori.
 */
export function ElementSymbol({ kind, label, w }: ElementSymbolProps): ReactElement {
  const key = elementArtComponents[kind] ? kind : 'decoration';
  const Art = elementArtComponents[key] ?? elementArtComponents.decoration!;
  const cells = Math.max(1, Math.round(w ?? elementDefaultWidth[key] ?? 1));
  return (
    <svg
      className={`beach-art beach-element beach-element--${key}`}
      viewBox={`0 0 ${64 * cells} 64`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    >
      <Art w={cells} label={label} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* La fascia del mare: onde stilizzate, acqua bassa e linea di riva.   */
/* ------------------------------------------------------------------ */

/**
 * La fascia del mare sopra (o sotto) la planimetria: mare aperto con le onde,
 * acqua bassa, schiuma e il primo filo di sabbia bagnata. `width` è in celle da 64;
 * l'altezza vale 88 unità. Decorativa: il nome «Mare» viaggia come testo fuori.
 */
export function SeaBand({ width = 8 }: { width?: number }): ReactElement {
  const cells = Math.max(1, Math.round(width));
  const wpx = cells * 64;
  const crests: ReactElement[] = [];
  for (let i = 0; i < cells; i += 1) {
    const x = i * 64 + (i % 2 === 0 ? 10 : 26);
    const y = i % 3 === 0 ? 16 : i % 3 === 1 ? 30 : 22;
    crests.push(
      <path key={i} d={`M${x} ${y}q5.5-5 11 0t11 0`} stroke="var(--arte-neve)" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity=".75" />,
    );
  }
  return (
    <svg className="beach-art beach-sea" viewBox={`0 0 ${wpx} 88`} aria-hidden="true" focusable="false">
      <rect width={wpx} height="88" fill="var(--arte-mare)" />
      {crests}
      <path d={`${wavePath(wpx, 52, 7)}V88H0Z`} fill="var(--arte-mare-basso)" />
      <path d={wavePath(wpx, 52, 7)} stroke="var(--arte-neve)" strokeWidth="2.4" fill="none" opacity=".8" />
      <path d={`${wavePath(wpx, 74, 5)}V88H0Z`} fill="var(--arte-sabbia-riva)" />
      <path d={wavePath(wpx, 74, 5)} stroke="var(--arte-neve)" strokeWidth="4.5" fill="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* La legenda compatta (D56).                                          */
/* ------------------------------------------------------------------ */

export interface LegendItem {
  state: SpotArtState;
  /** Etichetta già tradotta: i testi arrivano da fuori. */
  label: string;
}

/**
 * Legenda compatta: righe distintivo+etichetta, identica nelle due lingue perché i
 * testi arrivano dal chiamante. Sta in piedi da sola o dentro un `<details>` al telefono.
 */
export function Legend({ items, title, compact = false }: { items: readonly LegendItem[]; title?: string; compact?: boolean }): ReactNode {
  return (
    <div className={compact ? 'beach-legend beach-legend--compact' : 'beach-legend'}>
      {title ? <p className="beach-legend__title">{title}</p> : null}
      <ul className="beach-legend__list">
        {items.map((item) => (
          <li key={`${item.state}-${item.label}`} className="beach-legend__row">
            <StateBadge state={item.state} size={compact ? 16 : 20} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
