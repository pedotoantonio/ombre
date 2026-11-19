import type { Locale } from '../i18n/routes';
import { demoImageSrc, demoMedia, type DemoMediaId } from './demo-media';
import type { SpotMark } from './layout';

// The spot type card (D61): every type of spot has an illustrated card in the
// purchase flow. Two levels: a platform default per mark (below) and the custom
// card of the beach club (spot_type_card, migration 025), resolved FIELD BY FIELD.

/** A photograph of a custom card: a key of the site's sample library (demoMedia), never an outside address. */
export interface TypeCardPhoto {
  id: string;
  captionIt?: string;
  captionEn?: string;
}

/** A label/value pair, Italian always, English optional with fallback. */
export interface TypeCardDetail {
  labelIt: string;
  labelEn?: string;
  valueIt: string;
  valueEn?: string;
}

/** A short note in both languages; English optional, falling back on the Italian like the site does. */
export interface TypeCardNote {
  it: string;
  en?: string;
}

/**
 * The custom content of a club's card. Every field is optional: the resolved
 * card takes the custom field where there is one, the default elsewhere.
 */
export interface TypeCardContent {
  title?: string;
  descriptionIt?: string;
  descriptionEn?: string;
  /** 1 to 6 pictures from the site's sample library. */
  photos?: TypeCardPhoto[];
  equipmentNote?: TypeCardNote;
  capacityNote?: TypeCardNote;
  /** Up to 6 label/value pairs. */
  details?: TypeCardDetail[];
}

export const typeCardLimits = {
  title: 80,
  description: 1200,
  caption: 160,
  note: 300,
  detailLabel: 80,
  detailValue: 160,
  photos: 6,
  details: 6,
} as const;

const contentFields = ['title', 'descriptionIt', 'descriptionEn', 'photos', 'equipmentNote', 'capacityNote', 'details'] as const;

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RangeError(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, known: readonly string[], what: string): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) throw new RangeError(`${what} has an unknown field: ${key}`);
  }
}

/** Plain text like the site accepts: trimmed, never empty, no markup, within its limit. */
function text(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string') throw new RangeError(`${what} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new RangeError(`${what} must not be empty`);
  if (trimmed.length > max) throw new RangeError(`${what} must not exceed ${max} characters`);
  if (/[<>]/.test(trimmed)) throw new RangeError(`${what} must be plain text`);
  return trimmed;
}

function note(value: unknown, what: string): TypeCardNote {
  const raw = record(value, what);
  assertKnownKeys(raw, ['it', 'en'], what);
  return {
    it: text(raw.it, typeCardLimits.note, `${what}.it`),
    ...(raw.en === undefined ? {} : { en: text(raw.en, typeCardLimits.note, `${what}.en`) }),
  };
}

/**
 * Validates a custom card as it is saved. Unknown fields are refused: a field
 * this module does not know would never be shown. Returns the content with
 * every text trimmed; an empty object is refused, resetting is a reset.
 */
export function parseTypeCardContent(value: unknown): TypeCardContent {
  const raw = record(value, 'content');
  assertKnownKeys(raw, contentFields, 'content');
  const content: TypeCardContent = {};
  if (raw.title !== undefined) content.title = text(raw.title, typeCardLimits.title, 'title');
  if (raw.descriptionIt !== undefined) content.descriptionIt = text(raw.descriptionIt, typeCardLimits.description, 'descriptionIt');
  if (raw.descriptionEn !== undefined) content.descriptionEn = text(raw.descriptionEn, typeCardLimits.description, 'descriptionEn');
  if (raw.photos !== undefined) {
    if (!Array.isArray(raw.photos)) throw new RangeError('photos must be a list');
    if (raw.photos.length < 1 || raw.photos.length > typeCardLimits.photos) throw new RangeError(`photos must have 1 to ${typeCardLimits.photos} entries`);
    content.photos = raw.photos.map((entry, index) => {
      const photo = record(entry, `photos[${index}]`);
      assertKnownKeys(photo, ['id', 'captionIt', 'captionEn'], `photos[${index}]`);
      if (typeof photo.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(photo.id)) throw new RangeError(`photos[${index}].id must be a key of the sample library`);
      return {
        id: photo.id,
        ...(photo.captionIt === undefined ? {} : { captionIt: text(photo.captionIt, typeCardLimits.caption, `photos[${index}].captionIt`) }),
        ...(photo.captionEn === undefined ? {} : { captionEn: text(photo.captionEn, typeCardLimits.caption, `photos[${index}].captionEn`) }),
      };
    });
  }
  if (raw.equipmentNote !== undefined) content.equipmentNote = note(raw.equipmentNote, 'equipmentNote');
  if (raw.capacityNote !== undefined) content.capacityNote = note(raw.capacityNote, 'capacityNote');
  if (raw.details !== undefined) {
    if (!Array.isArray(raw.details)) throw new RangeError('details must be a list');
    if (raw.details.length < 1 || raw.details.length > typeCardLimits.details) throw new RangeError(`details must have 1 to ${typeCardLimits.details} entries`);
    content.details = raw.details.map((entry, index) => {
      const detail = record(entry, `details[${index}]`);
      assertKnownKeys(detail, ['labelIt', 'labelEn', 'valueIt', 'valueEn'], `details[${index}]`);
      return {
        labelIt: text(detail.labelIt, typeCardLimits.detailLabel, `details[${index}].labelIt`),
        ...(detail.labelEn === undefined ? {} : { labelEn: text(detail.labelEn, typeCardLimits.detailLabel, `details[${index}].labelEn`) }),
        valueIt: text(detail.valueIt, typeCardLimits.detailValue, `details[${index}].valueIt`),
        ...(detail.valueEn === undefined ? {} : { valueEn: text(detail.valueEn, typeCardLimits.detailValue, `details[${index}].valueEn`) }),
      };
    });
  }
  if (Object.keys(content).length === 0) throw new RangeError('content must customize at least one field; to go back to the default, reset the card');
  return content;
}

export interface DefaultTypeCard {
  descriptionIt: string;
  descriptionEn: string;
  equipmentNoteIt: string;
  equipmentNoteEn: string;
  tipIt?: string;
  tipEn?: string;
  /** The stock photograph of the mark, a 3:2 crop with a registered license (D62). */
  photo: string;
}

const typePhoto = (mark: SpotMark): string => `/demo/tipi/${mark}.jpg`;

/**
 * The platform default card of every mark (D61): the club that curates nothing
 * still has a decent card. The default title is the club's own type name.
 *
 * PLACEHOLDER TEXTS: one short, honest sentence per field. The editor's texts,
 * reviewed by the usability expert, replace them in a later wave; only the
 * values change, never the structure.
 */
export const defaultTypeCards: Record<SpotMark, DefaultTypeCard> = {
  umbrella: {
    descriptionIt: 'Una postazione in spiaggia all\'ombra di un ombrellone.',
    descriptionEn: 'A spot on the beach in the shade of an umbrella.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    tipIt: 'La capienza indica quante persone stanno comode alla postazione.',
    tipEn: 'The capacity says how many people fit comfortably at the spot.',
    photo: typePhoto('umbrella'),
  },
  sunbed: {
    descriptionIt: 'Un lettino singolo per prendere il sole in riva o in spiaggia.',
    descriptionEn: 'A single sunbed for sunbathing by the shore or on the beach.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('sunbed'),
  },
  deckchair: {
    descriptionIt: 'Una sdraio pieghevole, comoda per leggere e riposare.',
    descriptionEn: 'A folding deckchair, comfortable for reading and resting.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('deckchair'),
  },
  gazebo: {
    descriptionIt: 'Un gazebo con ampia zona d\'ombra, adatto a piccoli gruppi.',
    descriptionEn: 'A gazebo with a wide shaded area, suited to small groups.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('gazebo'),
  },
  tent: {
    descriptionIt: 'Una tenda da spiaggia che ripara dal sole e dal vento.',
    descriptionEn: 'A beach tent that shelters from sun and wind.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('tent'),
  },
  daybed: {
    descriptionIt: 'Un lettone matrimoniale da spiaggia, per rilassarsi in due.',
    descriptionEn: 'A beach daybed for two, made for relaxing together.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('daybed'),
  },
  canopy: {
    descriptionIt: 'Una tenda a telo sospesa che dà un\'ombra leggera.',
    descriptionEn: 'A suspended canopy that gives a light shade.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('canopy'),
  },
  canoe: {
    descriptionIt: 'Una canoa da noleggiare per uscite lungo la costa.',
    descriptionEn: 'A canoe for rent, for outings along the coast.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('canoe'),
  },
  sup: {
    descriptionIt: 'Una tavola SUP con pagaia per remare in piedi.',
    descriptionEn: 'A SUP board with a paddle for standing up on the water.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('sup'),
  },
  pedalo: {
    descriptionIt: 'Un pedalò per uscite in mare in compagnia.',
    descriptionEn: 'A pedal boat for going out to sea in company.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('pedalo'),
  },
  jetski: {
    descriptionIt: 'Una moto d\'acqua da noleggiare, con le regole del lido.',
    descriptionEn: 'A jet ski for rent, under the club\'s rules.',
    equipmentNoteIt: 'La dotazione tipica è indicata qui sotto.',
    equipmentNoteEn: 'The typical equipment is listed below.',
    photo: typePhoto('jetski'),
  },
};

/** What the resolution needs to know about the type itself. */
export interface TypeCardType {
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
}

export interface ResolvedTypeCardPhoto {
  src: string;
  alt: string;
  caption: string | null;
}

export interface ResolvedTypeCard {
  title: string;
  description: string;
  photos: ResolvedTypeCardPhoto[];
  equipmentNote: string;
  capacityNote: string | null;
  details: { label: string; value: string }[];
  /** The base equipment and capacity always come from the type itself; the texts complete them. */
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  customized: boolean;
  /** Which fields come from the club's card: a subset of title, description, photos, equipmentNote, capacityNote, details. */
  customFields: string[];
}

/** English text with the Italian as fallback, like the site; and the other way round for a card written only in English. */
function inLocale(locale: Locale, it: string | undefined, en: string | undefined): string | undefined {
  return locale === 'en' ? (en ?? it) : (it ?? en);
}

function demoAlt(id: string, locale: Locale): string | undefined {
  return (demoMedia as Record<string, Record<Locale, string>>)[id]?.[locale];
}

/**
 * The card as it is shown (D61): resolved FIELD BY FIELD, the custom field
 * where there is one, the platform default elsewhere. An English description
 * left empty falls back on the Italian, like the site does.
 */
export function resolveTypeCard(type: TypeCardType, content: TypeCardContent | null, locale: Locale): ResolvedTypeCard {
  const defaults = defaultTypeCards[type.mark];
  const customFields: string[] = [];
  const custom = <T>(field: string, value: T | undefined): T | undefined => {
    if (value === undefined) return undefined;
    customFields.push(field);
    return value;
  };

  const title = custom('title', content?.title) ?? type.name;
  const description =
    (content?.descriptionIt !== undefined || content?.descriptionEn !== undefined
      ? custom('description', inLocale(locale, content.descriptionIt, content.descriptionEn))
      : undefined) ?? (locale === 'en' ? defaults.descriptionEn : defaults.descriptionIt);
  const photos: ResolvedTypeCardPhoto[] = custom(
    'photos',
    content?.photos?.map((photo) => {
      const caption = inLocale(locale, photo.captionIt, photo.captionEn) ?? null;
      return { src: demoImageSrc(photo.id as DemoMediaId), alt: demoAlt(photo.id, locale) ?? caption ?? title, caption };
    }),
  ) ?? [{ src: defaults.photo, alt: locale === 'en' ? defaults.descriptionEn : defaults.descriptionIt, caption: null }];
  const equipmentNote =
    custom('equipmentNote', content?.equipmentNote ? inLocale(locale, content.equipmentNote.it, content.equipmentNote.en) : undefined) ??
    (locale === 'en' ? defaults.equipmentNoteEn : defaults.equipmentNoteIt);
  const capacityNote =
    custom('capacityNote', content?.capacityNote ? inLocale(locale, content.capacityNote.it, content.capacityNote.en) : undefined) ??
    (locale === 'en' ? defaults.tipEn : defaults.tipIt) ??
    null;
  const details =
    custom(
      'details',
      content?.details?.map((detail) => ({
        label: inLocale(locale, detail.labelIt, detail.labelEn)!,
        value: inLocale(locale, detail.valueIt, detail.valueEn)!,
      })),
    ) ?? [];

  return {
    title,
    description,
    photos,
    equipmentNote,
    capacityNote,
    details,
    umbrellas: type.umbrellas,
    sunbeds: type.sunbeds,
    maxGuests: type.maxGuests,
    customized: customFields.length > 0,
    customFields,
  };
}
