import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readdirSync, readFileSync } from 'fs';
import { SignJWT } from 'jose';
import { join } from 'path';
import { Client } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/lynkdrive_test';

const TEST_SUPABASE_URL = 'http://supabase.e2e.local';
const TEST_JWT_SECRET = 'e2e-only-secret-not-a-real-credential-0123456789';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'infra', 'db', 'migrations');

/**
 * Configura el entorno antes de cargar AppModule: BD local de tests, auth en modo
 * HS256 con un secreto de pruebas (sin credenciales reales de Supabase) y pagos
 * en modo prototipo (sin STRIPE_SECRET_KEY).
 */
export function configureTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.TYPEORM_SYNCHRONIZE = 'false';
  process.env.SUPABASE_URL = TEST_SUPABASE_URL;
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
  process.env.SUPABASE_JWT_AUDIENCE = 'authenticated';
  delete process.env.SUPABASE_JWKS_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STRIPE_SECRET_KEY;
}

/** Recrea el esquema desde cero y aplica las migraciones de infra/db/migrations en orden. */
export async function resetDatabase(): Promise<void> {
  if (/supabase\.(co|com)/i.test(TEST_DATABASE_URL)) {
    throw new Error('TEST_DATABASE_URL apunta a Supabase: los tests e2e borran el esquema, usa una BD local');
  }

  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrations) {
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Simula el alta en Supabase Auth: inserta en auth.users y deja que el trigger cree public.users. */
export async function createAuthUser(id: string, firstName: string, lastName: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      [id, `${firstName.toLowerCase()}@e2e.test`, JSON.stringify({ first_name: firstName, last_name: lastName })]
    );
    await client.query(`UPDATE public.users SET is_verified = TRUE WHERE id = $1`, [id]);
  });
}

export async function tokenFor(sub: string): Promise<string> {
  return new SignJWT({ role: 'authenticated', email: `${sub}@e2e.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(`${TEST_SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

export async function createTestApp(): Promise<INestApplication> {
  // Import diferido: AppModule debe cargarse con el entorno de tests ya configurado.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../../src/app.module');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  // Mismo pipe global que main.ts para que la validación de DTOs se pruebe igual.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: false }));
  app.setGlobalPrefix('api');
  await app.init();

  return app;
}
