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
