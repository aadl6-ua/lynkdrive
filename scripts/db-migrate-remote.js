const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(__dirname, '../apps/api/.env');

  if (!fs.existsSync(envPath)) {
    throw new Error('DATABASE_URL not found and apps/api/.env is missing');
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const match = lines.find((line) => line.startsWith('DATABASE_URL='));

  if (!match) {
    throw new Error('DATABASE_URL not found in apps/api/.env');
  }

  return match.slice('DATABASE_URL='.length);
}

function getMigrationFiles() {
  const migrationsDir = path.resolve(__dirname, '../infra/db/migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      file,
      absolutePath: path.join(migrationsDir, file)
    }));
}

async function run() {
  const databaseUrl = getDatabaseUrl();
  const files = getMigrationFiles();

  if (files.length === 0) {
    console.log('No SQL migrations found.');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.app_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query('SELECT filename FROM public.app_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const pending = files.filter(({ file }) => !applied.has(file));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    for (const migration of pending) {
      const sql = fs.readFileSync(migration.absolutePath, 'utf8');

      console.log(`Applying migration: ${migration.file}`);
      await client.query(sql);
      await client.query('INSERT INTO public.app_migrations(filename) VALUES ($1)', [migration.file]);
      console.log(`Applied migration: ${migration.file}`);
    }

    console.log(`Done. Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
