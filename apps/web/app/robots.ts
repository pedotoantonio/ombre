import type { MetadataRoute } from 'next';
import { config } from '@ombre/shared';

// Reserved areas are protected by authentication: this list only saves crawl budget.
const reserved = ['/account', '/stagionale', '/gestione', '/console', '/checkout', '/anteprima'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: reserved.flatMap((path) => [path, `/en${path}`]) },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
