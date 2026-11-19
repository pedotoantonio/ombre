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
 * The texts are the editor's DEFINITIVE ones (docs/testi-schede-tipi.md),
 * reviewed by the usability expert on 19/11/2026: honest, valid for any club,
 * never stating equipment or capacity the type's own data carries. The tip is
 * deliberately absent for umbrella, sunbed and canopy.
 */
export const defaultTypeCards: Record<SpotMark, DefaultTypeCard> = {
  umbrella: {
    descriptionIt: 'Una postazione con un ombrellone, che fa ombra a chi sta sotto. È la stessa per tutta la prenotazione, anche se scegli un periodo di più giornate.',
    descriptionEn: 'A spot with an umbrella, giving shade to those underneath. It is the same spot for the whole booking, even if you choose a period of several days.',
    equipmentNoteIt: 'Di norma un ombrellone con lettini o sdraio, come indicato nella dotazione della postazione.',
    equipmentNoteEn: 'Usually an umbrella with sunbeds or deck chairs, as listed in the spot\'s equipment.',
    photo: typePhoto('umbrella'),
  },
  sunbed: {
    descriptionIt: 'Un lettino singolo per stare distesi. L\'ombra non è compresa, salvo dove indicato.',
    descriptionEn: 'A single sunbed to lie on. Shade is not included unless stated.',
    equipmentNoteIt: 'Di norma un solo lettino, senza ombrellone.',
    equipmentNoteEn: 'Usually one sunbed, without an umbrella.',
    photo: typePhoto('sunbed'),
  },
  deckchair: {
    descriptionIt: 'Una sdraio: una sedia con lo schienale reclinabile, per stare seduti più che distesi. Si prenota da sola, come una postazione a sé.',
    descriptionEn: 'A deck chair: a chair with a reclining back, for sitting rather than lying flat. It is booked on its own, as a spot in itself.',
    equipmentNoteIt: 'Di norma una sdraio; l\'ombrellone c\'è dove indicato.',
    equipmentNoteEn: 'Usually one deck chair; an umbrella is included where stated.',
    tipIt: 'Adatta a chi preferisce stare seduto, per esempio per leggere o chiacchierare.',
    tipEn: 'Suits those who prefer to sit, for example to read or chat.',
    photo: typePhoto('deckchair'),
  },
  gazebo: {
    descriptionIt: 'Una struttura con il tetto, di norma aperta sui lati, che copre più spazio di un ombrellone. Dà ombra e un po\' di riparo a più persone insieme.',
    descriptionEn: 'A structure with a roof, usually open at the sides, covering more space than an umbrella. It gives shade and some cover to several people together.',
    equipmentNoteIt: 'Di norma lettini o sedute sotto il tetto; il resto, dove indicato.',
    equipmentNoteEn: 'Usually sunbeds or seats under the roof; anything else where stated.',
    tipIt: 'Per gruppi e famiglie: controlla quanti ospiti può contenere.',
    tipEn: 'For groups and families: check how many guests it holds.',
    photo: typePhoto('gazebo'),
  },
  tent: {
    descriptionIt: 'Una tenda con pareti di stoffa, di norma aperta davanti. Ripara dal sole e in parte dal vento, e dà un angolo più riservato.',
    descriptionEn: 'A tent with fabric walls, usually open at the front. It shelters from the sun and partly from the wind, and gives a more private corner.',
    equipmentNoteIt: 'Di norma lettini o sedute dentro la tenda; il resto, dove indicato.',
    equipmentNoteEn: 'Usually sunbeds or seats inside the tent; anything else where stated.',
    tipIt: 'Utile se cerchi più riparo dal sole, per esempio con bambini piccoli.',
    tipEn: 'Useful if you want more shelter from the sun, for example with small children.',
    photo: typePhoto('tent'),
  },
  daybed: {
    descriptionIt: 'Un lettone: un letto largo con materasso, per stare distesi o seduti in più persone. Occupa più spazio di un lettino singolo.',
    descriptionEn: 'A daybed: a wide bed with a mattress, for lying or sitting with several people. It takes up more room than a single sunbed.',
    equipmentNoteIt: 'Di norma il lettone con il suo materasso; ombrellone o copertura, dove indicato.',
    equipmentNoteEn: 'Usually the daybed with its mattress; an umbrella or cover where stated.',
    tipIt: 'Prima di prenotare controlla quanti ospiti può contenere.',
    tipEn: 'Before booking, check how many guests it holds.',
    photo: typePhoto('daybed'),
  },
  canopy: {
    descriptionIt: 'Un telo teso su pali, senza pareti. Fa ombra su un\'area più ampia di un ombrellone ma resta aperto da ogni lato, quindi ripara dal sole più che dal vento.',
    descriptionEn: 'A canvas sheet stretched over poles, without walls. It shades a larger area than an umbrella but stays open on every side, so it shelters from the sun more than from the wind.',
    equipmentNoteIt: 'Di norma lettini o sedute sotto il telo; il resto, dove indicato.',
    equipmentNoteEn: 'Usually sunbeds or seats under the sheet; anything else where stated.',
    photo: typePhoto('canopy'),
  },
  canoe: {
    descriptionIt: 'Una canoa che si muove con la pagaia, per una o più persone. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido.',
    descriptionEn: 'A canoe moved with a paddle, for one or more people. You book the craft for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club.',
    equipmentNoteIt: 'Di norma la canoa con le pagaie; il giubbotto di salvataggio, dove indicato.',
    equipmentNoteEn: 'Usually the canoe with paddles; a life jacket where stated.',
    tipIt: 'Controlla quanti ospiti può portare.',
    tipEn: 'Check how many guests it carries.',
    photo: typePhoto('canoe'),
  },
  sup: {
    descriptionIt: 'Il SUP (stand up paddle) è una tavola su cui si sta in piedi o in ginocchio, spingendosi con una pagaia. Prenoti la tavola per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido.',
    descriptionEn: 'A SUP (stand up paddle) is a board you stand or kneel on, pushing yourself along with a paddle. You book the board for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club.',
    equipmentNoteIt: 'Di norma la tavola con la pagaia; il giubbotto di salvataggio, dove indicato.',
    equipmentNoteEn: 'Usually the board with a paddle; a life jacket where stated.',
    tipIt: 'Richiede un po\' di equilibrio: se è la prima volta, chiedi consiglio al lido.',
    tipEn: 'It takes some balance: if it is your first time, ask the beach club for advice.',
    photo: typePhoto('sup'),
  },
  pedalo: {
    descriptionIt: 'Un pedalò è un\'imbarcazione che si muove pedalando, stando seduti. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Dove e come uscire in acqua lo decide il lido.',
    descriptionEn: 'A pedal boat moves by pedalling, and you stay seated. You book the craft for the day or period you choose, not a place on the beach. Where and how to go out on the water is up to the beach club.',
    equipmentNoteIt: 'Di norma il pedalò; il giubbotto di salvataggio, dove indicato.',
    equipmentNoteEn: 'Usually the pedal boat; a life jacket where stated.',
    tipIt: 'Per stare in acqua senza pagaiare: controlla quanti ospiti può portare.',
    tipEn: 'For being on the water without paddling: check how many guests it carries.',
    photo: typePhoto('pedalo'),
  },
  jetski: {
    descriptionIt: 'Una moto d\'acqua è un mezzo a motore che si guida con un manubrio, per una o più persone. Prenoti il mezzo per la giornata o il periodo che scegli, non un posto in spiaggia. Chi può guidarla, con quali documenti e in quali zone, dipende dalla legge e dal lido.',
    descriptionEn: 'A jet ski is a motorised craft steered with handlebars, for one or more people. You book the craft for the day or period you choose, not a place on the beach. Who may ride it, with what documents and in which areas, depends on the law and on the beach club.',
    equipmentNoteIt: 'Di norma la moto d\'acqua; il giubbotto di salvataggio, dove indicato.',
    equipmentNoteEn: 'Usually the jet ski; a life jacket where stated.',
    tipIt: 'Prima di prenotare chiedi al lido che cosa serve per guidarla.',
    tipEn: 'Before booking, ask the beach club what you need to ride it.',
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
