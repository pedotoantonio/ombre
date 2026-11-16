import type { MetadataRoute } from 'next';
import { config } from '@ombre/shared';

// Reserved areas are protected by authentication: this list only saves crawl budget.
// The public payment links are temporary and noindex: excluded here too (spec §4.3).
const reserved = ['/area', '/en/account', '/azioni', '/dati', '/paga', '/en/pay'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: reserved },
    ...(config.siteUrlConfigured ? { sitemap: `${config.siteUrl}/sitemap.xml` } : {}),
  };
}
