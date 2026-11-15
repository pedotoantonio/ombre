/**
 * Zones of a beach layout, in drawing and listing order: the shore sunbeds come
 * first, then the umbrella grid, then the land side. Inside each zone the rows
 * count from 1, and row 1 is always the closest to the sea.
 */
export const spotZones = ['riva', 'ombrelloni', 'monte'] as const;
export type SpotZone = (typeof spotZones)[number];

/** Suggested rental labels. The manager may write any other text up to the limit. */
export const rentalTypeSuggestions = ['Stagionale', 'Albergo'] as const;

export const rentalTypeMaxLength = 40;
export const rentalNotesMaxLength = 500;

/** Empty corridor rows between zones: 0 means adjacent, 10 is the widest gap. */
export const maxGapRows = 10;

/** Side of the drawing where the sea band sits. Only the block order flips; the DOM order never does. */
export const seaSides = ['top', 'bottom'] as const;
export type SeaSide = (typeof seaSides)[number];

/**
 * Elements drawn on the layout grid besides the spots: walkways (their own lanes),
 * cabin blocks (function 3) and generic labelled structures such as a bar.
 */
export const layoutElementKinds = ['walkway', 'cabin_block', 'structure'] as const;
export type LayoutElementKind = (typeof layoutElementKinds)[number];

/** A horizontal walkway adds its own drawing row after a zone row; a vertical one runs between two columns. */
export const walkwayOrientations = ['horizontal', 'vertical'] as const;
export type WalkwayOrientation = (typeof walkwayOrientations)[number];

/** Fixed repertoire of graphic marks for spot types, custom ones included: no uploaded icons. */
export const spotMarks = ['umbrella', 'sunbed', 'gazebo', 'tent', 'daybed'] as const;
export type SpotMark = (typeof spotMarks)[number];

export const spotTypeNameMaxLength = 40;
export const elementLabelMaxLength = 40;
/** Columns count from 1 inside a row; after the backfill the drawing may leave holes. */
export const maxColumns = 99;

export const cabinCodeMaxLength = 10;
export const cabinNotesMaxLength = 500;
export const holderNameMaxLength = 120;
export const holderContactMaxLength = 200;
export const occupantNameMaxLength = 120;
