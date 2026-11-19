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
