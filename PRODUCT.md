# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two distinct audiences, served by two separate surfaces:

- **Guests** booking a table — either planning ahead or deciding in the moment, arriving via a shared link/QR/search rather than a native app. Device usage is roughly even between mobile and desktop (desktop use is significant, not an afterthought) - confirmed by the user, not assumed mobile-first. Booking must work fully anonymously; an account is optional, never required.
- **Restaurant staff** (hostess/manager/admin) operating the floor day-to-day: confirming/editing/cancelling reservations, managing halls and tables, adding other staff. Needs to feel fast and live (realtime), not just presentable.

## Product Purpose

A restaurant table-reservation service: a visual, floor-plan-driven booking flow for guests, and an operational admin panel for staff to run reservations, tables, and no-shows against real-time state - with double-booking prevented at the database layer, not just in application code.

## Positioning

Frictionless, truly anonymous booking (no forced account, optional magic-link) combined with a hard database-level guarantee against double-booking (a Postgres `EXCLUDE` constraint on table + time range, not an app-level check) and realtime staff-side updates (Postgres Changes, no polling). Presented as a reusable SaaS/template product for restaurants, not one venue's bespoke site.

## Operating Context

Single-tenant per deployment (one restaurant, no multi-org switcher). A restaurant is organized as halls (zones) containing dining tables (shape, capacity range, floor position); guests book a date + start time + party size against a table (or a staff-assembled combination of tables for large parties); reservations move through a state machine (pending → confirmed → completed, or cancelled / no-show) enforced by a DB trigger. Staff get a live floor-plan editor (drag-to-position tables) and a realtime-updated reservations list with sound notification on new bookings.

## Capabilities and Constraints

- No real restaurant branding exists or should be invented: no logo, no dish photography, no specific venue name. The visual system must stay a clean, reusable identity a real restaurant could skin later - confirmed by the user for this redesign specifically.
- Confirmed: this is a SaaS/template product currently shown as a single demo example, not a bespoke build for one named restaurant.
- Guest-side responsive work must treat mobile and desktop as equally primary (not mobile-first with desktop as a fallback).
- No chart, UI-component, or icon library is installed yet on the admin (hostess) side - icons there are hand-rolled inline SVG today; a unified icon set is in scope for the current redesign request.
- Deploy target: Vercel. Stack (Next.js App Router + TypeScript, Tailwind CSS v4, Supabase Postgres/Auth/Realtime/RLS) is already established by the existing codebase.
- Russian-only interface at this phase; no i18n abstraction in place or requested.

## Brand Commitments

Product name: **TableFlow**. No logo or real photography exists or is to be fabricated - typography and color are the identity.

Current visual direction (established in the existing codebase, to be preserved and elevated rather than replaced for this redesign - the user explicitly called it "the project's already-chosen palette"):
- A warm "paper/ink" system rather than a generic SaaS blue/purple: light mode is a near-white paper background; dark mode is a near-black warm background with a muted pink/wine ("claret") radial-gradient glow as the primary accent.
- Serif display face (Fraunces) for headings/warmth, paired with a precise sans (IBM Plex Sans) for body text and mono (IBM Plex Mono) for operational labels (timestamps, the staff-panel wordmark).
- Gold is a second, deliberately rare accent reserved for celebratory moments (booking success), not part of the everyday palette.

## Evidence on Hand

None. No real menu items, dish photography, testimonials, press, or case studies exist for this project - future work must not fabricate any of these.

## Product Principles

1. Booking never requires an account - anonymous is a first-class path, not a degraded one.
2. Double-booking is prevented at the database layer; trust in the product follows from that guarantee, not just from UI feedback.
3. The staff (hostess) side must feel as fast and live as the guest side looks premium - realtime over polling, always.
4. This reads as a premium, reusable SaaS product for restaurants in general, not as one venue's one-off branding.
5. Russian-only interface for now; do not add i18n scaffolding speculatively.

## Accessibility & Inclusion

No specific standard confirmed yet. Existing code already respects `prefers-reduced-motion` for decorative animation (e.g. the guest background blobs) - continue that pattern rather than relaxing it.
