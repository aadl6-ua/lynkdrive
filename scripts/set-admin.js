// Concede o retira el rol de administración del backoffice a un usuario existente.
// Uso: npm run admin:set -- <email> [--revoke]
// Usa DATABASE_URL del entorno o, si no existe, la de apps/api/.env.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(__dirname, '../apps/api/.env');
  const line = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='))
    : undefined;

  if (!line) {
    throw new Error('DATABASE_URL not found (env var or apps/api/.env)');
  }

  return line.slice('DATABASE_URL='.length);
}

async function run() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((arg) => !arg.startsWith('--'));

  if (!email) {
    throw new Error('Usage: npm run admin:set -- <email> [--revoke]');
  }

  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const result = await client.query(
      `UPDATE public.users u SET is_admin = $2
       FROM auth.users au
       WHERE au.id = u.id AND lower(au.email) = lower($1) AND u.deleted_at IS NULL
       RETURNING u.id`,
      [email, !revoke]
    );

    if (result.rowCount === 0) {
      throw new Error(`No active user found with email ${email}. Register in the app first.`);
    }

    console.log(`${revoke ? 'Revoked' : 'Granted'} admin role for ${email} (${result.rows[0].id}).`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
