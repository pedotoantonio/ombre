export const siteTemplates = ['riviera', 'boutique', 'essential'] as const;
export type SiteTemplate = (typeof siteTemplates)[number];

/** A picture of the website: an address on this same site and its description for who cannot see it. */
export interface SiteImage {
  src: string;
  alt: string;
}

export interface SiteImages {
  cover: SiteImage | null;
  gallery: SiteImage[];
}

/** Texts of a beach club website in one language. Plain text only: no markup is accepted. */
export interface SiteTexts {
  tagline: string;
  description: string;
  services: string[];
  openingPeriod: string;
  openingHours: string;
  address: string;
  phone: string;
  accessibility: string;
  /** The pictures are the same in every language; their descriptions are translated. */
  images?: SiteImages;
}

/** Italian is always present; English only when the beach club has written it. */
export interface SiteContent {
  it: SiteTexts;
  en: SiteTexts | null;
}

export const siteTextLimits = { tagline: 120, description: 1500, service: 80, services: 20, line: 160, phone: 30, accessibility: 600 } as const;
