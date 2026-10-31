-- Esquema base para los tests e2e (copia de script.sql documentado en CLAUDE.md).
-- Incluye un stub minimo del esquema auth de Supabase para poder aplicar
-- las migraciones de infra/db/migrations (trigger auth.users -> public.users).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email VARCHAR(255),
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);

CREATE TYPE fuel_type_enum AS ENUM ('gasoline', 'diesel', 'electric', 'hybrid');
CREATE TYPE transmission_enum AS ENUM ('manual', 'automatic');
CREATE TYPE vehicle_status_enum AS ENUM ('active', 'inactive');

CREATE TYPE booking_status_enum AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'paid_confirmed',
    'in_progress',
    'completed',
    'cancelled'
);
CREATE TYPE checklist_type_enum AS ENUM ('check_in', 'check_out');

CREATE TYPE payout_status_enum AS ENUM ('pending', 'processing', 'paid', 'failed');

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

CREATE TABLE vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE vehicle_availability_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_dates CHECK (end_datetime >= start_datetime)
);

CREATE INDEX idx_availability_dates ON vehicle_availability_windows(start_datetime, end_datetime);

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

CREATE TABLE checklist_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES booking_checklists(id) ON DELETE CASCADE,
    image_url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

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
