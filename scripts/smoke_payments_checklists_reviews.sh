#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api}"
OWNER_TOKEN="${OWNER_TOKEN:-}"
DRIVER_TOKEN="${DRIVER_TOKEN:-}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl no esta instalado"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node no esta instalado (se usa para parsear JSON)"
  exit 1
fi

if [[ -z "$OWNER_TOKEN" || -z "$DRIVER_TOKEN" ]]; then
  echo "ERROR: Debes definir OWNER_TOKEN y DRIVER_TOKEN"
  echo "Ejemplo: OWNER_TOKEN=... DRIVER_TOKEN=... BASE_URL=http://localhost:3000/api ./scripts/smoke_payments_checklists_reviews.sh"
  exit 1
fi

BODY_FILE="$(mktemp)"
cleanup() {
  rm -f "$BODY_FILE"
}
trap cleanup EXIT

log() {
  echo "-> $*"
}

ok() {
  echo "OK: $*"
}

fail() {
  echo "ERROR: $*"
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

confirm_stripe_intent_if_needed() {
  local payment_intent_id="$1"

  if [[ -z "$STRIPE_SECRET_KEY" ]]; then
    fail "El payment intent requiere metodo de pago y no hay STRIPE_SECRET_KEY para confirmar en Stripe"
  fi

  local stripe_code
  stripe_code="$(curl -sS -o "$BODY_FILE" -w "%{http_code}" \
    -X POST "https://api.stripe.com/v1/payment_intents/$payment_intent_id/confirm" \
    -u "$STRIPE_SECRET_KEY:" \
    -d payment_method=pm_card_visa \
    --data-urlencode return_url=https://example.com/stripe-return)"
  BODY="$(cat "$BODY_FILE")"

  if [[ "$stripe_code" != "200" ]]; then
    echo "----"
    echo "Contexto: Stripe confirm payment_intent"
    echo "Esperado HTTP: 200"
    echo "Recibido HTTP: $stripe_code"
    echo "Body: $BODY"
    echo "----"
    fail "No se pudo confirmar el payment intent en Stripe"
  fi

  # En modo test con capture_method=automatic_async Stripe puede quedar en processing.
  # Esperamos brevemente hasta que llegue a succeeded para que el backend pueda confirmarlo.
  local stripe_status
  stripe_status="$(printf '%s' "$BODY" | json_field status || true)"
  if [[ "$stripe_status" == "processing" ]]; then
    local attempt=0
    while [[ $attempt -lt 10 ]]; do
      sleep 1
      stripe_code="$(curl -sS -o "$BODY_FILE" -w "%{http_code}" \
        -X GET "https://api.stripe.com/v1/payment_intents/$payment_intent_id" \
        -u "$STRIPE_SECRET_KEY:")"
      BODY="$(cat "$BODY_FILE")"
      if [[ "$stripe_code" != "200" ]]; then
        break
      fi
      stripe_status="$(printf '%s' "$BODY" | json_field status || true)"
      if [[ "$stripe_status" == "succeeded" ]]; then
        return 0
      fi
      attempt=$((attempt + 1))
    done
  fi
}

expect_status() {
  local expected="$1"
  local context="$2"

  if [[ "$HTTP_CODE" != "$expected" ]]; then
    echo "----"
    echo "Contexto: $context"
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
LICENSE_PLATE="PM${UNIQUE_SUFFIX: -6}AA"

WINDOW_START="2030-07-01T09:00:00Z"
WINDOW_END="2030-07-20T20:00:00Z"
BOOKING_START="2030-07-05T10:00:00Z"
BOOKING_END="2030-07-08T10:00:00Z"

log "Comprobando health"
request "GET" "$BASE_URL/health"
expect_status "200" "GET /health"
ok "Backend disponible"

log "Validando owner token"
request "GET" "$BASE_URL/users/me" "" "$OWNER_TOKEN"
expect_status "200" "GET /users/me owner"
OWNER_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer OWNER_ID"
ok "Owner autenticado: $OWNER_ID"

log "Validando driver token"
request "GET" "$BASE_URL/users/me" "" "$DRIVER_TOKEN"
expect_status "200" "GET /users/me driver"
DRIVER_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer DRIVER_ID"
ok "Driver autenticado: $DRIVER_ID"

if [[ "$OWNER_ID" == "$DRIVER_ID" ]]; then
  fail "OWNER_TOKEN y DRIVER_TOKEN pertenecen al mismo usuario"
fi

log "Creando vehiculo de prueba"
request "POST" "$BASE_URL/vehicles" "{\"brand\":\"Toyota\",\"model\":\"Corolla\",\"year\":2021,\"licensePlate\":\"$LICENSE_PLATE\",\"description\":\"Smoke payments/checklists/reviews\",\"pricePerDay\":75,\"locationLat\":40.4168,\"locationLng\":-3.7038,\"locationAddress\":\"Madrid Centro\",\"fuelType\":\"hybrid\",\"transmission\":\"automatic\",\"seats\":5,\"status\":\"active\"}" "$OWNER_TOKEN"
expect_status "201" "POST /vehicles"
VEHICLE_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer VEHICLE_ID"
ok "Vehiculo creado: $VEHICLE_ID"

log "Creando ventana de disponibilidad"
request "POST" "$BASE_URL/vehicle-availability-windows" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"$WINDOW_START\",\"endDatetime\":\"$WINDOW_END\"}" "$OWNER_TOKEN"
expect_status "201" "POST /vehicle-availability-windows"
WINDOW_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer WINDOW_ID"
ok "Ventana creada: $WINDOW_ID"

log "Creando booking en pending"
request "POST" "$BASE_URL/bookings" "{\"vehicleId\":\"$VEHICLE_ID\",\"startDatetime\":\"$BOOKING_START\",\"endDatetime\":\"$BOOKING_END\"}" "$DRIVER_TOKEN"
expect_status "201" "POST /bookings"
BOOKING_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer BOOKING_ID"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status"
[[ "$BOOKING_STATUS" == "pending" ]] || fail "Booking esperado pending y llego $BOOKING_STATUS"
ok "Booking creado: $BOOKING_ID"

log "Owner acepta booking"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"accepted\",\"ownerContactMethod\":\"whatsapp:+34600111222\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status accepted"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras accepted"
[[ "$BOOKING_STATUS" == "accepted" ]] || fail "Booking esperado accepted y llego $BOOKING_STATUS"
ok "Booking aceptado"

log "Consultando estado de pago"
request "GET" "$BASE_URL/payments/bookings/$BOOKING_ID" "" "$DRIVER_TOKEN"
expect_status "200" "GET /payments/bookings/:bookingId"
ok "Estado de pago consultado"

log "Creando payment intent"
request "POST" "$BASE_URL/payments/bookings/$BOOKING_ID/intent" "" "$DRIVER_TOKEN"
expect_status "201" "POST /payments/bookings/:bookingId/intent"
PAYMENT_INTENT_ID="$(printf '%s' "$BODY" | json_field paymentIntentId)" || fail "No se pudo extraer paymentIntentId"
ok "Payment intent creado/reutilizado: $PAYMENT_INTENT_ID"

log "Confirmando pago (stripe o prototipo)"
request "POST" "$BASE_URL/payments/bookings/$BOOKING_ID/confirm" "{\"paymentIntentId\":\"$PAYMENT_INTENT_ID\"}" "$DRIVER_TOKEN"
if [[ "$HTTP_CODE" == "400" && "$BODY" == *"requires_payment_method"* ]]; then
  log "Payment intent en requires_payment_method: confirmando en Stripe y reintentando"
  confirm_stripe_intent_if_needed "$PAYMENT_INTENT_ID"
  request "POST" "$BASE_URL/payments/bookings/$BOOKING_ID/confirm" "{\"paymentIntentId\":\"$PAYMENT_INTENT_ID\"}" "$DRIVER_TOKEN"
fi
expect_status "201" "POST /payments/bookings/:bookingId/confirm"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field bookingStatus)" || fail "No se pudo extraer bookingStatus tras confirmar pago"
[[ "$BOOKING_STATUS" == "paid_confirmed" ]] || fail "Booking esperado paid_confirmed y llego $BOOKING_STATUS"
ok "Pago confirmado"

log "Creando checklist check_in"
request "POST" "$BASE_URL/booking-checklists" "{\"bookingId\":\"$BOOKING_ID\",\"type\":\"check_in\",\"mileage\":10234,\"fuelLevel\":70,\"notes\":\"Entrega sin incidencias\"}" "$OWNER_TOKEN"
expect_status "201" "POST /booking-checklists"
CHECKLIST_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer CHECKLIST_ID"
ok "Checklist check_in creado: $CHECKLIST_ID"

log "Listando checklists del booking"
request "GET" "$BASE_URL/booking-checklists?bookingId=$BOOKING_ID" "" "$DRIVER_TOKEN"
expect_status "200" "GET /booking-checklists?bookingId"
CHECKLIST_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta de booking-checklists no es array"
[[ "$CHECKLIST_COUNT" -ge 1 ]] || fail "Se esperaba >=1 checklist"
ok "Checklists listados: $CHECKLIST_COUNT"

log "Creando checklist image"
request "POST" "$BASE_URL/checklist-images" "{\"checklistId\":\"$CHECKLIST_ID\",\"imageUrl\":\"supabase://checklists/smoke/$CHECKLIST_ID/photo-1.jpg\"}" "$OWNER_TOKEN"
expect_status "201" "POST /checklist-images"
CHECKLIST_IMAGE_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer CHECKLIST_IMAGE_ID"
ok "Checklist image creada: $CHECKLIST_IMAGE_ID"

log "Listando checklist images"
request "GET" "$BASE_URL/checklist-images?checklistId=$CHECKLIST_ID" "" "$DRIVER_TOKEN"
expect_status "200" "GET /checklist-images?checklistId"
CHECKLIST_IMAGES_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta de checklist-images no es array"
[[ "$CHECKLIST_IMAGES_COUNT" -ge 1 ]] || fail "Se esperaba >=1 checklist image"
ok "Checklist images listadas: $CHECKLIST_IMAGES_COUNT"

log "Owner marca in_progress"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"in_progress\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status in_progress"

log "Owner marca completed"
request "PUT" "$BASE_URL/bookings/$BOOKING_ID/status" "{\"status\":\"completed\"}" "$OWNER_TOKEN"
expect_status "200" "PUT /bookings/:id/status completed"
BOOKING_STATUS="$(printf '%s' "$BODY" | json_field status)" || fail "No se pudo extraer status tras completed"
[[ "$BOOKING_STATUS" == "completed" ]] || fail "Booking esperado completed y llego $BOOKING_STATUS"
ok "Booking completado"

log "Driver crea review al owner"
request "POST" "$BASE_URL/reviews" "{\"bookingId\":\"$BOOKING_ID\",\"revieweeId\":\"$OWNER_ID\",\"rating\":5,\"comment\":\"Todo perfecto\"}" "$DRIVER_TOKEN"
expect_status "201" "POST /reviews driver->owner"
DRIVER_REVIEW_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer DRIVER_REVIEW_ID"
ok "Review driver creada: $DRIVER_REVIEW_ID"

log "Owner crea review al driver"
request "POST" "$BASE_URL/reviews" "{\"bookingId\":\"$BOOKING_ID\",\"revieweeId\":\"$DRIVER_ID\",\"rating\":4,\"comment\":\"Entrega correcta\"}" "$OWNER_TOKEN"
expect_status "201" "POST /reviews owner->driver"
OWNER_REVIEW_ID="$(printf '%s' "$BODY" | json_field id)" || fail "No se pudo extraer OWNER_REVIEW_ID"
ok "Review owner creada: $OWNER_REVIEW_ID"

log "[negativo] Driver no puede duplicar review del mismo booking"
request "POST" "$BASE_URL/reviews" "{\"bookingId\":\"$BOOKING_ID\",\"revieweeId\":\"$OWNER_ID\",\"rating\":5,\"comment\":\"Duplicada\"}" "$DRIVER_TOKEN"
expect_status "409" "POST /reviews duplicate"
ok "Regla de unicidad de review validada"

log "Listando reviews del booking"
request "GET" "$BASE_URL/reviews?bookingId=$BOOKING_ID" "" "$OWNER_TOKEN"
expect_status "200" "GET /reviews?bookingId"
REVIEWS_COUNT="$(printf '%s' "$BODY" | json_count)" || fail "Respuesta de reviews no es array"
[[ "$REVIEWS_COUNT" -ge 2 ]] || fail "Se esperaban >=2 reviews"
ok "Reviews listadas: $REVIEWS_COUNT"

echo
echo "SMOKE completado correctamente"
echo "vehicleId: $VEHICLE_ID"
echo "windowId: $WINDOW_ID"
echo "bookingId: $BOOKING_ID"
echo "paymentIntentId: $PAYMENT_INTENT_ID"
echo "checklistId: $CHECKLIST_ID"
echo "checklistImageId: $CHECKLIST_IMAGE_ID"
echo "driverReviewId: $DRIVER_REVIEW_ID"
echo "ownerReviewId: $OWNER_REVIEW_ID"
