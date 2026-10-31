# LynkDrive

**Peer-to-peer car rental for people that traditional rent-a-cars leave out.**

LynkDrive lets private owners rent out their cars to verified drivers nearby. It runs on iOS, Android and the web from a single Expo codebase, with a NestJS API on top of PostgreSQL/PostGIS.

> Final Degree Project (TFG), Computer Engineering, Universidad de Alicante. Grade: **9.5 / 10**.

[Versión en español](docs/README.es.md)

![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-3.3-5CAE58)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Storage%20%7C%20DB-3FCF8E?logo=supabase&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-PaymentIntents-635BFF?logo=stripe&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-443E38)
![npm workspaces](https://img.shields.io/badge/monorepo-npm%20workspaces-CB3837?logo=npm&logoColor=white)

---

## Table of contents

- [Motivation](#motivation)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Booking lifecycle](#booking-lifecycle)
- [Key engineering decisions](#key-engineering-decisions)
- [Data model](#data-model)
- [Getting started](#getting-started)
- [Admin back office](#admin-back-office)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [License](#license)
- [Author](#author)

## Motivation

The idea came from something seen on campus every week: students who need a car for a weekend or a trip home and cannot rent one. Most traditional rent-a-car companies require a **credit card** for the deposit, and many students only have a **debit card**. At the same time, plenty of cars sit parked for days.

LynkDrive connects both sides. Owners publish their car with photos, price and availability windows; drivers find cars near them on a map, request a booking, and pay once the owner accepts. Hand-over is documented with digital check-in/check-out checklists, and both parties review each other afterwards.

## Features

**Accounts and trust**
- Email/password sign-up and login with Supabase Auth; the app is auth-first (no tabs or features without a session).
- Mandatory minimum profile (first name, last name, phone) during registration.
- Profile with avatar plus ID document and driving licence upload; transactional actions are gated behind `is_verified`.
- GDPR: export all my data as JSON (`GET /api/users/me/export`) and delete my account (`DELETE /api/users/me`: anonymises the profile, removes personal files and the Supabase Auth user; refused while there are active bookings).

**Owners (My Vehicles)**
- Publish vehicles: brand, model, year, plate, description, price per day, fuel, transmission, seats.
- Address search through the API's geocoding endpoint (OpenStreetMap Nominatim), so nobody types coordinates.
- Photo gallery with a primary image, and availability windows that define when the car can be booked.
- Activate / deactivate listings; soft-delete everywhere.
- "My earnings" panel (`GET /api/earnings/mine`): net earnings for this month, last month, this year and all time (Europe/Madrid calendar), breakdown per vehicle and per booking (gross, platform fee, net, booking and payout status), with an optional `from`/`to` date range.

**Drivers (Explore)**
- Radius search around the user's location (PostGIS `ST_DWithin`) with list and map views (Leaflet on web, `react-native-maps` on native).
- Filters: max price, fuel type, transmission, seats.
- Vehicle detail with gallery, owner summary and an availability calendar coloured green / orange / grey from availability windows minus confirmed bookings (plus a 2 h hand-over buffer).

**Bookings (My Trips)**
- Two-phase booking: request, then owner accepts or rejects, then payment.
- Role-aware actions per state (driver vs owner) enforced by the API.
- Payments via Stripe PaymentIntents with Stripe Connect Express payouts to owners (onboarding link, webhooks, cancellation refunds), and a prototype fallback when no Stripe key is configured.
- Accepting a request automatically rejects the other overlapping `pending` requests for the same car, in one transaction with row locks; overlaps include a 2 h hand-over buffer.
- Check-in and check-out checklists (mileage, fuel level, notes, photo evidence stored in a private bucket).
- Cross reviews (1 to 5 stars + comment) once the trip is completed, one per participant per booking.
- Push notifications (Expo) to the other participant on every booking change (new request, accepted, rejected, paid, cancelled, started, completed) and when a review can be left; tapping one opens the booking in My Trips.
- In-app chat per booking between driver and owner (no phone numbers needed): unread counters in My Trips, read receipts, retry of failed sends, a push notification for every new message (tapping it opens the conversation) and polling only while the conversation is open.

**Admin back office (web)**
- Dashboard with users, vehicles, bookings by status and revenue (gross volume, estimated platform fee, last six months).
- Users: search, document review through short-lived signed URLs, verify / unverify, block / unblock (blocked accounts get `403` on the whole API and are banned in Supabase Auth).
- Vehicles: activate / deactivate listings (a listing deactivated by an admin cannot be reactivated by its owner). Reviews: hide / show with a moderation reason (hidden reviews do not count in ratings).
- Bookings: full status history (recorded by a database trigger), check-in/check-out evidence photos via signed URLs and a read-only view of the booking chat (to handle incidents).
- Incidents: create, list, change status and keep internal notes.

## Screenshots

> Placeholders. Add the images to `docs/screenshots/` with these exact filenames (see [docs/screenshots/README.md](docs/screenshots/README.md)).

| Explore (list) | Explore (map) | Vehicle detail |
|---|---|---|
| ![Explore list](docs/screenshots/explore-list.png) | ![Explore map](docs/screenshots/explore-map.png) | ![Vehicle detail](docs/screenshots/vehicle-detail.png) |

| Booking calendar | Trip detail | Check-in checklist |
|---|---|---|
| ![Booking calendar](docs/screenshots/booking-calendar.png) | ![Trip detail](docs/screenshots/trip-detail.png) | ![Checklist](docs/screenshots/checklist.png) |

| My vehicles | Profile and verification | Login / register |
|---|---|---|
| ![My vehicles](docs/screenshots/my-vehicles.png) | ![Profile](docs/screenshots/profile.png) | ![Auth](docs/screenshots/auth.png) |

**Demo**

![Demo: from search to completed trip](docs/screenshots/demo.gif)

## Tech stack

| Layer | Technology |
|---|---|
| Client | React Native 0.81 + Expo SDK 54 (iOS, Android, Web), React 19, TypeScript |
| Client state / HTTP | Zustand, Axios (JWT attached to every request) |
| Maps | Leaflet + react-leaflet (web), react-native-maps (native) |
| Images | expo-image-picker, expo-image-manipulator (client-side compression) |
| API | NestJS 10, TypeORM 0.3, `jose` for JWT verification, Multer for uploads |
| Database | PostgreSQL 15 + PostGIS 3.3 (hosted on Supabase, Docker locally) |
| Auth / Files | Supabase Auth (JWT), Supabase Storage (public and private buckets) |
| Payments | Stripe (PaymentIntents) |
| Geocoding | OpenStreetMap Nominatim, proxied and cached by the API |
| Admin web | Vite + React 19 + TypeScript, Supabase Auth, no UI library |
| Tooling | npm workspaces monorepo, concurrently, ESLint, Prettier |

## Architecture

The client never talks to the database. Supabase is used as managed infrastructure (Postgres, Auth, Storage); all business rules live in the NestJS API.

```mermaid
flowchart LR
    subgraph Client["Client - Expo (iOS / Android / Web)"]
        UI["Feature screens<br/>Explore, Trips, My Vehicles, Profile"]
        Store["Zustand stores"]
        HTTP["Axios client<br/>+ Bearer JWT"]
        Compress["Image compression<br/>expo-image-manipulator"]
        UI --> Store --> HTTP
        UI --> Compress --> HTTP
    end

    subgraph API["NestJS API (/api)"]
        Guard["SupabaseJwtAuthGuard<br/>(jose + JWKS)"]
        Modules["Modules: users, vehicles, vehicle-images,<br/>availability-windows, bookings, payments,<br/>booking-checklists, checklist-images,<br/>reviews, uploads, geocoding, earnings"]
        Guard --> Modules
    end

    subgraph Data["Data and services"]
        PG[("PostgreSQL + PostGIS<br/>(Supabase, DBaaS only)")]
        SAuth["Supabase Auth"]
        SStorage["Supabase Storage<br/>vehicles, avatars (public)<br/>documents, checklists (private)"]
        Stripe["Stripe"]
        Nominatim["Nominatim"]
    end

    Client -- "sign in / sign up" --> SAuth
    HTTP -- "REST + JWT" --> Guard
    Modules -- "TypeORM / SQL" --> PG
    Modules -- "service role: upload, signed URLs" --> SStorage
    Modules -- "PaymentIntents" --> Stripe
    Modules -- "geocoding search" --> Nominatim
    Guard -. "JWKS" .-> SAuth
    SAuth -- "trigger: auth.users -> public.users" --> PG
```

- **Auth**: the client gets a session from Supabase Auth. The API only *verifies* tokens (`jose` with Supabase's JWKS, or an HS256 secret for legacy projects) and uses the `sub` claim as the user identity. It never issues credentials.
- **User sync**: a SQL trigger (`infra/db/migrations/202603112235_auth_users_sync_trigger.sql`) inserts a row into `public.users` whenever someone signs up in `auth.users`, with a backfill for existing accounts.
- **Uploads**: two steps. The client uploads to `POST /api/uploads/images/:target`, receives a `persistedValue`, and stores that value in the related entity. No BLOBs in Postgres.
- **Health checks**: `GET /api/health`, `GET /api/health/db`, `GET /api/health/stripe`.

## Booking lifecycle

Derived from `validateStatusTransition` in `apps/api/src/bookings/bookings.service.ts` and from `apps/api/src/payments/payments.service.ts`:

```mermaid
stateDiagram-v2
    [*] --> pending: driver requests (POST /bookings)
    pending --> accepted: owner accepts (contact method required)
    pending --> rejected: owner rejects
    pending --> cancelled: owner or driver
    accepted --> paid_confirmed: driver pays (payments/confirm)
    accepted --> cancelled: owner or driver
    paid_confirmed --> in_progress: owner starts the trip
    paid_confirmed --> cancelled: owner or driver
    in_progress --> completed: owner ends the trip
    rejected --> [*]
    cancelled --> [*]
    completed --> [*]: reviews unlocked
```

Rules enforced by the API:
- Only the two participants (the driver and the vehicle owner) can read or change a booking; each role has its own allowed transitions.
- Any cancellation is refused once `start_datetime` has passed.
- Accepting requires the owner to share a contact method (`owner_contact_method`), which is then revealed to the driver.
- Payment intents can only be created and confirmed from `accepted`, and only by the driver.
- Reviews can only be created when the booking is `completed`.

## Key engineering decisions

**Supabase as DBaaS, not BaaS.** Supabase gives a managed Postgres with PostGIS, Auth and Storage, but its auto-generated REST API and public RLS are not used. Every request goes through NestJS, so validation, ownership checks and state transitions live in one testable place, and the database could be moved to any Postgres host without touching the client.

**Price snapshot.** A booking stores `price_per_day_at_booking`, `platform_fee` and `total_price` when it is created (days are rounded up, minimum one). If the owner later changes the price, past and pending bookings keep the amount the driver agreed to.

**Overlapping requests.** `pending` requests do not block the calendar, so several drivers can ask for the same dates. When a request is created, the API rejects it with `409 Conflict` if it overlaps a booking that is already `accepted`, `paid_confirmed`, `in_progress` or `completed`, and it must fall fully inside an availability window. The design rule is that accepting one request automatically rejects the other overlapping `pending` requests; that automatic step is not in the code yet and is listed in the [roadmap](#roadmap).

**Spatial search with PostGIS.** `vehicles.location` is a `GEOMETRY(Point, 4326)` with a GiST index (`idx_vehicles_location`). The search uses `ST_DWithin` on `geography` so the radius is in real metres. Because the query casts to `geography`, an expression index on `location::geography` is the next step for the index to be used at scale.

**Private files through signed URLs.** ID documents and checklist photos live in private buckets. The API uploads with the service role key and returns short-lived signed URLs (`SUPABASE_SIGNED_URL_TTL_SECONDS`, default 3600 s); the database stores the object path, never a public link.

**Client-side image compression.** Before uploading, the app converts images to JPEG, resizes them (max 1024 px for avatars, 1920 px otherwise) and steps down the quality until the file fits the target (500 KB for avatars, 2 MB for the rest). If it still does not fit, the upload is cancelled before hitting the API. This keeps Supabase's free storage quota and mobile data usage under control.

**Monorepo with shared contracts.** npm workspaces hold the API, the app and `packages/shared` (`@lynkdrive/shared`), which defines the API contract: booking, checklist, vehicle and upload enums plus the request and response shapes of vehicles, bookings, checklists, reviews, payments and users. Response types are generic over the date type, so the API DTOs `implements` them with `Date` and the app consumes them with ISO strings. Both apps use `import type` only, so nothing changes at runtime; the package is compiled to `dist/` by its `prepare` script on `npm install`/`npm ci`.

**Non-blocking push notifications.** Devices register their Expo push token with `POST /api/push-tokens` (and remove it on sign-out with `DELETE /api/push-tokens/:token`). The API sends through the Expo Push API over plain HTTP (no SDK), fire-and-forget after the state change: a failure only logs a warning without personal data, and tokens Expo reports as `DeviceNotRegistered` are deleted. Tokens are included in the GDPR export and deleted with the account.

**Booking chat without websockets.** Messages live in `booking_messages` and are served by plain REST endpoints under `/api/booking-messages`; the app polls every 4 seconds with an `after` cursor only while the conversation screen is open and the app is in the foreground, which keeps the free Render instance simple (no sticky connections) and is enough for hand-over coordination. Only the two participants can read or write. Writing is allowed in `pending`, `accepted`, `paid_confirmed` and `in_progress`, and for 7 days after the booking is `completed` (taken from `booking_status_history`); rejected or cancelled bookings, or bookings whose other party deleted their account, are read-only. Sending is rate limited (20 messages per minute), each message triggers a fire-and-forget push to the other participant (title and a 120-character preview, never logged), messages written by a user are included in their GDPR export and deleted with their account.

| Method | Path (JWT) | Description |
|---|---|---|
| GET | `/booking-messages?bookingId=&after=&before=&limit=` | Page of messages in chronological order (`limit` 1-100, default 50). Without cursor: latest messages; `after=<messageId>`: only newer ones (polling); `before=<messageId>`: older ones. Returns `{ messages, hasMore, canSend, sendBlockedReason }` |
| POST | `/booking-messages` | `{ bookingId, body }` (trimmed, 1-2000 characters). `403` outside the send window |
| POST | `/booking-messages/read` | `{ bookingId }`: marks the messages received in that booking as read, returns `{ updated }` |
| GET | `/booking-messages/unread` | `{ total, bookings: [{ bookingId, unread }] }` for every booking of the user |

**Other choices.** UTC everywhere in storage and logic (shown in Europe/Madrid in the UI); soft-delete (`deleted_at`) for users and vehicles; `ON DELETE RESTRICT` from bookings to users and vehicles to protect transaction history; `TYPEORM_SYNCHRONIZE=false` outside local development, with versioned SQL migrations instead.

## Data model

Based on the reference schema and the TypeORM entities in `apps/api/src/*/entities`. The full SQL is in [docs/data-model.md](docs/data-model.md).

```mermaid
erDiagram
    USERS ||--o{ VEHICLES : owns
    USERS ||--o{ BOOKINGS : "books as driver"
    VEHICLES ||--o{ VEHICLE_IMAGES : has
    VEHICLES ||--o{ VEHICLE_AVAILABILITY_WINDOWS : "available during"
    VEHICLES ||--o{ BOOKINGS : "is booked in"
    BOOKINGS ||--o{ BOOKING_CHECKLISTS : "check_in / check_out"
    BOOKING_CHECKLISTS ||--o{ CHECKLIST_IMAGES : "evidence"
    USERS ||--o{ PUSH_TOKENS : "receives push on"
    BOOKINGS ||--o{ BOOKING_MESSAGES : "chat"
    USERS ||--o{ BOOKING_MESSAGES : sends
    BOOKINGS ||--o{ REVIEWS : has
    USERS ||--o{ BOOKING_CHECKLISTS : submits
    USERS ||--o{ REVIEWS : "writes / receives"
    BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : "status changes"
    BOOKINGS |o--o{ INCIDENTS : "may relate to"
    INCIDENTS ||--o{ INCIDENT_NOTES : has

    USERS {
        uuid id PK "= auth.users.id"
        varchar first_name
        varchar last_name
        varchar phone_number UK
        varchar avatar_url
        varchar id_document_url
        varchar driver_license_url
        boolean is_verified
        varchar stripe_customer_id
        varchar stripe_account_id
        boolean is_admin "back office role"
        timestamptz blocked_at
        timestamptz deleted_at
    }
    VEHICLES {
        uuid id PK
        uuid owner_id FK
        varchar brand
        varchar model
        int year
        varchar license_plate UK
        numeric price_per_day
        geometry location "Point 4326, GiST"
        varchar location_address
        enum fuel_type
        enum transmission
        int seats
        enum status "active | inactive"
        timestamptz disabled_by_admin_at
        timestamptz deleted_at
    }
    VEHICLE_IMAGES {
        uuid id PK
        uuid vehicle_id FK
        varchar image_url
        boolean is_primary
    }
    VEHICLE_AVAILABILITY_WINDOWS {
        uuid id PK
        uuid vehicle_id FK
        timestamptz start_datetime
        timestamptz end_datetime
    }
    BOOKINGS {
        uuid id PK
        uuid vehicle_id FK
        uuid driver_id FK
        timestamptz start_datetime
        timestamptz end_datetime
        numeric price_per_day_at_booking "snapshot"
        numeric platform_fee
        numeric total_price
        enum status
        varchar payment_intent_id
        varchar stripe_transfer_id
        enum payout_status
        varchar owner_contact_method
    }
    BOOKING_CHECKLISTS {
        uuid id PK
        uuid booking_id FK
        enum type "check_in | check_out"
        uuid submitted_by FK
        int mileage
        int fuel_level "0-100"
        text notes
    }
    CHECKLIST_IMAGES {
        uuid id PK
        uuid checklist_id FK
        varchar image_url
    }
    REVIEWS {
        uuid id PK
        uuid booking_id FK
        uuid reviewer_id FK
        uuid reviewee_id FK
        int rating "1-5"
        text comment
        timestamptz hidden_at "moderation"
    }
    BOOKING_STATUS_HISTORY {
        uuid id PK
        uuid booking_id FK
        enum from_status
        enum to_status
        timestamptz changed_at
    }
    INCIDENTS {
        uuid id PK
        varchar title
        text description
        varchar status "open | in_progress | resolved | closed"
        uuid booking_id FK
        uuid user_id FK
        uuid vehicle_id FK
        uuid created_by FK
    }
    INCIDENT_NOTES {
        uuid id PK
        uuid incident_id FK
        uuid author_id FK
        text body
    }
    PUSH_TOKENS {
        uuid id PK
        uuid user_id FK
        string token UK "ExponentPushToken[...]"
        string platform "ios | android"
        timestamptz created_at
        timestamptz updated_at
    }
    BOOKING_MESSAGES {
        uuid id PK
        uuid booking_id FK
        uuid sender_id FK
        text body "1 to 2000 chars"
        timestamptz created_at
        timestamptz read_at "null until the other party reads it"
    }
```

Constraints worth noting: `UNIQUE(booking_id, type)` on checklists, `UNIQUE(booking_id, reviewer_id)` on reviews, `CHECK (end_datetime > start_datetime)` on bookings. `booking_status_history` is filled by the `trg_booking_status_history` trigger on every insert and status change, so it also captures transitions made by Stripe webhooks and automatic rejections.

## Getting started

### Prerequisites

- Node.js 18 or newer (`engines.node >= 18`)
- A Supabase project (Auth, Storage and, if you want, the hosted database)
- Docker, if you want a local PostgreSQL + PostGIS
- Optional: a Stripe test secret key (without it, payments run in prototype mode)
- Optional: Xcode / Android Studio or Expo Go to run on a device or simulator

### 1. Install

```bash
git clone https://github.com/aadl6-ua/lynkdrive.git
cd lynkdrive
npm install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in your Supabase project ref and keys (see [Environment variables](#environment-variables)). In Supabase Storage, create the buckets `vehicles` and `avatars` (public) and `documents` and `checklists` (private).

### 3. Database

Local PostgreSQL + PostGIS (matches the default `DATABASE_URL` in `.env.example`):

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

The baseline schema is the first migration (`infra/db/migrations/202603010000_baseline_schema.sql`, idempotent), so a fresh database only needs the versioned migrations in `infra/db/migrations` (the runner reads `DATABASE_URL` from the environment or from `apps/api/.env` and records applied files in `public.app_migrations`):

```bash
npm run db:migrate:remote
```

The user-sync migration creates a trigger on `auth.users`, so it is meant for the Supabase database. To use Supabase as the database, point `DATABASE_URL` at your project's Postgres connection string (add `sslmode=require`).

Optional demo data: `infra/db/seeds/reset_vehicles_test_data.sql`.

### 4. Run

```bash
npm run dev          # API and Expo together (concurrently)
# or separately
npm run dev:api      # NestJS in watch mode on http://localhost:3000/api
npm run dev:mobile   # Expo dev server
```

- API health: <http://localhost:3000/api/health>
- In the Expo terminal press `w` for web, `i` for the iOS simulator or `a` for Android, or scan the QR code with Expo Go.
- Android emulator: set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api`. Physical device: use your machine's LAN IP.

- Admin back office: `npm run dev:admin` on <http://localhost:5174> (see [Admin back office](#admin-back-office)).

### Other commands

```bash
npm run build   # builds every workspace (nest build, expo export --platform web, tsc)
npm run lint       # eslint on the API, the app and the admin web
npm run typecheck  # tsc in every workspace
npm run test       # jest on the API and the app, vitest on the admin web
npm run test:e2e   # API e2e tests against a local Postgres + PostGIS (see Testing)
```

## Admin back office

`apps/admin` is a small Vite + React single-page app for operating the platform. It signs in with the same Supabase Auth accounts as the mobile app and only talks to the API under `/api/admin`, which is protected by `AdminGuard`: a valid Supabase JWT **and** `users.is_admin = true` in the database (token claims are never trusted for the role).

**1. Apply the migration.** `infra/db/migrations/202610310900_admin_backoffice.sql` (idempotent) adds `users.is_admin`, `users.blocked_at`, `vehicles.disabled_by_admin_at`, review moderation columns, the `booking_status_history` table with its trigger, and the `incidents` / `incident_notes` tables:

```bash
npm run db:migrate:remote
```

**2. Make someone an admin.** The account must already exist (sign up in the app first). The script uses `DATABASE_URL` from the environment or `apps/api/.env`:

```bash
npm run admin:set -- admin@example.com            # grant
npm run admin:set -- admin@example.com --revoke   # revoke
```

Equivalent SQL:

```sql
UPDATE public.users SET is_admin = TRUE
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
```

**3. Configure and run.**

```bash
cp apps/admin/.env.example apps/admin/.env   # fill in the variables below
npm run dev:admin                             # http://localhost:5174
npm run build -w @lynkdrive/admin             # static build in apps/admin/dist (Vercel, Netlify...)
```

If the API sets `CORS_ORIGINS`, add the admin origin (for example `http://localhost:5174`). To see ID documents and checklist photos, the API needs `SUPABASE_SERVICE_ROLE_KEY`; links are signed with `SUPABASE_SIGNED_URL_TTL_SECONDS` (max 1 hour).

**API endpoints** (all under `/api/admin`, paginated with `page` / `pageSize` up to 100):

| Method | Path | Purpose |
|---|---|---|
| GET | `/me`, `/dashboard` | Current admin profile, platform metrics |
| GET | `/users`, `/users/:id` | List (`search`, `filter`) and detail with signed document URLs |
| PUT | `/users/:id/verification`, `/users/:id/block` | `{ isVerified }`, `{ blocked, reason? }` |
| GET / PUT | `/vehicles`, `/vehicles/:id/status` | List (`search`, `status`), `{ status: active \| inactive }` |
| GET / PUT | `/reviews`, `/reviews/:id/visibility` | List (`visibility`, `maxRating`), `{ hidden, reason? }` |
| GET | `/bookings`, `/bookings/:id` | List (`status`), detail with status history, signed checklist photos and the booking chat (read-only, last 500 messages) |
| GET / POST | `/incidents`, `/incidents/:id` | List (`status`), create `{ title, description, bookingId?, userId?, vehicleId? }`, detail with notes |
| PUT / POST | `/incidents/:id/status`, `/incidents/:id/notes` | `{ status }`, `{ body }` |

Blocking takes effect within 30 seconds (the JWT guard caches the blocked flag briefly) and, when the service role key is configured, the user is also banned in Supabase Auth so they cannot refresh their session.

## Environment variables

### API (`apps/api/.env`)

| Variable | Default / example | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/fyf_dev` | Postgres connection (required). SSL is enabled when it contains `sslmode=require` |
| `TYPEORM_SYNCHRONIZE` | `false` | Only `true` for throwaway local databases |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase project URL (Storage client) |
| `SUPABASE_JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` | Public keys to verify access tokens |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Expected `aud` claim |
| `SUPABASE_JWT_SECRET` | optional | HS256 secret for legacy Supabase projects |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Server-side access to Storage |
| `SUPABASE_STORAGE_VEHICLES_BUCKET` | `vehicles` | Vehicle photos bucket |
| `SUPABASE_STORAGE_AVATARS_BUCKET` | `avatars` | Avatars bucket |
| `SUPABASE_STORAGE_DOCUMENTS_BUCKET` | `documents` | ID document / licence bucket |
| `SUPABASE_STORAGE_USER_DOCS_BUCKET` | `documents` | Legacy alias of the documents bucket |
| `SUPABASE_STORAGE_CHECKLISTS_BUCKET` | `checklists` | Checklist evidence bucket |
| `SUPABASE_STORAGE_VEHICLES_PUBLIC` | `true` | Whether the bucket is public |
| `SUPABASE_STORAGE_AVATARS_PUBLIC` | `true` | Whether the bucket is public |
| `SUPABASE_STORAGE_DOCUMENTS_PUBLIC` | `false` | Whether the bucket is public |
| `SUPABASE_STORAGE_CHECKLISTS_PUBLIC` | `false` | Whether the bucket is public |
| `SUPABASE_SIGNED_URL_TTL_SECONDS` | `3600` | Lifetime of signed URLs for private files |
| `STRIPE_SECRET_KEY` | optional | Enables real Stripe PaymentIntents; without it payments use prototype mode |
| `STRIPE_PUBLISHABLE_KEY` | optional | Sent to the app through `/payments/config` to open the PaymentSheet |
| `STRIPE_WEBHOOK_SECRET` | optional | Signature secret for `POST /api/payments/webhook` |
| `STRIPE_APPLICATION_FEE_PERCENT` | `10` | Platform fee on each payment |
| `STRIPE_CONNECT_COUNTRY` | `ES` | Country of the owners' Connect Express accounts |
| `API_PUBLIC_URL` | `http://localhost:3000/api` | Public API URL used for Connect onboarding return/refresh |
| `CORS_ORIGINS` | empty | Comma-separated allowed web origins; empty keeps CORS open (native apps do not use it) |
| `RATE_LIMIT_PER_MINUTE` | `300` | Global rate limit per client |
| `TRUST_PROXY` | empty | Set behind a proxy (Render) so rate limiting sees the real client IP |
| `PUSH_NOTIFICATIONS_ENABLED` | `true` | Set to `false` to stop sending push notifications (tokens are still stored) |
| `EXPO_ACCESS_TOKEN` | optional | Expo access token, only needed if "Enhanced Security for Push" is enabled in your Expo project |
| `NOMINATIM_BASE_URL` | `https://nominatim.openstreetmap.org` | Geocoding provider |
| `NOMINATIM_DEFAULT_COUNTRY_CODES` | `es` | Default country filter |
| `NOMINATIM_USER_AGENT` | `lynkdrive-tfg/0.1 (contact: ...)` | Required by Nominatim's usage policy |
| `NOMINATIM_TIMEOUT_MS` | `3500` | Request timeout |
| `NOMINATIM_CACHE_TTL_MS` | `900000` | In-memory cache TTL for geocoding results |
| `NOMINATIM_CACHE_MAX_ENTRIES` | `500` | In-memory cache size |

`.env.example` also lists `NODE_ENV`, `SUPABASE_ANON_KEY` and `SUPABASE_STORAGE_URL`; the API does not read them at the moment.

### Mobile (`apps/mobile/.env`)

| Variable | Example | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000/api` | Base URL of the NestJS API |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase Auth and public image URLs |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon key | Supabase client (Auth) |
| `EXPO_PUBLIC_SUPABASE_STORAGE_URL` | optional | Explicit Storage URL instead of deriving it |
| `EXPO_PUBLIC_SUPABASE_PUBLIC_BUCKETS` | `vehicles,avatars` | Buckets that can be rendered directly |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | optional | EAS project id for Expo push tokens (otherwise read from `extra.eas.projectId` in the app config) |

**Push notifications on real devices.** They are optional: without an EAS project id, on web, on simulators or in Expo Go for Android (remote push was removed from Expo Go in SDK 53) the app works exactly the same and the Profile card is hidden. To receive them on a physical iOS/Android device you need a development build or an EAS build (`eas build`) linked to an EAS project, with push credentials configured (APNs key for iOS, FCM V1 service account for Android; `eas credentials`). The permission is only requested when the user taps "Activar notificaciones" in Profile.

### Admin (`apps/admin/.env`)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api` | Base URL of the NestJS API |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase Auth |
| `VITE_SUPABASE_ANON_KEY` | anon key | Supabase client (public key, same as the mobile app) |

The admin session is kept in `sessionStorage`, so it ends when the browser tab is closed.

## Project structure

```text
lynkdrive/
├── apps/
│   ├── api/                      # NestJS API, global prefix /api
│   │   └── src/
│   │       ├── admin/            # back office endpoints (/api/admin)
│   │       ├── auth/             # SupabaseJwtAuthGuard, AdminGuard, @CurrentUser
│   │       ├── users/            # /users/me, overview, soft-delete
│   │       ├── vehicles/         # CRUD + PostGIS radius search
│   │       ├── vehicle-images/
│   │       ├── vehicle-availability-windows/
│   │       ├── bookings/         # booking state machine, overlap check, price snapshot
│   │       ├── payments/         # Stripe PaymentIntents / prototype mode
│   │       ├── earnings/         # owner "My earnings" panel (read-only aggregates)
│   │       ├── booking-messages/ # booking chat (/api/booking-messages)
│   │       ├── booking-checklists/
│   │       ├── checklist-images/
│   │       ├── reviews/
│   │       ├── uploads/          # Supabase Storage, signed URLs
│   │       └── geocoding/        # Nominatim proxy with cache
│   ├── admin/                    # back office web (Vite + React)
│   │   └── src/                  # pages, components, API client, Supabase session
│   └── mobile/                   # Expo app (iOS / Android / Web)
│       ├── App.tsx               # composition root: session, tabs, wiring
│       └── src/
│           ├── features/         # auth, explore, trips, vehicles, profile, maps
│           ├── store/            # Zustand stores
│           ├── api/              # Axios client, uploads, image compression
│           ├── app/              # tab bar, theme tokens, shared UI
│           └── shared/           # hooks and pure helpers
├── packages/
│   └── shared/                   # @lynkdrive/shared: API contracts used by api and mobile
├── infra/
│   ├── docker/                   # docker-compose: PostgreSQL 15 + PostGIS 3.3
│   └── db/
│       ├── migrations/           # versioned SQL (auth.users -> users trigger)
│       └── seeds/                # demo vehicles
├── scripts/                      # migration runner, set-admin and smoke tests
└── docs/                         # documentation and screenshots
```

## Testing

**API unit tests** (Jest + `@nestjs/testing`, `apps/api/src/**/*.spec.ts`) cover the booking state machine and pricing, overlap and hand-over buffer rules, automatic rejection of overlapping requests, checklists, reviews, uploads (including real image content checks), the JWT and admin guards, the admin service, Stripe webhooks, the booking chat (access, send window, cursors, unread counters, push), the GDPR export/delete flow and that the validation enums match `@lynkdrive/shared`.

**App unit tests** (Jest with the `jest-expo` preset, `apps/mobile/src/**/__tests__/*.test.ts`) cover the pure logic of the app: Europe/Madrid date and EUR formatting (including DST changes), billable days, booking status helpers, API error messages, verification gates, client-side image compression (`prepareUploadImage` with `expo-image-manipulator` and `fetch` mocked), storage URL resolution, the calendar availability rules (2 h hand-over buffer, `pending` does not block), the chat helpers (merging polled pages, day separators in Europe/Madrid, grouping) and the Zustand stores with the Axios client and Supabase mocked. They run with the device time zone set to `America/New_York` to prove the Madrid presentation does not depend on the device.

```bash
npm run test                      # API + app
npm run test -w @lynkdrive/mobile # app only
```

**E2E tests** run the booking flow, the booking chat, earnings and the admin back office against a real Postgres + PostGIS (the schema is recreated on every run). Never point them at the Supabase database:

```bash
docker run -d --name lynkdrive-test-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=lynkdrive_test -p 55432:5432 postgis/postgis:15-3.4
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lynkdrive_test npm run test:e2e
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, build (including the admin web and `expo export --platform web`), API and app unit tests and the e2e tests on every push and pull request to `main`, `dev` and `integracion`.

**Smoke scripts** (bash + curl + node) run against a live API:

| Script | What it covers |
|---|---|
| `scripts/get_supabase_tokens.sh` | Logs in two test users against Supabase Auth and prints `OWNER_TOKEN` / `DRIVER_TOKEN` exports |
| `scripts/smoke_bookings.sh` | Health, `/users/me` for both users, booking creation and main state transitions |
| `scripts/smoke_payments_checklists_reviews.sh` | Full flow: vehicle + availability, booking accepted, payment intent and confirm, checklists, checklist images, completion, reviews and their uniqueness |
| `scripts/smoke_vehicle_images_availability.sh` | Vehicle images and availability windows (needs `OWNER_TOKEN`; checks the 401 without a token and deletes its test vehicle) |

```bash
# 1. Get tokens for two existing test accounts
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
OWNER_EMAIL=owner@example.com OWNER_PASSWORD=... \
DRIVER_EMAIL=driver@example.com DRIVER_PASSWORD=... \
./scripts/get_supabase_tokens.sh
# 2. Paste the printed exports, then:
BASE_URL=http://localhost:3000/api ./scripts/smoke_bookings.sh
BASE_URL=http://localhost:3000/api ./scripts/smoke_payments_checklists_reviews.sh
BASE_URL=http://localhost:3000/api ./scripts/smoke_vehicle_images_availability.sh
```

The payments smoke test works in both modes: real Stripe (with `STRIPE_SECRET_KEY`) and prototype.

## Roadmap

- Strong identity verification (eIDAS / DNIe / Cl@ve) instead of manual document review.

## License

No open-source license has been chosen yet, so all rights are reserved by the author. The code is published for portfolio and academic purposes; contact the author if you want to reuse it.

## Author

**Álvaro Andrés De Lamo**
Computer Engineering, Universidad de Alicante.
GitHub: [@aadl6-ua](https://github.com/aadl6-ua)
