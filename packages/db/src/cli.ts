import path from 'node:path';
import { runMigrations, setAppPassword } from './migrate';
import { seedDemo } from './seed';

// Applies migrations, then the optional steps asked for through the environment.
const adminUrl = process.env.OMBRE_DB_ADMIN_URL;
if (!adminUrl) {
  console.error('OMBRE_DB_ADMIN_URL is required');
  process.exit(1);
}

const directory = process.env.OMBRE_MIGRATIONS_DIR ?? path.join(import.meta.dirname, '../migrations');
const applied = await runMigrations(adminUrl, directory);
console.log(applied.length ? `Migrations applied: ${applied.join(', ')}` : 'Migrations already up to date');

if (process.env.OMBRE_DB_APP_PASSWORD) {
  await setAppPassword(adminUrl, process.env.OMBRE_DB_APP_PASSWORD);
  console.log('Application role ready');
}

if (process.env.OMBRE_SEED_DEMO === 'true') {
  await seedDemo(adminUrl);
  console.log('Demo beach club ready');
}
