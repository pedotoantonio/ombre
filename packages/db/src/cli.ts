import path from 'node:path';
import { runMigrations, setAppPassword } from './migrate';
import { upsertUser } from './auth';
import { demoAccounts, demoHolderEmail, seedDemo } from './seed';
import { seedShowcase, showcaseCabinHolder, showcaseHolders } from './showcase';

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

if (process.env.OMBRE_ADMIN_EMAIL && process.env.OMBRE_ADMIN_PASSWORD) {
  await upsertUser(adminUrl, {
    email: process.env.OMBRE_ADMIN_EMAIL,
    name: 'Amministratore',
    password: process.env.OMBRE_ADMIN_PASSWORD,
    platformRole: 'admin',
  });
  console.log('Platform administrator ready');
}

if (process.env.OMBRE_SEED_DEMO === 'true') {
  const { beachId } = await seedDemo(adminUrl);
  console.log('Demo beach club ready');
  // Demo sign-ins exist only when a password is given: none is written in the code.
  const password = process.env.OMBRE_DEMO_PASSWORD;
  if (password) {
    for (const account of demoAccounts) {
      await upsertUser(adminUrl, { email: account.email, name: account.name, password }, [{ beachId, role: account.role }]);
    }
    await upsertUser(adminUrl, { email: demoHolderEmail, name: 'Stagionale dimostrativo', password });
    console.log('Demo accounts ready');
  }

  if (process.env.OMBRE_SEED_SHOWCASE === 'true') {
    const signingSecret = process.env.OMBRE_SIGNING_SECRET ?? '';
    if (signingSecret.length < 32) {
      console.error('OMBRE_SIGNING_SECRET (at least 32 characters) is required to create the showcase beach club');
      process.exit(1);
    }
    const showcase = await seedShowcase(adminUrl, signingSecret);
    if (password) {
      for (const account of showcaseHolders) await upsertUser(adminUrl, { email: account.email, name: account.name, password });
      // The demonstrative cabin holder signs in with the shared demo password.
      await upsertUser(adminUrl, { email: showcaseCabinHolder.email, name: showcaseCabinHolder.name, password }, [{ beachId: showcase.beachId, role: 'cabin_holder' }]);
    }
    console.log(showcase.created ? 'Showcase beach club created' : 'Showcase beach club already present');
  }
}
