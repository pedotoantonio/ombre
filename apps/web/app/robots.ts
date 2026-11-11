import type { MetadataRoute } from 'next';
import { config } from '@ombre/shared';

// Reserved areas are protected by authentication: this list only saves crawl budget.
const reserved = ['/area', '/en/account', '/azioni'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: reserved },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
