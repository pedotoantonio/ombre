import type { ReactElement } from 'react';

interface LogoProps {
  /** `onDark` when the symbol sits on a dark surface. */
  tone?: 'color' | 'onDark';
}

/** Brand symbol. Decorative: the brand name is always written next to it. */
export function Logo({ tone = 'color' }: LogoProps): ReactElement {
  const pole = tone === 'onDark' ? '#f8f9fa' : '#1d3557';
  const background = tone === 'onDark' ? '#1d3557' : '#f8f9fa';
  const wave = tone === 'onDark' ? '#7fc8d4' : '#005f73';
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <path d="M120 30v160" stroke={pole} strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M120 38c-52 0-94 38-94 86h188c0-48-42-86-94-86z" fill="#ee9b00" />
      <circle cx="49.5" cy="124" r="23.5" fill={background} />
      <circle cx="96.5" cy="124" r="23.5" fill={background} />
      <circle cx="143.5" cy="124" r="23.5" fill={background} />
      <circle cx="190.5" cy="124" r="23.5" fill={background} />
      <path
        d="M34 206c14-16 30-16 44 0s30 16 44 0 30-16 44 0 30 16 40 0"
        fill="none"
        stroke={wave}
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Beach scene for the home page: sun, sea, umbrella and two sunbeds on the sand. Decorative. */
export function BeachScene(): ReactElement {
  return (
    <svg viewBox="0 0 420 360" aria-hidden="true" focusable="false">
      <clipPath id="scena-bordo">
        <rect width="420" height="360" rx="28" />
      </clipPath>
      <g clipPath="url(#scena-bordo)">
        <rect width="420" height="360" fill="#fffdf6" />
        <circle cx="330" cy="82" r="38" fill="#ffb703" />
        <path d="M0 196c35-18 70-18 105 0s70 18 105 0 70-18 105 0 70 18 105 0v164H0z" fill="#126777" />
        <path d="M0 228c35-16 70-16 105 0s70 16 105 0 70-16 105 0 70 16 105 0v132H0z" fill="#023047" />
        <rect y="264" width="420" height="96" fill="#f3e3bd" />
        <path d="M178 96v214" stroke="#023047" strokeWidth="8" strokeLinecap="round" />
        <path d="M178 100c-62 0-112 42-112 96h224c0-54-50-96-112-96z" fill="#ffb703" />
        <path d="M178 100c-22 0-40 42-40 96h80c0-54-18-96-40-96z" fill="#f29f05" />
        <path d="M62 282l22 22h70" fill="none" stroke="#126777" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M294 282l-22 22h-70" fill="none" stroke="#126777" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M96 304v16M146 304v16M210 304v16M260 304v16" stroke="#023047" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Wide coastal scene for the top of the portal home page. Decorative. */
export function CoastScene(): ReactElement {
  return (
    <svg viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="1440" height="560" fill="#e0f2f1" />
    </svg>
  );
}
