# TableFlow

Restaurant table-booking app: a guest-facing visual booking flow and a
staff admin panel for managing halls, tables, and reservations in real
time.

Built with Next.js (App Router, TypeScript) and Supabase (Postgres, Auth,
Realtime, Row Level Security).

## Features

**Guest booking** (`/`)
- Interactive visual floor plan — pick a table by clicking its shape on the
  actual layout of the hall
- Compact calendar date picker and a discrete-stop time slider (dims
  already-booked times)
- One continuous table → date → time → confirm flow with animated step
  transitions
- Passwordless sign-in via a magic link (Supabase Auth OTP)

**Hostess panel** (`/hostess`)
- Email + password sign-in, with a forgot-password / reset-password flow
- Hall & table management, including a drag-and-drop floor plan editor
  (shape, seat range, manual occupied/out-of-service override)
- Reservation list with filters, full editing (time, table, party size,
  contact info, multi-table combining for large parties), and status
  transitions (confirmed / cancelled / no-show / completed)
- Live updates over Supabase Realtime (no polling) — a new booking appears
  and pings without a page refresh, with a sound toggle
- Double-booking is impossible by construction: a Postgres `EXCLUDE`
  constraint on table + time range rejects the conflicting write directly
  at the database layer, not just in application code

The whole interface is in Russian; dates/times are formatted accordingly.

## Stack

- **Next.js 16** (App Router) + **TypeScript**, **Tailwind CSS v4**
- **Supabase**: Postgres, Auth (magic link + email/password), Realtime
  (Postgres Changes), Row Level Security
- **Vitest** for integration tests (run against a real Supabase project,
  not mocks)

## Getting started

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com), then copy
`.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=          # Project Settings -> API
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Project Settings -> API
SUPABASE_SERVICE_ROLE_KEY=         # Project Settings -> API (server-only, bypasses RLS)
SUPABASE_DB_URL=                   # Project Settings -> Database -> Connection string -> Session pooler (port 5432)
```

`SUPABASE_DB_URL` must use the **session pooler** (port 5432) — the
transaction pooler (6543) doesn't support the DDL statements in the
migrations reliably.

### 2. Install and migrate

```bash
npm install
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

This applies every file in `supabase/migrations/` in order: the schema
(halls/tables/reservations), the double-booking exclusion constraint, the
RPC functions used for atomic multi-table writes, and the Realtime
publication setup.

### 3. Seed demo data (optional)

```bash
npx tsx scripts/seed.ts
```

Creates two halls and a handful of tables so the floor plan and
availability aren't empty on first run.

### 4. Create a staff account

Staff accounts aren't self-service — create one via the Supabase dashboard
(Authentication → Users → Add user, email + password) or the
`supabase.auth.admin.createUser` API, then insert a matching row into the
`staff` table so `is_staff()` recognizes it.

### 5. Run it

```bash
npm run dev       # http://localhost:3000
npm run build     # production build
npm run test       # integration tests, against your live Supabase project
npm run lint
```

## Project structure

```
app/
  page.tsx                 guest booking page
  hostess/                 staff panel pages (login, halls, reservations)
  api/                      Route Handlers (halls, tables, reservations, availability)
  auth/callback/            magic-link redirect target
components/
  guest/                    booking flow (floor plan, date picker, time slider, confirm)
  hostess/                  admin UI (floor plan editor, forms, reservation editor)
  Combobox.tsx, Modal.tsx, ConfirmDialog.tsx   shared UI primitives
lib/
  supabase/                 browser/admin/auth Supabase clients
  scheduling.ts, reservations.ts, ru.ts        shared domain + formatting helpers
hooks/
  useReservationsRealtime.ts   Postgres Changes subscription for live updates
supabase/migrations/         schema, RLS policies, RPC functions, in order
tests/                        Vitest integration tests
```

## Deployment

Deploy the Next.js app to [Vercel](https://vercel.com) with the same
environment variables as `.env.local` (except `SUPABASE_DB_URL`, which is
only needed locally to run migrations). In the Supabase dashboard, set
**Authentication → URL Configuration** to match your deployed domain so
magic-link and password-reset redirects land on the right site instead of
`localhost`.
