# Data model / Modelo de datos

Reference schema of the LynkDrive database (PostgreSQL 15 + PostGIS). It matches the TypeORM entities in `apps/api/src/*/entities`. Incremental changes on top of it live in `infra/db/migrations/` and are applied with `npm run db:migrate:remote`.

Esquema de referencia de la base de datos (PostgreSQL 15 + PostGIS). Coincide con las entidades TypeORM de `apps/api/src/*/entities`. Los cambios incrementales posteriores están en `infra/db/migrations/` y se aplican con `npm run db:migrate:remote`.

```sql
-- Extensions and enums
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE fuel_type_enum AS ENUM ('gasoline', 'diesel', 'electric', 'hybrid');
CREATE TYPE transmission_enum AS ENUM ('manual', 'automatic');
CREATE TYPE vehicle_status_enum AS ENUM ('active', 'inactive');
CREATE TYPE booking_status_enum AS ENUM (
    'pending', 'accepted', 'rejected', 'paid_confirmed',
    'in_progress', 'completed', 'cancelled'
);
CREATE TYPE checklist_type_enum AS ENUM ('check_in', 'check_out');
CREATE TYPE payout_status_enum AS ENUM ('pending', 'processing', 'paid', 'failed');

-- 1. Users (id = auth.users.id)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) UNIQUE,
    avatar_url VARCHAR(255),
    id_document_url VARCHAR(255),
    driver_license_url VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    stripe_customer_id VARCHAR(100),
    stripe_account_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 2. Vehicles
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    price_per_day NUMERIC(10, 2) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    location_address VARCHAR(255) NOT NULL,
    fuel_type fuel_type_enum,
    transmission transmission_enum,
    seats INTEGER,
    status vehicle_status_enum DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_vehicles_location ON vehicles USING GIST(location);

-- 3. Vehicle images
CREATE TABLE vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Availability windows (whitelist)
CREATE TABLE vehicle_availability_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_dates CHECK (end_datetime >= start_datetime)
);

CREATE INDEX idx_availability_dates ON vehicle_availability_windows(start_datetime, end_datetime);

-- 5. Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    price_per_day_at_booking NUMERIC(10, 2) NOT NULL,
    platform_fee NUMERIC(10, 2) DEFAULT 0 NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    status booking_status_enum DEFAULT 'pending' NOT NULL,
    payment_intent_id VARCHAR(100),
    stripe_transfer_id VARCHAR(100),
    payout_status payout_status_enum DEFAULT 'pending' NOT NULL,
    owner_contact_method VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_times CHECK (end_datetime > start_datetime)
);

-- 6. Check-in / check-out checklists
CREATE TABLE booking_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    type checklist_type_enum NOT NULL,
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    mileage INTEGER NOT NULL,
    fuel_level INTEGER NOT NULL CHECK (fuel_level >= 0 AND fuel_level <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(booking_id, type)
);

-- 7. Checklist evidence images
CREATE TABLE checklist_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES booking_checklists(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(booking_id, reviewer_id)
);
```

## Back office / Backoffice

Added by `infra/db/migrations/202610310900_admin_backoffice.sql` (idempotent):

```sql
ALTER TABLE users
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN blocked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN blocked_reason VARCHAR(500);

ALTER TABLE reviews
    ADD COLUMN hidden_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN hidden_reason VARCHAR(500);

-- Filled by trigger trg_booking_status_history (AFTER INSERT OR UPDATE OF status ON bookings)
CREATE TABLE booking_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    from_status booking_status_enum,
    to_status booking_status_enum NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open' NOT NULL
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE incident_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

## Design notes / Notas de diseño

- **Price snapshot**: `bookings` freezes `price_per_day_at_booking`, `platform_fee` and `total_price` at creation time. / Los importes se congelan al crear la reserva.
- **Soft-delete**: `users` and `vehicles` use `deleted_at` and are filtered with `deleted_at IS NULL`, never physically deleted.
- **`ON DELETE RESTRICT`** from `bookings` to `vehicles` and `users` protects transaction history; dependent tables (`vehicle_images`, `booking_checklists`, `checklist_images`) cascade.
- **Spatial index**: GiST on `vehicles.location` for radius search with `ST_DWithin`.
- **Stripe**: `payment_intent_id` tracks the driver charge; `stripe_transfer_id` and `payout_status` are reserved for owner payouts (Stripe Connect, roadmap).
- **Auth sync**: `public.users.id` equals `auth.users.id`; the trigger in `infra/db/migrations/202603112235_auth_users_sync_trigger.sql` creates the row on sign-up.
