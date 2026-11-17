import type { ReactNode } from 'react';
import type { DecorationSign } from '@ombre/shared';

// The repertoire of decoration signs (D35, spec §4bis). The client's boards dictate
// the subjects, never the drawings: every sign here is an original vector in the
// Solar & Fresh style, built on the colour tokens of the portal and readable at
// 20-28 px. A decoration has no state and is never a target: the sign is always
// aria-hidden and the accessible name travels as text next to it.

/** A palm seen from above: six leaves around the trunk. */
function Palma() {
  return (
    <>
      <g fill="var(--libero)">
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <path key={angle} transform={`rotate(${angle} 24 24)`} d="M24 24C20.8 16.5 20.5 10 24 4.5C27.5 10 27.2 16.5 24 24Z" />
        ))}
      </g>
      <circle cx="24" cy="24" r="3.5" fill="var(--ambra)" />
    </>
  );
}

/** The kiosk bar: thatched roof, two posts and the counter. */
function Chiosco() {
  return (
    <>
      <path d="M24 5L43 20H5Z" fill="var(--ambra)" />
      <path d="M11 20h3.5v14H11ZM33.5 20H37v14h-3.5Z" fill="var(--abisso)" />
      <rect x="7" y="34" width="34" height="8" rx="2" fill="var(--oceano)" />
    </>
  );
}

/** The outdoor shower: pole, arm, head and three drops. */
function Doccia() {
  return (
    <>
      <path d="M13 43V10a4 4 0 0 1 4-4h11" fill="none" stroke="var(--abisso)" strokeWidth="4" strokeLinecap="round" />
      <rect x="25" y="3" width="10" height="6" rx="2" fill="var(--oceano)" />
      <path d="M26 15v5M30 15v7M34 15v5" fill="none" stroke="var(--oceano)" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** The flag: a pole with its pennant in the wind. */
function Bandiera() {
  return (
    <>
      <path d="M15 44V5" fill="none" stroke="var(--abisso)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M17.5 6L39 11.5L17.5 18.5Z" fill="var(--ambra)" />
    </>
  );
}

/** The lifebuoy: a coral ring with its four pale sectors. */
function Salvagente() {
  return (
    <>
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="var(--occupato)" strokeWidth="9" />
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="var(--spuma)" strokeWidth="9" strokeDasharray="11.39 11.39" strokeDashoffset="5.7" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="var(--abisso)" strokeWidth="1.5" />
    </>
  );
}

/** The information sign: a panel with its lines of text, on a post. */
function Cartello() {
  return (
    <>
      <rect x="8" y="7" width="32" height="19" rx="3" fill="var(--ambra)" />
      <path d="M14 14h20M14 20h13" fill="none" stroke="var(--carta)" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 26v17" fill="none" stroke="var(--abisso)" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

/** The waste bin: lid and slotted body. */
function Cestino() {
  return (
    <>
      <rect x="11" y="8" width="26" height="5.5" rx="2.75" fill="var(--abisso)" />
      <rect x="14" y="15" width="20" height="26" rx="3" fill="var(--oceano)" />
      <path d="M20 21v14M28 21v14" fill="none" stroke="var(--carta)" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

/** The hammock: the net hangs between two posts. */
function Amaca() {
  return (
    <>
      <path d="M6 13v29M42 13v29" fill="none" stroke="var(--ambra)" strokeWidth="4" strokeLinecap="round" />
      <path d="M8 17C14 31 34 31 40 17" fill="none" stroke="var(--abisso)" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 20v7M19.5 22.5v7M28.5 22.5v7M34 20v7" fill="none" stroke="var(--abisso)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

/** The swing: frame, ropes and seat. */
function Altalena() {
  return (
    <>
      <path d="M7 9h34" fill="none" stroke="var(--abisso)" strokeWidth="4" strokeLinecap="round" />
      <path d="M10 9L6 42M38 9l4 33" fill="none" stroke="var(--abisso)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M19 9v21M29 9v21" fill="none" stroke="var(--ambra)" strokeWidth="2.5" />
      <rect x="15.5" y="30" width="17" height="5" rx="2" fill="var(--oceano)" />
    </>
  );
}

/** The inflatable play area seen from above: ring and pool. */
function Giochi() {
  return (
    <>
      <rect x="6" y="7" width="36" height="34" rx="7" fill="var(--occupato)" />
      <rect x="12.5" y="13.5" width="23" height="21" rx="4" fill="var(--oceano)" />
      <path d="M18 24h12" fill="none" stroke="var(--carta)" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** The small table seen from above, with its four seats. */
function Tavolino() {
  return (
    <>
      <g fill="var(--abisso)">
        <rect x="7" y="20" width="7.5" height="8" rx="2" />
        <rect x="33.5" y="20" width="7.5" height="8" rx="2" />
        <rect x="20" y="7" width="8" height="7.5" rx="2" />
        <rect x="20" y="33.5" width="8" height="7.5" rx="2" />
      </g>
      <circle cx="24" cy="24" r="11" fill="var(--ambra)" />
    </>
  );
}

/** The barbecue grill seen from above: grate and handles. */
function Grill() {
  return (
    <>
      <path d="M4.5 24h5M38.5 24h5" fill="none" stroke="var(--abisso)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="14" fill="var(--abisso)" />
      <path d="M14 24h20M24 14v20M17 17l14 14M31 17L17 31" fill="none" stroke="var(--carta)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

/** The water dispenser: bottle, body and tap. */
function Acqua() {
  return (
    <>
      <rect x="17" y="3" width="14" height="11" rx="3" fill="var(--oceano)" />
      <rect x="14" y="14" width="20" height="28" rx="3" fill="var(--spuma)" stroke="var(--abisso)" strokeWidth="2" />
      <rect x="19" y="22" width="10" height="6" rx="1.5" fill="var(--oceano)" />
    </>
  );
}

/** The lockers: two doors with vents and handles. */
function Armadietti() {
  return (
    <>
      <rect x="10" y="6" width="28" height="36" rx="3" fill="var(--oceano)" />
      <path d="M24 6v36" stroke="var(--carta)" strokeWidth="2.5" />
      <path d="M14 13h6M28 13h6M14 18h6M28 18h6" fill="none" stroke="var(--carta)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20.5" cy="28" r="1.8" fill="var(--carta)" />
      <circle cx="34.5" cy="28" r="1.8" fill="var(--carta)" />
    </>
  );
}

/** The playing field (volley, bocce) seen from above: sand, net and balls. */
function Campo() {
  return (
    <>
      <rect x="6" y="12.5" width="36" height="23" rx="2.5" fill="var(--spuma)" stroke="var(--ambra)" strokeWidth="3" />
      <path d="M24 12.5v23" fill="none" stroke="var(--abisso)" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx="16" cy="21.5" r="2.2" fill="var(--occupato)" />
      <circle cx="33" cy="28" r="2.2" fill="var(--oceano)" />
    </>
  );
}

/** The ping pong table seen from above: net across and the ball. */
function PingPong() {
  return (
    <>
      <rect x="7" y="10" width="34" height="28" rx="2.5" fill="var(--oceano)" />
      <path d="M7 24h34" fill="none" stroke="var(--carta)" strokeWidth="2" />
      <path d="M24 9v30" fill="none" stroke="var(--abisso)" strokeWidth="3" />
      <circle cx="32" cy="16.5" r="2" fill="var(--carta)" />
    </>
  );
}

const signComponents: Record<DecorationSign, () => ReactNode> = {
  palma: Palma,
  chiosco: Chiosco,
  doccia: Doccia,
  bandiera: Bandiera,
  salvagente: Salvagente,
  cartello: Cartello,
  cestino: Cestino,
  amaca: Amaca,
  altalena: Altalena,
  giochi: Giochi,
  tavolino: Tavolino,
  grill: Grill,
  acqua: Acqua,
  armadietti: Armadietti,
  campo: Campo,
  pingpong: PingPong,
};

/** The sign of a decoration, always hidden from the reading: the name travels as text next to it. */
export function DecorationMark({ sign }: { sign: DecorationSign }) {
  const Sign = signComponents[sign];
  return (
    <svg className="deco-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <Sign />
    </svg>
  );
}
