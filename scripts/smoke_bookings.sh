#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
OWNER_TOKEN="${OWNER_TOKEN:-}"
DRIVER_TOKEN="${DRIVER_TOKEN:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl no esta instalado"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ node no esta instalado (se usa para parsear JSON)"
  exit 1
fi

if [[ -z "$OWNER_TOKEN" || -z "$DRIVER_TOKEN" ]]; then
  echo "❌ Debes definir OWNER_TOKEN y DRIVER_TOKEN"
  echo "   Ejemplo: OWNER_TOKEN=... DRIVER_TOKEN=... BASE_URL=http://localhost:3000/api scripts/smoke_bookings.sh"
  exit 1
fi

BODY_FILE="$(mktemp)"
cleanup() {
  rm -f "$BODY_FILE"
}
trap cleanup EXIT

log() {
  echo "➡️  $*"
}

ok() {
  echo "✅ $*"
}

fail() {
  echo "❌ $*"
  exit 1
}

request() {
  local method="$1"
  local url="$2"
  local payload="${3-}"
  local token="${4-}"

  local -a curl_args
  curl_args=(-sS -o "$BODY_FILE" -w "%{http_code}" -X "$method" "$url")

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$payload" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$payload")
  fi

  HTTP_CODE="$(curl "${curl_args[@]}")"
  BODY="$(cat "$BODY_FILE")"
}

expect_status() {
  local expected="$1"
  local context="$2"

  if [[ "$HTTP_CODE" != "$expected" ]]; then
    echo "----"
    echo "Error en: $context"
    echo "Esperado HTTP: $expected"
    echo "Recibido HTTP: $HTTP_CODE"
    echo "Body: $BODY"
    echo "----"
    fail "$context"
  fi
}

json_field() {
  local field="$1"
  node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const j=JSON.parse(raw);const v=j['$field'];if(v===undefined||v===null){process.exit(2)};process.stdout.write(String(v));" 2>/dev/null
}

json_count() {
  node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const j=JSON.parse(raw);if(!Array.isArray(j)){process.exit(2)};process.stdout.write(String(j.length));" 2>/dev/null
}

UNIQUE_SUFFIX="$(date +%s)"
LICENSE_PLATE="BK${UNIQUE_SUFFIX: -6}AA"

WINDOW_START="2030-06-10T09:00:00Z"
WINDOW_END="2030-06-25T20:00:00Z"
BOOKING_START="2030-06-12T10:00:00Z"
BOOKING_END="2030-06-15T10:00:00Z"

log "Comprobando health del backend"
request "GET" "$BASE_URL/health"
expect_status "200" "GET /health"
ok "Backend disponible en $BASE_URL"

log "Validando sesion owner con /users/me"
request "GET" "$BASE_URL/users/me" "" "$OWNER_TOKEN"
expect_status "200" "GET /users/me (owner)"
OWNER_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer OWNER_ID"
ok "Owner autenticado: $OWNER_ID"

log "Validando sesion driver con /users/me"
request "GET" "$BASE_URL/users/me" "" "$DRIVER_TOKEN"
expect_status "200" "GET /users/me (driver)"
DRIVER_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer DRIVER_ID"
ok "Driver autenticado: $DRIVER_ID"

if [[ "$OWNER_ID" == "$DRIVER_ID" ]]; then
  fail "OWNER_TOKEN y DRIVER_TOKEN pertenecen al mismo usuario"
fi

log "Creando vehiculo de prueba como owner"
request "POST" "$BASE_URL/vehicles" "{\"brand\":\"Toyota\",\"model\":\"Corolla\",\"year\":2020,\"licensePlate\":\"$LICENSE_PLATE\",\"description\":\"Booking smoke vehicle\",\"pricePerDay\":60,\"locationLat\":40.4168,\"locationLng\":-3.7038,\"locationAddress\":\"Madrid Centro\",\"fuelType\":\"hybrid\",\"transmission\":\"automatic\",\"seats\":5,\"status\":\"active\"}" "$OWNER_TOKEN"
expect_status "201" "POST /vehicles"
VEHICLE_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer VEHICLE_ID"
ok "Vehiculo creado: $VEHICLE_ID"

log "Creando ventana de disponibilidad para el vehiculo"
request "POST" "$BASE_URL/vehicle-availability-windows" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"$WINDOW_START\",\"endDatetime\":\"$WINDOW_END\"}" "$OWNER_TOKEN"
expect_status "201" "POST /vehicle-availability-windows"
WINDOW_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer WINDOW_ID"
ok "Ventana creada: $WINDOW_ID"

log "Creando booking como driver"
request "POST" "$BASE_URL/bookings" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"$BOOKING_START\",\"endDatetime\":\"$BOOKING_END\"}" "$DRIVER_TOKEN"
expect_status "201" "POST /bookings"
BOOKING_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer BOOKING_ID"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status"
if [[ "$BOOKING_STATUS" != "pending" ]]; then
  fail "El booking deberia crearse en pending y llego: $BOOKING_STATUS"
fi
ok "Booking creado: $BOOKING_ID (pending)"

log "Listando bookings del driver"
request "GET" "$BASE_URL/bookings/mine/as-driver" "" "$DRIVER_TOKEN"
expect_status "200" "GET /bookings/mine/as-driver"
DRIVER_BOOKINGS_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta de as-driver no es array"
if [[ "$DRIVER_BOOKINGS_COUNT" -lt 1 ]]; then
  fail "Se esperaba >=1 booking para driver"
fi
ok "Listado as-driver correcto ($DRIVER_BOOKINGS_COUNT)"

log "Listando bookings del owner"
request "GET" "$BASE_URL/bookings/mine/as-owner" "" "$OWNER_TOKEN"
expect_status "200" "GET /bookings/mine/as-owner"
OWNER_BOOKINGS_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta de as-owner no es array"
if [[ "$OWNER_BOOKINGS_COUNT" -lt 1 ]]; then
  fail "Se esperaba >=1 booking para owner"
fi
ok "Listado as-owner correcto ($OWNER_BOOKINGS_COUNT)"

log "[negativo] Owner no puede crear booking sobre su propio vehiculo"
request "POST" "$BASE_URL/bookings" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"$BOOKING_START\",\"endDatetime\":\"$BOOKING_END\"}" "$OWNER_TOKEN"
expect_status "400" "POST /bookings own-vehicle"
ok "Regla de no auto-reserva validada"

log "Owner acepta booking (requiere ownerContactMethod)"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"accepted\",\"ownerContactMethod\":\"whatsapp:+34600111222\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status accepted"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras accepted"
if [[ "$BOOKING_STATUS" != "accepted" ]]; then
  fail "Estado esperado accepted y llego: $BOOKING_STATUS"
fi
ok "Booking aceptado"

log "Driver confirma pago (simulado) -> paid_confirmed"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"paid_confirmed\"}" "$DRIVER_TOKEN"
expect_status "200" "PUT /bookings/:id/status paid_confirmed"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras paid_confirmed"
if [[ "$BOOKING_STATUS" != "paid_confirmed" ]]; then
  fail "Estado esperado paid_confirmed y llego: $BOOKING_STATUS"
fi
ok "Booking en paid_confirmed"

log "Owner marca in_progress"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"in_progress\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status in_progress"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras in_progress"
if [[ "$BOOKING_STATUS" != "in_progress" ]]; then
  fail "Estado esperado in_progress y llego: $BOOKING_STATUS"
fi
ok "Booking en in_progress"

log "Owner marca completed"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"completed\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status completed"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras completed"
if [[ "$BOOKING_STATUS" != "completed" ]]; then
  fail "Estado esperado completed y llego: $BOOKING_STATUS"
fi
ok "Booking completado"

echo
echo "🎉 Smoke tests de bookings completados correctamente"
echo "   vehicleId usado: $VEHICLE_ID"
echo "   windowId usado: $WINDOW_ID"
echo "   bookingId usado: $BOOKING_ID"
