import { writeFile } from 'node:fs/promises';
import { logProvider } from '@ombre/comms';
import { connect, processOutbox, runMaintenance } from '@ombre/db';
import { config } from '@ombre/shared';
import { createHandler } from './handlers';

const url = process.env.OMBRE_DB_URL;
const signingSecret = process.env.OMBRE_SIGNING_SECRET ?? '';
if (!url || signingSecret.length < 32) {
  console.error('OMBRE_DB_URL and OMBRE_SIGNING_SECRET (at least 32 characters) are required');
  process.exit(1);
}

const providerName = process.env.OMBRE_MAIL_PROVIDER ?? 'none';
if (providerName !== 'none' && providerName !== 'log') {
  console.error('OMBRE_MAIL_PROVIDER must be "none" or "log": no real mail provider is configured yet');
  process.exit(1);
}

const intervalMs = Math.max(1, Number(process.env.OMBRE_WORKER_INTERVAL_SECONDS ?? '15')) * 1000;
const heartbeat = process.env.OMBRE_WORKER_HEARTBEAT ?? '/tmp/ombre-worker-heartbeat';
const connection = connect(url, { max: 4 });
const handle = createHandler({
  db: connection.db,
  brand: config.brandName,
  siteUrl: config.siteUrl,
  signingSecret,
  mail: providerName === 'log' ? logProvider : null,
});

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function round(): Promise<void> {
  try {
    const maintenance = await runMaintenance(connection.db);
    const queue = await processOutbox(connection.db, handle);
    if (maintenance.holdsReleased || maintenance.daysClosed || queue.done || queue.failed) {
      console.log(JSON.stringify({ ...maintenance, ...queue }));
    }
    await writeFile(heartbeat, new Date().toISOString());
  } catch (error) {
    console.error('Worker round failed', error);
  }
  if (!stopping) timer = setTimeout(() => void round(), intervalMs);
}

function shutdown(): void {
  stopping = true;
  if (timer) clearTimeout(timer);
  void connection.close().then(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`Ombrè worker started: every ${intervalMs / 1000}s, mail provider "${providerName}"`);
void round();
