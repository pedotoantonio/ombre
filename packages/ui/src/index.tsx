import type { ReactElement } from 'react';

// Brand palette (docs/progetto-grafico.md). The artwork below uses these colours only, plus white.
const OCEAN = '#005f73';
const SEAFOAM = '#e0f2f1';
const AMBER = '#ee9b00';
const ABYSS = '#1d3557';
const IVORY = '#f8f9fa';
const WHITE = '#fff';

interface LogoProps {
  /** `onDark` when the logo sits on a dark surface. */
  tone?: 'color' | 'onDark';
}

interface LogoLockupProps extends LogoProps {
  /** Accessible name of the image: the brand name, which the caller takes from configuration. */
  label: string;
}

// The client's emblem on a 240 grid: a tilted beach umbrella, a smiling face beside its pole, a wave with a small
// highlight and the sand closing the circle. Traced from the client's brand sheet and cleaned up; master files and
// usage rules are in docs/marchio.
const EMBLEM_MAIN =
  'M73.6 3.5c-3.9 1-4.7 4.1-2.7 9.4 3 7.7 3 6.6.3 11.6-11.6 22.2-15 39.8-11.8 61.1 1.6 10.4 5.3 23.3 9.1 31.5 1.9 4.1 2.2 4.2 4.9 1.1 4.1-4.8 5.3-6.1 7.3-8.1 6-5.8 12.9-10.7 18.2-13 1.9-.9 1.5-1.8 6.5 13.1 8.7 26 10.3 30.6 12.7 37 2.1 5.7 2.1 5.7-2.4 3.5-11.6-5.6-26-8.5-36.1-7.2-.8.2-2 .3-2.7.4-12.9 1.7-26.9 8.7-35.8 18.1-10.2 10.7-16.3 21.1-14.7 25.1 1.1 2.7 3.9 2.2 8.3-1.4 8.5-7.1 17.4-11.1 28.1-12.5 10.6-1.3 25.6 1.5 36.1 7 3.9 2.1 7.7 4.5 14.5 9.4 11.7 8.5 16.4 11.2 24.1 14.4 37.8 15.2 81.2-6 94.9-46.2 3.5-10.4 5.6-20.5 4.7-22.8-.9-2.3-4-3-5.8-1.3-1.1 1-1.3 1.5-2.2 6.3-6.6 32.9-41.1 50-72.7 35.9-4.8-2.1-7.8-3.9-16.5-9.7-5.5-3.8-4.8-2.8-6.7-8.8-1.9-5.7-4-11.9-5.9-17.5-.9-2.4-2.8-7.8-4.3-12.2-1.5-4.3-3.6-10.3-4.7-13.3-3.7-10.6-7-20.4-7-20.9 0-.6 1.3-1.1 4.5-1.6 .5-.1 1.5-.3 2.1-.5 7.6-1.6 17.6-1.8 24.7-.4 5.2 1.1 7.4.7 7.4-1.2 0-.8-1.1-4.3-2.5-7.9-.6-1.5-1.5-3.9-2.1-5.5-7.4-20.1-21-37.2-37.7-47.5-5.2-3.2-12.5-6.6-18-8.5-5.8-2-6.4-2.5-7.6-6.8-.9-3.2-2-6.7-2.6-7.6-1.1-1.9-3.8-3.1-5.9-2.5zM113.1 8.5c-6.1.3-13.8 1.4-19.7 2.8-4 1-4 1 .2 2.4 6 2 13.8 5.8 20.6 10 16.4 10.2 31.6 30.6 39.9 53.5 3.3 9.3 3.4 9.6 3.9 9.8 .7.4 1.3-.1 3.9-3.1 10-11.2 24.3-16.3 39.3-14.1 6.8 1.1 9.4.3 11.1-3.5 1.5-3.1.9-5.2-3-10.9-17.2-24.5-42.5-40.6-71.9-45.5-7.2-1.3-17.1-1.8-24.3-1.4zM61.4 22.7c-10.3 5.1-19.2 11.8-28.5 21.8-20.8 22.1-30.9 51.5-28.7 83.4 .8 11.1 1.7 13.5 5.7 14.8 3 1 5.4-.2 8.7-4.1 9.3-11.3 22.5-16.7 38.1-15.7 5.9.4 5.7 1.1 2.3-8-3.8-10.1-5.5-15.9-6.8-22.2-4.1-21.7-2.3-40 5.8-58.3 1.7-3.8 3.8-8.1 4.8-10.1 1.6-3 1.5-3.1-1.4-1.6zM203.7 101c-5.8.9-10.5 4.7-12.3 9.8-2.8 8 5.1 12.1 8.1 4.1 1.1-2.9 1.5-3.5 3.5-4.6 1-.5 1-.5 3.1-.5 2.9 0 4 .4 6.4 2.6 1.6 1.5 2.9 1.9 5.1 1.4 3.5-.7 2.1-6.9-2.1-10-3-2.2-8-3.4-11.8-2.8zM151.8 112c-7.3 1-12.6 6.2-13.2 13-.4 5.8 5.4 7.3 7.5 2 2.6-6.5 8.8-8.2 13.7-3.7 3.4 3.1 7.7 2.3 8-1.4 .4-5.4-8.4-10.8-16-9.9zM204 137.8c-.6.3-1.4 1.2-2.9 3.3-5.4 7.1-11.6 10.7-19.5 11.1-6.2.4-10.1-.4-15.1-3.2-3.4-1.8-3.3-1.8-4.6-1.8-2.2 0-4.2 1.4-4.3 3.3-.3 3.2 6.8 8.1 14 9.5 13.5 2.7 26-1.5 33.5-11.4 3.2-4.3 4.1-7 3-9.2-.7-1.4-2.7-2.2-4.1-1.6z';
const EMBLEM_SAND =
  'M66.5 181.6c-9.2.6-19.2 4.7-28 11.6-1.4 1.2-2.9 3.1-2.9 4 0 2.3 14.5 15.6 23.2 21.4 6.4 4.2 8.4 5.2 16.5 8.8 4.4 1.9 13.2 5.1 15.4 5.6 .3 0 1.3.3 2.1.5 7.2 2.2 17.9 3.6 27.2 3.6 7.8 0 13.8-.5 21.1-1.7 3.6-.5 11.3-2.5 15.2-3.9 4.6-1.5 10.2-3.8 12.1-4.8 .7-.4 1.6-.8 2.1-1 5.4-2.2 21.9-13 21-13.8-.2-.2-2 .2-4.9 1.2-11.8 4-24.8 5.2-35.5 3.4-12.6-2.2-24.9-7.6-36.6-16.1-1.8-1.3-3.4-2.4-9-6.3-8.5-5.8-15.6-9.1-24-11.2-4.2-1-10.8-1.6-15-1.3z';
const EMBLEM_HIGHLIGHT =
  'M55.2 160.4c9.2-5.9 18.5-9.3 28.1-9.6 9.7-.3 18 1.1 23.2 3.2 2.7 1.1 2.5 5.6-.2 6.1-5.3-3-13.3-5-23-5-9.6 0-18.9 2-28.1 5.3z';
// Wordmark as outlines (Nunito Bold, SIL Open Font License) and the rising sun that takes the place of the accent,
// in the same coordinates as the emblem and to its right.
const LOCKUP_WORDMARK =
  'M320.7 172.7Q307.2 172.7 297.2 167.2Q287.2 161.7 281.7 151.4Q276.1 141.1 276.1 127.2Q276.1 116.7 279.2 108.4Q282.4 100.1 288.2 94.2Q294.1 88.2 302.3 85.1Q310.5 81.9 320.7 81.9Q334.3 81.9 344.2 87.5Q354.2 93 359.8 103.2Q365.3 113.3 365.3 127.2Q365.3 137.8 362.2 146.1Q359 154.5 353.2 160.5Q347.3 166.5 339.1 169.6Q330.9 172.7 320.7 172.7zM320.7 155.8Q327.3 155.8 332.3 152.6Q337.3 149.3 340.1 143Q342.8 136.7 342.8 127.2Q342.8 113 336.8 105.9Q330.7 98.9 320.7 98.9Q314.1 98.9 309.1 102Q304.1 105.1 301.4 111.5Q298.6 117.8 298.6 127.2Q298.6 141.3 304.7 148.5Q310.7 155.8 320.7 155.8zM393.5 172.4Q388.1 172.4 385.3 169.4Q382.4 166.5 382.4 160.9L382.4 93.5Q382.4 88 385.3 85.2Q388.1 82.3 393.3 82.3Q398.5 82.3 401.3 85.2Q404.2 88 404.2 93.5L404.2 106.6L402.2 101.2Q405.8 92.3 413.3 87.1Q420.8 81.9 431.1 81.9Q441.6 81.9 448.4 86.9Q455.2 91.9 457.9 102.3L455.4 102.3Q458.9 92.8 467.1 87.4Q475.3 81.9 486 81.9Q496 81.9 502.5 85.9Q509.1 89.8 512.3 97.7Q515.5 105.7 515.5 117.8L515.5 160.9Q515.5 166.5 512.5 169.4Q509.6 172.4 504.2 172.4Q498.9 172.4 496 169.4Q493.2 166.5 493.2 160.9L493.2 118.7Q493.2 108.7 489.9 104.1Q486.6 99.4 478.7 99.4Q470 99.4 465 105.6Q460 111.7 460 122.6L460 160.9Q460 166.5 457.2 169.4Q454.3 172.4 449 172.4Q443.6 172.4 440.7 169.4Q437.7 166.5 437.7 160.9L437.7 118.7Q437.7 108.7 434.4 104.1Q431.1 99.4 423.5 99.4Q414.7 99.4 409.7 105.6Q404.7 111.7 404.7 122.6L404.7 160.9Q404.7 172.4 393.5 172.4zM586.4 172.7Q575.3 172.7 567 167.2Q558.7 161.7 556.1 152.4L558 147.9L558 160.9Q558 166.5 555.2 169.4Q552.3 172.4 547.2 172.4Q541.8 172.4 539 169.4Q536.1 166.5 536.1 160.9L536.1 61.6Q536.1 56.1 539 53.2Q541.8 50.4 547.2 50.4Q552.5 50.4 555.5 53.2Q558.4 56.1 558.4 61.6L558.4 101.4L556.3 101.4Q559.1 92.6 567.3 87.3Q575.5 81.9 586.4 81.9Q598 81.9 606.5 87.5Q615.1 93 619.9 103.1Q624.7 113.1 624.7 127.2Q624.7 141.1 619.9 151.4Q615.1 161.7 606.5 167.2Q597.8 172.7 586.4 172.7zM580.1 155.8Q586.7 155.8 591.7 152.6Q596.7 149.3 599.5 143Q602.3 136.7 602.3 127.2Q602.3 113 596.2 105.9Q590.1 98.9 580.1 98.9Q573.6 98.9 568.6 102Q563.6 105.1 560.8 111.5Q558 117.8 558 127.2Q558 141.3 564.1 148.5Q570.2 155.8 580.1 155.8zM652 172.4Q646.5 172.4 643.6 169.4Q640.6 166.5 640.6 160.9L640.6 93.5Q640.6 88 643.5 85.2Q646.3 82.3 651.5 82.3Q656.7 82.3 659.5 85.2Q662.4 88 662.4 93.5L662.4 104.8L660.6 104.8Q663.1 94.1 670.4 88.5Q677.7 83 689.8 81.9Q693.6 81.6 695.8 83.8Q698.1 86 698.4 90.7Q698.8 95.1 696.4 97.9Q693.9 100.7 689.1 101.2L685.2 101.6Q674.3 102.6 668.8 108.2Q663.3 113.9 663.3 124L663.3 160.9Q663.3 166.5 660.4 169.4Q657.6 172.4 652 172.4zM754.5 172.7Q739.7 172.7 729 167.2Q718.3 161.7 712.5 151.5Q706.7 141.3 706.7 127.4Q706.7 113.9 712.4 103.7Q718 93.5 727.9 87.7Q737.8 81.9 750.4 81.9Q759.7 81.9 767.1 85Q774.5 88 779.8 93.7Q785 99.4 787.8 107.5Q790.6 115.6 790.6 125.8Q790.6 129 788.3 130.7Q786.1 132.4 782 132.4L724.8 132.4L724.8 119.6L774.9 119.6L772 122.2Q772 114 769.6 108.5Q767.2 103 762.6 100Q758.1 97.1 751.3 97.1Q743.8 97.1 738.6 100.6Q733.3 104.1 730.5 110.4Q727.8 116.7 727.8 125.5L727.8 126.7Q727.8 141.3 734.6 148.5Q741.5 155.8 754.9 155.8Q759.5 155.8 765.3 154.6Q771.1 153.5 776.3 150.6Q780 148.5 782.9 148.7Q785.7 149 787.4 150.8Q789.1 152.6 789.5 155.1Q789.8 157.7 788.5 160.4Q787.2 163.1 784 165Q777.7 169 769.6 170.8Q761.5 172.7 754.5 172.7z';
const LOCKUP_SUN =
  'M726.6 77.5A25.9 25.9 0 1 1 777.3 77.5A46.3 46.3 0 0 0 726.6 77.5zM755.2 34.6L755.2 26.2A3.2 3.2 0 0 0 748.7 26.2L748.7 34.6A3.2 3.2 0 0 0 755.2 34.6zM728.9 43.1L722.9 37.2A3.2 3.2 0 0 0 718.4 41.8L724.3 47.7A3.2 3.2 0 0 0 728.9 43.1zM779.6 47.7L785.5 41.8A3.2 3.2 0 0 0 781 37.2L775 43.1A3.2 3.2 0 0 0 779.6 47.7zM715.4 66.6L707 66.6A3.2 3.2 0 0 0 707 73L715.4 73A3.2 3.2 0 0 0 715.4 66.6zM788.5 73L796.9 73A3.2 3.2 0 0 0 796.9 66.6L788.5 66.6A3.2 3.2 0 0 0 788.5 73z';

function Emblem({ tone }: Required<LogoProps>): ReactElement {
  const onDark = tone === 'onDark';
  return (
    <>
      <path fill={onDark ? IVORY : OCEAN} d={EMBLEM_MAIN} />
      <path fill={AMBER} d={EMBLEM_SAND} />
      <path fill={SEAFOAM} fillOpacity={onDark ? undefined : '.3'} d={EMBLEM_HIGHLIGHT} />
    </>
  );
}

/** Brand emblem alone. Decorative: use it where the brand name is written next to it. */
export function Logo({ tone = 'color' }: LogoProps): ReactElement {
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <Emblem tone={tone} />
    </svg>
  );
}

/** Emblem and wordmark side by side, as one image named by `label`. Its height is set by CSS. */
export function LogoLockup({ tone = 'color', label }: LogoLockupProps): ReactElement {
  return (
    <svg viewBox="0 0 803 240" role="img" aria-label={label} focusable="false">
      <Emblem tone={tone} />
      <path fill={tone === 'onDark' ? IVORY : OCEAN} d={LOCKUP_WORDMARK} />
      <path fill={AMBER} d={LOCKUP_SUN} />
    </svg>
  );
}

// Shared pieces of the illustrations, drawn around the origin: an eight-panel umbrella of radius 24 seen from
// above, the two sunbeds beside its pole, a small boat with its wake.
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
export * from './icons';
