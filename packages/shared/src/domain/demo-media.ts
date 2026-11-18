import type { Locale } from '../i18n/routes';
import type { SiteImage } from './site';

/**
 * Sample pictures shipped with the product for demonstrations: real photographs
 * with free, verified licenses (sources and licenses in docs/immagini-reali.md, D43).
 * Beach clubs will bring their own pictures with media upload.
 */
export const demoMedia = {
  copertina: { it: 'La spiaggia dall\'alto, con le file di ombrelloni e il mare', en: 'The beach from above, with rows of umbrellas and the sea' },
  ombrelloni: { it: 'File di ombrelloni e lettini viste dall\'alto', en: 'Rows of umbrellas and sunbeds seen from above' },
  chiosco: { it: 'Il chiosco bar sulla sabbia, tra le palme e gli ombrelloni', en: 'The beach bar on the sand, among palms and umbrellas' },
  passerella: { it: 'Passerella in legno tra le dune verso il mare', en: 'Wooden walkway through the dunes to the sea' },
  giochi: { it: 'Area giochi per bambini sulla sabbia', en: 'Children\'s play area on the sand' },
  tramonto: { it: 'Ombrelloni chiusi nella luce bassa sul mare', en: 'Closed umbrellas in low light over the sea' },
  docce: { it: 'La doccia sulla spiaggia, in riva al mare', en: 'The beach shower by the water\'s edge' },
  riva: { it: 'La battigia con un\'onda e la sua schiuma', en: 'The water\'s edge with a wave and its foam' },
  dune: { it: 'Dune di sabbia con il mare sullo sfondo', en: 'Sand dunes with the sea behind' },
} as const satisfies Record<string, Record<Locale, string>>;

export type DemoMediaId = keyof typeof demoMedia;

/** The one place that knows where a demo picture lives and in which format. */
export function demoImageSrc(id: DemoMediaId): string {
  return `/demo/${id}.jpg`;
}

export function demoImage(id: DemoMediaId, locale: Locale): SiteImage {
  return { src: demoImageSrc(id), alt: demoMedia[id][locale] };
}
