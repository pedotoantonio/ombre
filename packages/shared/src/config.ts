function flag(value: string | undefined): boolean {
  return value === 'true';
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const defaultBrandName = 'Ombrè';
const brandName = clean(process.env.OMBRE_BRAND_NAME) ?? defaultBrandName;

export const config = {
  brandName,
  /** The drawn wordmark spells the default name: with another name the site shows symbol and text instead. */
  brandHasWordmark: brandName === defaultBrandName,
  siteUrl: (clean(process.env.OMBRE_SITE_URL) ?? 'http://localhost:3210').replace(/\/+$/, ''),
  /** False when no public address is configured: absolute URLs (canonical, hreflang, og:url) are then omitted. */
  siteUrlConfigured: clean(process.env.OMBRE_SITE_URL) !== null,
  indexable: flag(process.env.OMBRE_INDEXABLE),
  bookingsOpen: flag(process.env.OMBRE_BOOKINGS_OPEN),
  /** A demonstration environment: sample data and test payments. The notice at the top says so. */
  demoMode: flag(process.env.OMBRE_DEMO_MODE),
  contactEmail: clean(process.env.OMBRE_CONTACT_EMAIL),
} as const;
