import path from 'node:path';
import type { NextConfig } from 'next';

const indexable = process.env.OMBRE_INDEXABLE === 'true';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@ombre/shared', '@ombre/ui'],
  poweredByHeader: false,
  reactStrictMode: true,

  // Italian is the default language and has no prefix: "/it/..." must never be a second address.
  async redirects() {
    return [
      { source: '/it', destination: '/', permanent: true },
      { source: '/it/:path*', destination: '/:path*', permanent: true },
    ];
  },

  async rewrites() {
    return [
      { source: '/', destination: '/it' },
      { source: '/:slug((?!(?:it|en|_next|api)$)[^/.]+)', destination: '/it/:slug' },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        // Crawlers must be able to read the noindex instruction, so it is sent as a header
        // instead of blocking the whole site in robots.txt.
        headers: indexable ? securityHeaders : [...securityHeaders, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
