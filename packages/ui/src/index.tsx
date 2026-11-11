import type { ReactElement } from 'react';

// Brand palette (docs/progetto-grafico.md). The artwork below uses these colours only, plus white.
const OCEAN = '#005f73';
const SEAFOAM = '#e0f2f1';
const AMBER = '#ee9b00';
const ABYSS = '#1d3557';
const IVORY = '#f8f9fa';
const WHITE = '#fff';

interface LogoProps {
  /** `onDark` when the symbol sits on a dark surface. */
  tone?: 'color' | 'onDark';
}

// Symbol on a 240 grid: an eight-panel beach umbrella seen from above and, below it, a crescent that is
// wave and smile at once. Master files, construction and usage rules: docs/marchio.
const SYMBOL_CANOPY =
  'M134 98.8L205.7 98.8Q189.3 124.5 182.8 154.3L132 103.5A14.3 14.3 0 0 0 134 98.8zM127.7 107.8L178.5 158.6Q148.7 165.1 123 181.5L123 109.8A14.3 14.3 0 0 0 127.7 107.8zM117 109.8L117 181.5Q91.3 165.1 61.5 158.6L112.3 107.8A14.3 14.3 0 0 0 117 109.8zM108 103.5L57.2 154.3Q50.7 124.5 34.3 98.8L106 98.8A14.3 14.3 0 0 0 108 103.5zM106 92.8L34.3 92.8Q50.7 67.1 57.2 37.3L108 88.1A14.3 14.3 0 0 0 106 92.8zM112.3 83.8L61.5 33Q91.3 26.5 117 10.1L117 81.8A14.3 14.3 0 0 0 112.3 83.8zM123 81.8L123 10.1Q148.7 26.5 178.5 33L127.7 83.8A14.3 14.3 0 0 0 123 81.8zM132 88.1L182.8 37.3Q189.3 67.1 205.7 92.8L134 92.8A14.3 14.3 0 0 0 132 88.1z';
const SYMBOL_SMILE =
  'M30.5 160.5A92.4 92.4 0 0 0 209.5 160.5A5.5 5.5 0 0 0 199.8 155.8A101.2 101.2 0 0 1 40.2 155.8A5.5 5.5 0 0 0 30.5 160.5z';

/** Brand symbol. Decorative: the brand name is always written next to it. */
export function Logo({ tone = 'color' }: LogoProps): ReactElement {
  const canopy = tone === 'onDark' ? IVORY : OCEAN;
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <path fill={canopy} d={SYMBOL_CANOPY} />
      <circle cx="120" cy="95.8" r="8.2" fill={AMBER} />
      <path fill={AMBER} d={SYMBOL_SMILE} />
    </svg>
  );
}

// Shared pieces of the illustrations, drawn around the origin: an umbrella of radius 24 with the same
// construction as the symbol, the two sunbeds beside its pole, a small boat with its wake.
const UMBRELLA_CANOPY =
  'M3.5 0.9L24 0.9Q19.4 8 17.6 16.3L3.1 1.8A3.6 3.6 0 0 0 3.5 0.9zM1.8 3.1L16.3 17.6Q8 19.4 0.9 24L0.9 3.5A3.6 3.6 0 0 0 1.8 3.1zM-0.9 3.5L-0.9 24Q-8 19.4 -16.3 17.6L-1.8 3.1A3.6 3.6 0 0 0 -0.9 3.5zM-3.1 1.8L-17.6 16.3Q-19.4 8 -24 0.9L-3.5 0.9A3.6 3.6 0 0 0 -3.1 1.8zM-3.5 -0.9L-24 -0.9Q-19.4 -8 -17.6 -16.3L-3.1 -1.8A3.6 3.6 0 0 0 -3.5 -0.9zM-1.8 -3.1L-16.3 -17.6Q-8 -19.4 -0.9 -24L-0.9 -3.5A3.6 3.6 0 0 0 -1.8 -3.1zM0.9 -3.5L0.9 -24Q8 -19.4 16.3 -17.6L1.8 -3.1A3.6 3.6 0 0 0 0.9 -3.5zM3.1 -1.8L17.6 -16.3Q19.4 -8 24 -0.9L3.5 -0.9A3.6 3.6 0 0 0 3.1 -1.8z';
const UMBRELLA_SUNBEDS =
  'M-22 5h12v29a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3zM10 5h12v29a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z';

type UmbrellaKind = 't' | 'a' | 'b';
type UmbrellaSpot = readonly [x: number, y: number, kind: UmbrellaKind];

const UMBRELLA_COLORS: Record<UmbrellaKind, { canopy: string; hub: string }> = {
  t: { canopy: OCEAN, hub: AMBER },
  a: { canopy: AMBER, hub: OCEAN },
  b: { canopy: ABYSS, hub: AMBER },
};

/** One umbrella with shadow and sunbeds, to be referenced with `<use>`. Ids must be unique in the page. */
function UmbrellaDef({ id, kind }: { id: string; kind: UmbrellaKind }): ReactElement {
  const { canopy, hub } = UMBRELLA_COLORS[kind];
  return (
    <g id={id}>
      <circle cx="7" cy="9" r="24" fill={OCEAN} fillOpacity=".16" />
      <path fill={WHITE} stroke={OCEAN} strokeOpacity=".35" d={UMBRELLA_SUNBEDS} />
      <circle r="21" fill={WHITE} />
      <path fill={canopy} d={UMBRELLA_CANOPY} />
      <circle r="2.2" fill={hub} />
    </g>
  );
}

function Boat({ transform }: { transform: string }): ReactElement {
  return (
    <g transform={transform}>
      <path fill="none" stroke={WHITE} strokeWidth="3" strokeLinecap="round" strokeOpacity=".7" d="M40 96l44 4M40 114l44-6" />
      <path fill={WHITE} d="M86 104c8-12 34-15 62 0-28 15-54 12-62 0z" />
      <path fill={AMBER} d="M98 104c5-5 16-7 28-4v8c-12 3-23 1-28-4z" />
    </g>
  );
}

const BEACH_SHORE =
  'M0 150C17.5 153.7 70 166.3 105 172C140 177.7 175 183.7 210 184C245 184.3 280 179.3 315 174C350 168.7 402.5 155.7 420 152';
const BEACH_SHALLOW =
  'M0 106C17.5 109.7 70 122.3 105 128C140 133.7 175 139.7 210 140C245 140.3 280 135.3 315 130C350 124.7 402.5 111.7 420 108';
const BEACH_SURF =
  'M-10 130.4C-4 130.2 14 127.6 26 128.9C38 130.2 50 134.7 62 138.1C74 141.5 86 146.3 98 149.4C110 152.6 122 154.4 134 156.8C146 159.2 158 162.7 170 163.9C182 165.1 194 165.2 206 164.1C218 162.9 230 159.2 242 157.1C254 154.9 266 151.9 278 151.1C290 150.3 302 152.1 314 152.1C326 152.1 338 152.9 350 151.1C362 149.3 374 144.3 386 141.1C398 137.9 416 133.3 422 131.8';
const BEACH_UMBRELLAS: readonly UmbrellaSpot[] = [
  [88, 276, 't'], [214, 256, 'a'], [338, 280, 't'],
];

/** Beach seen from above: sea, a boat, the shoreline and three umbrellas with their sunbeds. Decorative. */
export function BeachScene(): ReactElement {
  return (
    <svg viewBox="0 0 420 360" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="scena-bordo">
          <rect width="420" height="360" rx="28" />
        </clipPath>
        <UmbrellaDef id="scena-t" kind="t" />
        <UmbrellaDef id="scena-a" kind="a" />
      </defs>
      <g clipPath="url(#scena-bordo)">
        <rect width="420" height="360" fill={OCEAN} />
        <path fill={SEAFOAM} d={`${BEACH_SHALLOW}V360H0z`} />
        <path
          fill="none"
          stroke={WHITE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeOpacity=".7"
          d="M36 44q9-8 18 0t18 0t18 0M130 82q9-8 18 0t18 0t18 0M214 30q9-8 18 0t18 0t18 0"
        />
        <Boat transform="translate(206 -42) rotate(-20 118 104)" />
        <path fill="none" stroke={WHITE} strokeWidth="4" d={BEACH_SURF} />
        <path fill={IVORY} d={`${BEACH_SHORE}V360H0z`} />
        <path fill="none" stroke={WHITE} strokeWidth="10" d={BEACH_SHORE} />
        <circle cx="147" cy="219" r="9" fill={OCEAN} fillOpacity=".16" />
        <circle cx="144" cy="215" r="9" fill={AMBER} />
        <circle cx="144" cy="215" r="3.5" fill={WHITE} />
        <g transform="rotate(14 292 214)">
          <rect x="283" y="198" width="18" height="32" rx="2" fill={SEAFOAM} />
          <path stroke={OCEAN} strokeWidth="3" d="M283 206h18M283 222h18" />
        </g>
        {BEACH_UMBRELLAS.map(([x, y, kind]) => (
          <use key={`${x}-${y}`} href={`#scena-${kind}`} transform={`translate(${x} ${y}) scale(1.8)`} />
        ))}
      </g>
    </svg>
  );
}

const COAST_SHORE =
  'M0 250C30 257.7 120 276.7 180 296C240 315.3 300 344.3 360 366C420 387.7 480 411.7 540 426C600 440.3 660 450 720 452C780 454 840 447.7 900 438C960 428.3 1020 411.3 1080 394C1140 376.7 1200 352.7 1260 334C1320 315.3 1410 290.7 1440 282';
const COAST_SURF =
  'M-20 224.9C-9.2 225.1 23.3 222.4 45 226.2C66.7 230 88.3 240.9 110 247.7C131.7 254.5 153.3 259.8 175 267C196.7 274.3 218.3 280.8 240 291.1C261.7 301.5 283.3 320.9 305 329.3C326.7 337.6 348.3 336.7 370 341.4C391.7 346.1 413.3 350.2 435 357.6C456.7 364.9 478.3 378.7 500 385.6C521.7 392.4 543.3 393.4 565 398.5C586.7 403.6 608.3 410.9 630 416C651.7 421.2 673.3 428 695 429.5C716.7 431 738.3 427.9 760 425.1C781.7 422.2 803.3 415.5 825 412.2C846.7 408.9 868.3 407.4 890 405.3C911.7 403.1 933.3 403.2 955 399.4C976.7 395.6 998.3 386.9 1020 382.5C1041.7 378 1063.3 378.4 1085 372.7C1106.7 367.1 1128.3 358.7 1150 348.6C1171.7 338.5 1193.3 320.5 1215 312.3C1236.7 304.1 1258.3 304.5 1280 299.4C1301.7 294.2 1323.3 287.5 1345 281.4C1366.7 275.3 1388.3 266.4 1410 262.9C1431.7 259.5 1464.2 261.2 1475 260.8';
const COAST_BUOYS =
  'M40 177.8h.01M88 194.2h.01M136 211.1h.01M184 218.1h.01M232 232.2h.01M280 258.8h.01M328 282.1h.01M376 289.3h.01M424 305.4h.01M1010 330.8h.01M1058 317.8h.01M1106 312.6h.01M1154 293.9h.01M1202 270.7h.01M1250 256.5h.01M1298 250h.01M1346 231.7h.01M1394 212.5h.01';
// Rows follow the shoreline; each stretch of beach has the colour of one establishment.
const COAST_UMBRELLAS: readonly UmbrellaSpot[] = [
  [44, 319, 't'], [116, 345, 't'], [188, 358, 't'], [260, 387, 't'], [332, 423, 't'], [404, 437, 'a'],
  [476, 471, 'a'], [548, 488, 'a'], [620, 499, 'a'], [692, 512, 't'], [764, 512, 't'], [836, 504, 't'],
  [908, 500, 't'], [980, 482, 't'], [1052, 459, 'b'], [1124, 447, 'b'], [1340, 374, 'a'], [1412, 347, 'a'],
  [44, 389, 't'], [116, 415, 't'], [188, 428, 't'], [260, 457, 't'], [332, 493, 't'], [404, 507, 'a'],
  [476, 541, 'a'], [1052, 529, 'b'], [1124, 517, 'b'], [1196, 483, 'b'], [1268, 466, 'a'], [1340, 444, 'a'],
  [1412, 417, 'a'], [44, 459, 't'], [116, 485, 't'], [188, 498, 't'], [260, 527, 't'], [1268, 536, 'a'],
  [1340, 514, 'a'], [1412, 487, 'a'], [44, 529, 't'],
];

/**
 * Wide coast seen from above for the top of the portal home page. Decorative.
 * The middle is plain seafoam water so that a panel can sit on it; the detail is at the sides and along the bottom.
 */
export function CoastScene(): ReactElement {
  return (
    <svg viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <UmbrellaDef id="costa-t" kind="t" />
        <UmbrellaDef id="costa-a" kind="a" />
        <UmbrellaDef id="costa-b" kind="b" />
      </defs>
      <rect width="1440" height="560" fill={SEAFOAM} />
      <path fill={OCEAN} fillOpacity=".1" d="M0 0h480C410 62 280 74 180 100S50 152 0 170zM1060 0h380v160c-70-30-150-40-220-62S1100 46 1060 0z" />
      <path fill={OCEAN} d="M0 0h370C310 42 210 50 130 70S40 106 0 116zM1170 0h270v106c-56-22-112-30-160-46S1196 30 1170 0z" />
      <path
        fill="none"
        stroke={WHITE}
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity=".7"
        d="M40 70q9-8 18 0t18 0t18 0M250 22q9-8 18 0t18 0t18 0M1290 30q9-8 18 0t18 0t18 0M1370 66q9-8 18 0t18 0t18 0"
      />
      <path
        fill="none"
        stroke={OCEAN}
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity=".3"
        d="M100 168q9-8 18 0t18 0t18 0M330 120q9-8 18 0t18 0t18 0M400 236q9-8 18 0t18 0t18 0M1040 130q9-8 18 0t18 0t18 0M1090 250q9-8 18 0t18 0t18 0M1330 170q9-8 18 0t18 0t18 0"
      />
      <Boat transform="translate(22 -58) rotate(-20 118 104)" />
      <path fill="none" stroke={AMBER} strokeWidth="8" strokeLinecap="round" d={COAST_BUOYS} />
      <path fill="none" stroke={WHITE} strokeWidth="4" d={COAST_SURF} />
      <path fill={IVORY} d={`${COAST_SHORE}V560H0z`} />
      <path fill="none" stroke={WHITE} strokeWidth="14" d={COAST_SHORE} />
      <g transform="rotate(-32 1236 344)">
        <rect x="1232" y="170" width="26" height="214" rx="3" fill={OCEAN} fillOpacity=".16" />
        <rect x="1224" y="164" width="26" height="220" rx="3" fill={WHITE} />
        <path stroke={OCEAN} strokeOpacity=".3" strokeWidth="2" d="M1224 180h26M1224 196h26M1224 212h26M1224 228h26M1224 244h26M1224 260h26M1224 276h26M1224 292h26M1224 308h26M1224 324h26M1224 340h26M1224 356h26M1224 372h26" />
      </g>
      {COAST_UMBRELLAS.map(([x, y, kind]) => (
        <use key={`${x}-${y}`} href={`#costa-${kind}`} x={x} y={y} />
      ))}
    </svg>
  );
}
