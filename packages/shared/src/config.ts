function flag(value: string | undefined): boolean {
  return value === 'true';
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const config = {
  brandName: clean(process.env.OMBRE_BRAND_NAME) ?? 'Ombrè',
  siteUrl: (clean(process.env.OMBRE_SITE_URL) ?? 'http://localhost:3210').replace(/\/+$/, ''),
  indexable: flag(process.env.OMBRE_INDEXABLE),
  bookingsOpen: flag(process.env.OMBRE_BOOKINGS_OPEN),
  contactEmail: clean(process.env.OMBRE_CONTACT_EMAIL),
} as const;
