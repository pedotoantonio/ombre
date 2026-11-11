import type { Locale } from '../i18n/routes';
import type { SiteImage } from './site';

/**
 * Sample pictures shipped with the product for demonstrations: original illustrations,
 * not photographs of real places. Real pictures will come with media upload.
 */
export const demoMedia = {
  copertina: { it: 'Veduta della spiaggia con file di ombrelloni e il mare', en: 'View of the beach with rows of umbrellas and the sea' },
  ombrelloni: { it: 'File di ombrelloni e lettini viste dall\'alto', en: 'Rows of umbrellas and sunbeds seen from above' },
  chiosco: { it: 'Il chiosco bar con i tavolini all\'ombra', en: 'The beach bar with tables in the shade' },
  passerella: { it: 'Passerella in legno sulla sabbia fino alla prima fila', en: 'Wooden walkway across the sand to the first row' },
  giochi: { it: 'Area giochi per bambini sulla sabbia', en: 'Children\'s play area on the sand' },
  tramonto: { it: 'Tramonto sul mare con gli ombrelloni chiusi', en: 'Sunset over the sea with closed umbrellas' },
  docce: { it: 'Docce all\'aperto e cabine', en: 'Outdoor showers and changing cabins' },
  riva: { it: 'La riva con le onde, una sdraio e un telo', en: 'The water\'s edge with waves, a deckchair and a towel' },
  dune: { it: 'Dune di sabbia con il mare sullo sfondo', en: 'Sand dunes with the sea behind' },
} as const satisfies Record<string, Record<Locale, string>>;

export type DemoMediaId = keyof typeof demoMedia;

export function demoImage(id: DemoMediaId, locale: Locale): SiteImage {
  return { src: `/demo/${id}.svg`, alt: demoMedia[id][locale] };
}
