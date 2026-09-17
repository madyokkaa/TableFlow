---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/guest/BookingFlow.tsx"]
---

## Scope

Guest table-booking screen (`app/page.tsx` and `components/guest/*`). Mode: Operate. Visitor: a restaurant guest choosing a table, date, time, and party size, on mobile or desktop equally.

## Audience, job, action, proof, constraints

Job: pick a real table in a real room, fast, on any device, without a carousel. Action: table → time → party size → confirm, in as few taps/clicks as possible. Proof: the floor plan itself (a guest trusts a plan they can see, not a list). Constraints: no invented restaurant branding/photography (see PRODUCT.md); existing Supabase-backed availability data only; anonymous booking must keep working end to end; `prefers-reduced-motion` respected throughout.

## Direction contract

THESIS: Booking a table is a spatial decision, not a form to fill out - every control (which table, which time) reads as one continuous row that scales to the viewport and never wraps or scrolls, refusing the category-default "date picker -> dropdown -> confirm" wizard and the carousel it was about to become.

OWN-WORLD: The existing warm paper/ink system, inherited unchanged - light: paper `#f7f3ec` / ink `#1c1712`; dark: near-black `#17130f` with the muted claret `#d98a96` radial-gradient glow as the primary accent; Fraunces serif for display headings, IBM Plex Sans for body, IBM Plex Mono for operational labels/timestamps; gold stays reserved for celebratory moments only. The gradient glow (existing BackgroundBlobs) deepens and gains a slow, barely-perceptible pulse rather than changing palette.

STORY: The guest sees the whole room first (floor plan, zoomed to fit, always in view as context and proof), then scans one scaling row of table chips and one scaling row of time chips beneath it - never scrolled, never paginated, the row's items shrink together to keep every option visible at once. Tapping a table chip highlights that table on the floor plan above; tapping a time chip confirms the slot. A slim persistent bar (date + party size + primary action) stays reachable throughout.

FIRST VIEWPORT: Floor plan pinned at top, zoomed to fit its container (compact on mobile, wider on desktop, same mechanic). Directly beneath it, two full-width horizontal rows whose item width scales to fill available space instead of wrapping or scrolling: a "tables" row (label + capacity per chip) and a "time" row (slot chips, taken/booked slots dimmed). A sticky summary/CTA strip (date, party size, "Забронировать") docks at the bottom on mobile and stays inline on desktop. No horizontal carousel, no dropdown wall, no multi-page wizard.

FORM: "Step-row scale-to-fit" - candidate 7 of this surface's 7 ranked structural options, dealt lead by the concept-seed roll and fused with catalog challenger `signals-instruments-drum-machine-step-row` (the "sixteen-step row that never wraps, it scales" grammar, re-applied to table/time selection instead of sequencer steps). Seed key `88226c93`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

- Exact chip minimum width / shrink floor before a row is allowed to wrap on very narrow phones (< ~360px) - decide during build against real device widths, not guessed in advance.
- Whether the time row groups by hour or stays one flat scaling row for a full-day span - decide once real slot density (from `candidateStartTimes()`) is on screen.
