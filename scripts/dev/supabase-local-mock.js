#!/usr/bin/env node
/**
 * Mock local mínimo de Supabase (Auth + Storage) para desarrollo, demos y capturas
 * sin depender de un proyecto real. NO usar en producción.
 *
 * - Auth: signup / login con contraseña / refresh / user / logout / recover y
 *   borrado admin. Los JWT se firman en HS256 con SUPABASE_JWT_SECRET, el mismo
 *   secreto que debe usar la API (modo legacy HS256 del guard).
 * - Alta: inserta en auth.users de la BD local para que el trigger cree public.users.
 *   Las contraseñas se guardan solo en memoria y con hash scrypt.
 * - Storage: guarda los ficheros en disco (MOCK_STORAGE_DIR) y sirve URLs públicas
 *   y firmadas con caducidad.
 *
 * Variables: DATABASE_URL, SUPABASE_JWT_SECRET, MOCK_SUPABASE_PORT (54321),
 * MOCK_SUPABASE_PUBLIC_URL (http://localhost:<puerto>), MOCK_STORAGE_DIR (./.mock-storage).
 */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const STORAGE_DIR = path.resolve(process.env.MOCK_STORAGE_DIR || '.mock-storage');
const ACCESS_TTL_SECONDS = 3600;
// Debe coincidir con SUPABASE_URL de la API (se valida el issuer del token).
const PUBLIC_URL = process.env.MOCK_SUPABASE_PUBLIC_URL || `http://localhost:${PORT}`;

if (!DATABASE_URL || !JWT_SECRET) {
  console.error('Faltan DATABASE_URL o SUPABASE_JWT_SECRET');
  process.exit(1);
}

if (/supabase\.(co|com)/i.test(DATABASE_URL)) {
  console.error('DATABASE_URL apunta a Supabase: este mock es solo para BD local');
  process.exit(1);
}

const db = new Client({ connectionString: DATABASE_URL });
const accounts = new Map(); // email -> { id, email, salt, hash, meta }
const refreshTokens = new Map(); // token -> userId

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return payload.exp && payload.exp * 1000 < Date.now() ? null : payload;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function toUser(account) {
  return {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: account.createdAt,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: account.meta || {},
    created_at: account.createdAt,
    updated_at: account.createdAt
  };
}

function issueSession(account) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({
    iss: `${PUBLIC_URL}/auth/v1`,
    sub: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS
  });
  const refreshToken = crypto.randomBytes(24).toString('hex');
  refreshTokens.set(refreshToken, account.id);

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TTL_SECONDS,
    expires_at: now + ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    user: toUser(account)
  };
}

function findAccountById(id) {
  for (const account of accounts.values()) {
    if (account.id === id) return account;
  }
  return null;
}

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...(isBuffer ? {} : { 'Content-Type': 'application/json' }),
    ...headers
  });
  res.end(isBuffer ? body : body === undefined ? '' : JSON.stringify(body));
}

function authError(res, status, message) {
  send(res, status, { code: status, error_code: 'mock_error', msg: message, message, error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buffer) {
  try {
    return buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
  } catch {
    return {};
  }
}

function safeObjectPath(bucket, objectPath) {
  const segments = decodeURIComponent(objectPath).split('/');
  if (!bucket || segments.some((segment) => !segment || segment === '..')) return null;
  return path.join(STORAGE_DIR, bucket, ...segments);
}

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function serveFile(res, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return send(res, 404, { error: 'not_found', message: 'Object not found' });
  const contentType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  return send(res, 200, fs.readFileSync(filePath), { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
}

async function handleAuth(req, res, url, body) {
  const route = url.pathname.replace('/auth/v1', '');

  if (route === '/signup' && req.method === 'POST') {
    const { email, password, data } = parseJson(body);
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !password) return authError(res, 400, 'Invalid email');
    if (String(password).length < 6) return authError(res, 422, 'Password should be at least 6 characters');
    if (accounts.has(normalized)) return authError(res, 422, 'User already registered');

    const account = await createAccount(normalized, password, data || {});
    return send(res, 200, issueSession(account));
  }

  if (route === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const payload = parseJson(body);

    if (grant === 'password') {
      const account = accounts.get(String(payload.email || '').trim().toLowerCase());
      if (!account || hashPassword(String(payload.password || ''), account.salt) !== account.hash) {
        return authError(res, 400, 'Invalid login credentials');
      }
      return send(res, 200, issueSession(account));
    }

    if (grant === 'refresh_token') {
      const userId = refreshTokens.get(payload.refresh_token);
      const account = userId ? findAccountById(userId) : null;
      if (!account) return authError(res, 400, 'Invalid Refresh Token');
      refreshTokens.delete(payload.refresh_token);
      return send(res, 200, issueSession(account));
    }

    return authError(res, 400, 'Unsupported grant type');
  }

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (route === '/user' && req.method === 'GET') {
    const claims = verifyJwt(bearer);
    const account = claims ? findAccountById(claims.sub) : null;
    return account ? send(res, 200, toUser(account)) : authError(res, 401, 'Invalid JWT');
  }

  if (route === '/user' && req.method === 'PUT') {
    const claims = verifyJwt(bearer);
    const account = claims ? findAccountById(claims.sub) : null;
    if (!account) return authError(res, 401, 'Invalid JWT');
    const { password, data } = parseJson(body);
    if (password) {
      if (String(password).length < 6) return authError(res, 422, 'Password should be at least 6 characters');
      account.hash = hashPassword(String(password), account.salt);
    }
    if (data) account.meta = { ...account.meta, ...data };
    return send(res, 200, toUser(account));
  }

  if (route === '/logout' && req.method === 'POST') return send(res, 204);
  if (route === '/recover' && req.method === 'POST') return send(res, 200, {});

  const adminMatch = route.match(/^\/admin\/users\/([0-9a-f-]{36})$/i);
  if (adminMatch && req.method === 'DELETE') {
    const account = findAccountById(adminMatch[1]);
    if (account) accounts.delete(account.email);
    return send(res, 200, {});
  }

  return authError(res, 404, `Ruta de auth no soportada en el mock: ${req.method} ${route}`);
}

async function createAccount(email, password, meta, fixedId) {
  const id = fixedId || crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const account = { id, email, salt, hash: hashPassword(String(password), salt), meta, createdAt: new Date().toISOString() };

  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [id, email, JSON.stringify(meta || {})]
  );
  accounts.set(email, account);
  return account;
}

async function handleStorage(req, res, url, body) {
  const route = url.pathname.replace('/storage/v1', '');

  let match = route.match(/^\/object\/public\/([^/]+)\/(.+)$/);
  if (match && req.method === 'GET') return serveFile(res, safeObjectPath(match[1], match[2]));

  match = route.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (match && req.method === 'POST') {
    const { expiresIn } = parseJson(body);
    const token = signJwt({ url: `${match[1]}/${decodeURIComponent(match[2])}`, exp: Math.floor(Date.now() / 1000) + Number(expiresIn || 60) });
    return send(res, 200, { signedURL: `/object/sign/${match[1]}/${match[2]}?token=${token}` });
  }
  if (match && req.method === 'GET') {
    const claims = verifyJwt(url.searchParams.get('token'));
    if (!claims || claims.url !== `${match[1]}/${decodeURIComponent(match[2])}`) {
      return send(res, 400, { error: 'InvalidJWT', message: 'Signed URL expired or invalid' });
    }
    return serveFile(res, safeObjectPath(match[1], match[2]));
  }

  match = route.match(/^\/object\/([^/]+)\/(.+)$/);
  if (match && (req.method === 'POST' || req.method === 'PUT')) {
    const filePath = safeObjectPath(match[1], match[2]);
    if (!filePath) return send(res, 400, { error: 'invalid_path', message: 'Invalid path' });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
    return send(res, 200, { Key: `${match[1]}/${match[2]}`, Id: crypto.randomUUID() });
  }

  match = route.match(/^\/object\/([^/]+)$/);
  if (match && req.method === 'DELETE') {
    const { prefixes = [] } = parseJson(body);
    for (const prefix of prefixes) {
      const filePath = safeObjectPath(match[1], prefix);
      if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath);
    }
    return send(res, 200, prefixes.map((name) => ({ name })));
  }

  return send(res, 404, { error: 'not_found', message: `Ruta de storage no soportada: ${req.method} ${route}` });
}

async function main() {
  await db.connect();
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Cuentas de demo predefinidas: MOCK_SEED_ACCOUNTS=email:password:uuid,...
  for (const entry of (process.env.MOCK_SEED_ACCOUNTS || '').split(',').filter(Boolean)) {
    const [email, password, id] = entry.split(':');
    await createAccount(email.toLowerCase(), password, {}, id);
  }

  http
    .createServer(async (req, res) => {
      try {
        if (req.method === 'OPTIONS') return send(res, 204);
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const body = await readBody(req);
        if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url, body);
        if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url, body);
        return send(res, 404, { message: 'Not found' });
      } catch (error) {
        console.error(error);
        return send(res, 500, { message: 'Mock error' });
      }
    })
    .listen(PORT, () => console.log(`Supabase mock escuchando en http://localhost:${PORT}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
