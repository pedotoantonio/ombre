import { serve } from '@hono/node-server';
import { connect } from '@ombre/db';
import { config } from '@ombre/shared';
import { createApp, type AppOptions } from './app';

const url = process.env.OMBRE_DB_URL;
if (!url) {
  console.error('OMBRE_DB_URL is required');
  process.exit(1);
}

const holdMinutes = Number(process.env.OMBRE_HOLD_MINUTES ?? '10');
if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
  console.error('OMBRE_HOLD_MINUTES must be a positive number');
  process.exit(1);
}

const signingSecret = process.env.OMBRE_SIGNING_SECRET ?? '';
if (signingSecret.length < 32) {
  console.error('OMBRE_SIGNING_SECRET must be at least 32 characters long');
  process.exit(1);
}

// Sign-in with an external identity (D48): "test" for the local consent page,
// "google" with the client's real keys, empty for no link at all.
const oidcProvider = process.env.OMBRE_OIDC_PROVIDER?.trim() ?? '';
let oidc: AppOptions['oidc'];
if (oidcProvider === 'test') {
  const testSecret = process.env.OMBRE_OIDC_TEST_SECRET ?? '';
  if (testSecret.length < 16) {
    console.error('OMBRE_OIDC_TEST_SECRET (at least 16 characters) is required with OMBRE_OIDC_PROVIDER=test');
    process.exit(1);
  }
  oidc = { provider: 'test', testSecret };
} else if (oidcProvider === 'google') {
  const clientId = process.env.OMBRE_GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.OMBRE_GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    console.error('OMBRE_GOOGLE_CLIENT_ID and OMBRE_GOOGLE_CLIENT_SECRET are required with OMBRE_OIDC_PROVIDER=google');
    process.exit(1);
  }
  // The website page that receives the provider's redirect (spec D48).
  const redirectUrl = process.env.OMBRE_OIDC_REDIRECT_URL?.trim() || `${config.siteUrl}/azioni/oidc-ritorno`;
  oidc = { provider: 'google', clientId, clientSecret, redirectUrl };
} else if (oidcProvider !== '') {
  console.error('OMBRE_OIDC_PROVIDER must be empty, "test" or "google"');
  process.exit(1);
}

const connection = connect(url);
const app = createApp({
  db: connection.db,
  holdSeconds: Math.round(holdMinutes * 60),
  signingSecret,
  sandboxWebhookSecret: process.env.OMBRE_SANDBOX_WEBHOOK_SECRET || undefined,
  // The /paga/{token} links in the payment request messages point at the website.
  siteUrl: config.siteUrl,
  requireTwoFactor: process.env.OMBRE_REQUIRE_2FA === 'true',
  brand: process.env.OMBRE_BRAND_NAME || undefined,
  oidc,
});
const port = Number(process.env.PORT ?? '3211');
const server = serve({ fetch: app.fetch, port, hostname: process.env.HOSTNAME ?? '0.0.0.0' }, () => {
  console.log(`Ombrè API listening on port ${port}`);
});

function shutdown(): void {
  server.close(() => {
    void connection.close().then(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
