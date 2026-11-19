import type { ReactElement } from 'react';
import type { AnyDecorationSign } from '@ombre/shared';
import { ElementSymbol } from './beach-art';

// The repertoire of decoration signs (D35, spec §4bis), redrawn by the «beach-art»
// language (D55/D58): the keys stay the same, the drawings now live in beach-art.tsx,
// scenery signs included. A decoration has no state and is never a target: the sign is
// always aria-hidden and the accessible name travels as text next to it.

/** The sign of a decoration, always hidden from the reading: the name travels as text next to it. */
export function DecorationMark({ sign }: { sign: AnyDecorationSign }): ReactElement {
  return <ElementSymbol kind={sign} />;
}
