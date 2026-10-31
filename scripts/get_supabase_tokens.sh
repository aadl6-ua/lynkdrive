#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl no esta instalado"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ node no esta instalado (se usa para parsear JSON)"
  exit 1
fi

: "${SUPABASE_URL:?Falta SUPABASE_URL (ej: https://xxx.supabase.co)}"
: "${SUPABASE_ANON_KEY:?Falta SUPABASE_ANON_KEY}"
: "${OWNER_EMAIL:?Falta OWNER_EMAIL}"
: "${OWNER_PASSWORD:?Falta OWNER_PASSWORD}"
: "${DRIVER_EMAIL:?Falta DRIVER_EMAIL}"
: "${DRIVER_PASSWORD:?Falta DRIVER_PASSWORD}"

login_and_get_token() {
  local email="$1"
  local password="$2"

  local response
  # El cuerpo va por stdin para que la contrasena no aparezca en la lista de procesos.
  response="$(EMAIL="$email" PASSWORD="$password" node -e "process.stdout.write(JSON.stringify({email:process.env.EMAIL,password:process.env.PASSWORD}))" \
    | curl -sS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    --data-binary @-)"

  local token
  token="$(printf '%s' "$response" | node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const j=JSON.parse(raw);if(!j.access_token){process.stderr.write('Login fallido: '+(j.error_description||j.msg||j.error||'respuesta sin access_token')+'\\n');process.exit(1);}process.stdout.write(j.access_token);")"

  printf '%s' "$token"
}

OWNER_TOKEN="$(login_and_get_token "$OWNER_EMAIL" "$OWNER_PASSWORD")"
DRIVER_TOKEN="$(login_and_get_token "$DRIVER_EMAIL" "$DRIVER_PASSWORD")"

if [[ -z "$OWNER_TOKEN" || -z "$DRIVER_TOKEN" ]]; then
  echo "❌ No se pudieron obtener ambos tokens"
  exit 1
fi

if [[ "$OWNER_TOKEN" == "$DRIVER_TOKEN" ]]; then
  echo "⚠️  OWNER_TOKEN y DRIVER_TOKEN son identicos. Revisa emails/usuarios."
fi

echo "✅ Tokens obtenidos"
echo
echo "# Ejecuta esto en tu shell actual para exportarlos:"
echo "export OWNER_TOKEN='$OWNER_TOKEN'"
echo "export DRIVER_TOKEN='$DRIVER_TOKEN'"
echo
echo "# Luego lanza el smoke:"
echo "BASE_URL=\"http://localhost:3000/api\" ./scripts/smoke_bookings.sh"
