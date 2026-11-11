import { serve } from '@hono/node-server';
import { connect } from '@ombre/db';
import { createApp } from './app';

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

const connection = connect(url);
const app = createApp({
  db: connection.db,
  holdSeconds: Math.round(holdMinutes * 60),
  signingSecret,
  sandboxWebhookSecret: process.env.OMBRE_SANDBOX_WEBHOOK_SECRET || undefined,
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
