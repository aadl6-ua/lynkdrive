#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
OWNER_ID="${OWNER_ID:-11111111-1111-4111-8111-111111111111}"

if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl no está instalado"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ node no está instalado (se usa para parsear JSON)"
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

  if [[ -n "$payload" ]]; then
    HTTP_CODE="$(curl -sS -o "$BODY_FILE" -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "$payload")"
  else
    HTTP_CODE="$(curl -sS -o "$BODY_FILE" -w "%{http_code}" -X "$method" "$url")"
  fi

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

json_primary_count() {
  node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const j=JSON.parse(raw);if(!Array.isArray(j)){process.exit(2)};const c=j.filter(x=>x&&x.isPrimary===true).length;process.stdout.write(String(c));" 2>/dev/null
}

UNIQUE_SUFFIX="$(date +%s)"
LICENSE_PLATE="TS${UNIQUE_SUFFIX: -6}AA"

log "Comprobando health del backend"
request "GET" "$BASE_URL/health"
expect_status "200" "GET /health"
ok "Backend disponible en $BASE_URL"

log "Creando usuario demo (si existe, se tolera 409)"
request "POST" "$BASE_URL/users" "{\"id\":\"$OWNER_ID\",\"firstName\":\"Demo\",\"lastName\":\"Owner\",\"phoneNumber\":null,\"avatarUrl\":null,\"idDocumentUrl\":null,\"driverLicenseUrl\":null}"
if [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "409" ]]; then
  ok "Usuario listo ($HTTP_CODE)"
else
  fail "POST /users devolvió $HTTP_CODE. Body: $BODY"
fi

log "Creando vehículo de prueba"
request "POST" "$BASE_URL/vehicles" "{\"ownerId\":\"$OWNER_ID\",\"brand\":\"Toyota\",\"model\":\"Corolla\",\"year\":2020,\"licensePlate\":\"$LICENSE_PLATE\",\"description\":\"Vehicle smoke test\",\"pricePerDay\":45,\"locationLat\":40.4168,\"locationLng\":-3.7038,\"locationAddress\":\"Madrid Centro\",\"fuelType\":\"hybrid\",\"transmission\":\"automatic\",\"seats\":5,\"status\":\"active\"}"
expect_status "201" "POST /vehicles"
VEHICLE_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer vehicleId"
ok "Vehículo creado: $VEHICLE_ID"

log "[vehicle-images] Crear imagen principal"
request "POST" "$BASE_URL/vehicle-images" "{\"vehicleId\":\"$VEHICLE_ID\",\"imageUrl\":\"https://picsum.photos/seed/smoke-main/1200/800\",\"isPrimary\":true}"
expect_status "201" "POST /vehicle-images (main)"
IMAGE_ID_1="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer IMAGE_ID_1"
ok "Imagen principal creada: $IMAGE_ID_1"

log "[vehicle-images] Crear segunda imagen"
request "POST" "$BASE_URL/vehicle-images" "{\"vehicleId\":\"$VEHICLE_ID\",\"imageUrl\":\"https://picsum.photos/seed/smoke-side/1200/800\",\"isPrimary\":false}"
expect_status "201" "POST /vehicle-images (secondary)"
IMAGE_ID_2="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer IMAGE_ID_2"
ok "Segunda imagen creada: $IMAGE_ID_2"

log "[vehicle-images] Verificar listado por vehículo"
request "GET" "$BASE_URL/vehicle-images?vehicleId=$VEHICLE_ID"
expect_status "200" "GET /vehicle-images?vehicleId"
IMG_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta no es array de imágenes"
if [[ "$IMG_COUNT" -lt 2 ]]; then
  fail "Se esperaban >=2 imágenes y llegaron $IMG_COUNT"
fi
ok "Listado de imágenes correcto ($IMG_COUNT)"

log "[vehicle-images] Promover segunda imagen a principal"
request "PUT" "$BASE_URL/vehicle-images/$IMAGE_ID_2" "{\"isPrimary\":true}"
expect_status "200" "PUT /vehicle-images/:id"
ok "Imagen $IMAGE_ID_2 marcada como principal"

log "[vehicle-images] Verificar única principal"
request "GET" "$BASE_URL/vehicle-images?vehicleId=$VEHICLE_ID"
expect_status "200" "GET /vehicle-images?vehicleId (post-update)"
PRIMARY_COUNT="$(printf '%s' "$BODY" | json_primary_count)" || fail "No se pudo calcular primary count"
if [[ "$PRIMARY_COUNT" -ne 1 ]]; then
  fail "Se esperaba exactamente 1 imagen principal y hay $PRIMARY_COUNT"
fi
ok "Regla de única principal validada"

log "[vehicle-images] Eliminar primera imagen"
request "DELETE" "$BASE_URL/vehicle-images/$IMAGE_ID_1"
expect_status "204" "DELETE /vehicle-images/:id"
ok "Borrado de imagen OK"

log "[availability] Crear ventana 1"
request "POST" "$BASE_URL/vehicle-availability-windows" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"2026-03-10T09:00:00Z\",\"endDatetime\":\"2026-03-20T20:00:00Z\"}"
expect_status "201" "POST /vehicle-availability-windows (1)"
WINDOW_ID_1="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer WINDOW_ID_1"
ok "Ventana 1 creada: $WINDOW_ID_1"

log "[availability] Crear ventana 2"
request "POST" "$BASE_URL/vehicle-availability-windows" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"2026-04-01T08:00:00Z\",\"endDatetime\":\"2026-04-10T22:00:00Z\"}"
expect_status "201" "POST /vehicle-availability-windows (2)"
WINDOW_ID_2="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer WINDOW_ID_2"
ok "Ventana 2 creada: $WINDOW_ID_2"

log "[availability] Listar ventanas por vehículo"
request "GET" "$BASE_URL/vehicle-availability-windows?vehicleId=$VEHICLE_ID"
expect_status "200" "GET /vehicle-availability-windows?vehicleId"
WINDOW_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta no es array de ventanas"
if [[ "$WINDOW_COUNT" -lt 2 ]]; then
  fail "Se esperaban >=2 ventanas y llegaron $WINDOW_COUNT"
fi
ok "Listado de ventanas correcto ($WINDOW_COUNT)"

log "[availability] Actualizar ventana 1"
request "PUT" "$BASE_URL/vehicle-availability-windows/$WINDOW_ID_1" "{\"startDatetime\":\"2026-03-11T10:00:00Z\",\"endDatetime\":\"2026-03-21T19:00:00Z\"}"
expect_status "200" "PUT /vehicle-availability-windows/:id"
ok "Actualización de ventana OK"

log "[availability] Eliminar ventana 2"
request "DELETE" "$BASE_URL/vehicle-availability-windows/$WINDOW_ID_2"
expect_status "204" "DELETE /vehicle-availability-windows/:id"
ok "Borrado de ventana OK"

log "[negativo] Crear ventana inválida (end < start)"
request "POST" "$BASE_URL/vehicle-availability-windows" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"2026-05-20T10:00:00Z\",\"endDatetime\":\"2026-05-19T10:00:00Z\"}"
expect_status "400" "POST /vehicle-availability-windows (invalid range)"
ok "Validación de rango temporal OK"

log "[negativo] Crear imagen con vehicleId inexistente"
request "POST" "$BASE_URL/vehicle-images" "{\"vehicleId\":\"00000000-0000-4000-8000-000000000000\",\"imageUrl\":\"https://picsum.photos/seed/nope/1200/800\",\"isPrimary\":false}"
expect_status "404" "POST /vehicle-images (missing vehicle)"
ok "Validación de vehículo inexistente OK"

echo
echo "🎉 Smoke tests completados correctamente"
echo "   vehicleId usado: $VEHICLE_ID"
echo "   imageId principal actual: $IMAGE_ID_2"
echo "   windowId activo: $WINDOW_ID_1"
