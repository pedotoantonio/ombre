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
  // The type-card photographs (D62), one per mark of the repertoire, kept in
  // /demo/tipi/. The `tipo-` prefix is what routes them there (demoImageSrc).
  'tipo-umbrella': { it: 'Ombrellone con due lettini in riva al mare', en: 'Beach umbrella with two sunbeds by the sea' },
  'tipo-sunbed': { it: 'Un lettino singolo sulla sabbia davanti al mare', en: 'A single sunbed on the sand facing the sea' },
  'tipo-deckchair': { it: 'Due sdraio a righe sulla sabbia', en: 'Two striped deckchairs on the sand' },
  'tipo-gazebo': { it: 'Gazebo in legno sulla spiaggia, con la passerella tra le dune', en: 'Wooden gazebo on the beach, with a boardwalk through the dunes' },
  'tipo-tent': { it: 'Tende da spiaggia a righe davanti al mare', en: 'Striped beach tents facing the sea' },
  'tipo-daybed': { it: 'Lettoni con tende bianche sulla spiaggia attrezzata', en: 'Daybeds with white canopies on an equipped beach' },
  'tipo-canopy': { it: 'Paravento a telo a righe con due sdraio', en: 'Striped fabric windbreak with two deckchairs' },
  'tipo-canoe': { it: 'Canoa con la pagaia sulla riva', en: 'Canoe with its paddle at the water\'s edge' },
  'tipo-sup': { it: 'Tavola SUP con la pagaia sulla sabbia', en: 'SUP board with its paddle on the sand' },
  'tipo-pedalo': { it: 'Pedalò rosso in riva al mare', en: 'Red pedalo at the water\'s edge' },
  'tipo-jetski': { it: 'Moto d\'acqua ferma sulla battigia', en: 'Jet ski resting at the shoreline' },
} as const satisfies Record<string, Record<Locale, string>>;

export type DemoMediaId = keyof typeof demoMedia;

/** The prefix of the type-card pictures, which live in /demo/tipi/ (D62). */
const typePrefix = 'tipo-';

/** The one place that knows where a demo picture lives and in which format. */
export function demoImageSrc(id: DemoMediaId): string {
  if (id.startsWith(typePrefix)) return `/demo/tipi/${id.slice(typePrefix.length)}.jpg`;
  return `/demo/${id}.jpg`;
}

export function demoImage(id: DemoMediaId, locale: Locale): SiteImage {
  return { src: demoImageSrc(id), alt: demoMedia[id][locale] };
}
