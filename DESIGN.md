---
name: TableFlow
description: A well-run dining room's reservation book, digitized - warm paper and ink, one confident wine-red accent, scaling rows instead of wizards.
colors:
  paper: "#f7f3ec"
  surface: "#ffffff"
  ink: "#1c1712"
  muted: "#756b5e"
  line: "#e3dacb"
  claret: "#6e2a3a"
  claret-strong: "#551f2c"
  claret-tint: "#f3e4e6"
  gold: "#b8863a"
  gold-strong: "#96692a"
  gold-tint: "#f8ecd7"
  status-pending: "#a6791f"
  status-confirmed: "#3f6b52"
  status-cancelled: "#a14a3d"
  status-noshow: "#6b7280"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 400
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontWeight: 500
rounded:
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.claret}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.claret-strong}"
  chip-selected:
    backgroundColor: "{colors.claret}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
  chip-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
---

# Design System: TableFlow

## Overview

**Creative North Star: "The Reservation Book, Digitized"**

TableFlow reads as a well-run dining room's paper reservation book brought online: warm paper and ink rather than a generic SaaS blue/purple, one confident wine-red (claret) accent standing in for the pen the maître d' would use, and gold held back entirely for the moment a booking succeeds. The guest-facing booking screen expresses this as a spatial decision rather than a form: the whole floor plan is visible first, and every choice beneath it (table, time) reads as one continuous row that scales to the viewport instead of wrapping, scrolling, or paginating - refusing the category-default date-picker-then-dropdown wizard. The hostess admin panel inherits the same paper/ink system unchanged and adds a unified lucide-react icon set with a consistent, restrained hover/press motion (a small lift or scale, spring-eased) across every interactive control, replacing what had been hand-rolled SVGs and glyph icons.

No real restaurant branding, logo, or photography exists or is invented anywhere in the system - typography and color alone carry the identity (confirmed in PRODUCT.md's Brand Commitments).

**Key Characteristics:**
- Warm paper/ink base with a single wine-red accent; gold is rare and reserved for success states only
- Fraunces (serif, display) paired with IBM Plex Sans (body) and IBM Plex Mono (operational/mono labels)
- Scaling chip-rows, never wrapping or scrolling wizard/carousel patterns, are the signature guest-side interaction
- Soft, ambient shadow vocabulary only - no hard offset/neobrutalist shadows anywhere in the build
- Consistent spring-eased hover/press motion (lift on hover, scale-down on tap) on nearly every clickable element

## Colors

A warm, restrained palette: near-white/near-black paper and ink carry almost everything, with claret as the one accent and gold held in reserve.

### Primary
- **Claret** (`#6e2a3a`, dark mode `#d98a96`): the one accent - selected chips, primary buttons, active nav state, links, focus/selection state on the floor plan. Strong variant `#551f2c` (dark: `#eaacb5`) for hover/press. Tint `#f3e4e6` (dark: `#3a2126`) for soft active backgrounds (nav highlight, avatar badge).

### Secondary
- **Gold** (`#b8863a`, dark mode `#e0b872`): deliberately rare - reserved for celebratory moments (the booking-success checkmark/confetti) and is not part of the everyday interactive palette. Never used for a chip, button, or nav state.

### Neutral
- **Paper** (`#f7f3ec`, dark mode near-black `#17130f`): the page background.
- **Surface** (`#ffffff`, dark mode `#221c16`): cards, chips, bars, modals sitting above paper.
- **Ink** (`#1c1712`, dark mode `#f3ece1`): primary text.
- **Muted** (`#756b5e`, dark mode `#a79c8c`): secondary text, labels, disabled states.
- **Line** (`#e3dacb`, dark mode `#342c24`): borders, dividers, dashed empty-state outlines.

### Status (operational, hostess-side)
- **Pending** `#a6791f` / **Confirmed** `#3f6b52` / **Cancelled** `#a14a3d` / **No-show** `#6b7280` (each with a matching light tint), used for reservation state badges and the success-celebration ring/check (confirmed color).

### Named Rules
**The One Accent Rule.** Claret is the only color carrying interactive/selection meaning (selected, primary action, active nav, link). No second "brand" hue is introduced anywhere in the build.

**The Gold-Is-Rare Rule.** Gold never appears in a button, chip, nav item, or form control. It appears only in the success-celebration confetti/ring and as one of the decorative background-blob/particle hues - never as a functional or selection color.

## Typography

**Display Font:** Fraunces (with Georgia, serif fallback)
**Body Font:** IBM Plex Sans (with system-ui, sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace fallback)

**Character:** A warm serif for headings paired with a precise, neutral sans for body copy and a mono face for anything operational (timestamps, chip labels, wordmarks, status text) - the pairing reads like a hand-set reservation ledger next to a printed order slip.

### Hierarchy
- **Display** (Fraunces, regular weight, `text-xl`-`text-4xl` depending on context): page/section headings (hostess header title, modal titles, stat-card big numbers, avatar-badge initial).
- **Body** (IBM Plex Sans, 400/500/600, `text-sm`-`text-base`): all running text, nav labels, form labels, button labels.
- **Label/Mono** (IBM Plex Mono, 400/500, `text-xs`-`text-sm`, often `uppercase tracking-[0.1em]`-`tracking-[0.2em]`): wordmarks ("TableFlow · Staff"), table/time chip values, timestamps, and small field/section labels directly above their content (e.g. "Стол(ы)", "Статус"). These are compact operational labels tied to the control beneath them, not decorative headline kickers.

### Named Rules
**The Mono-For-Operational Rule.** IBM Plex Mono is reserved for tabular/operational content (chip values, timestamps, wordmarks, tight field labels) - narrative body copy always uses Plex Sans.

## Layout

Guest and admin surfaces both cap content width (guest: `max-w-2xl`; admin main column: `max-w-6xl`) and center on paper. The guest booking screen's signature layout is the floor-plan-then-two-scaling-rows stack described in Components below; the admin panel is a fixed sidebar (72px icon-only, widening to 240px at `lg`) on desktop collapsing to a bottom tab bar on mobile, mirrored by the guest summary bar's own desktop-inline/mobile-fixed-bottom split. Spacing follows a compact rhythm mostly in the 4-20px range (Tailwind's default scale used directly - `gap-1`/`gap-1.5`/`gap-3`/`px-5`/`py-8`), tighter on chip rows (`gap-1`/`gap-1.5`) and looser between major sections (`gap-4`+).

## Elevation & Depth

A soft, ambient shadow system - three tokens (`--shadow-soft`, `--shadow-elevated`, `--shadow-floating`), all diffuse multi-layer `rgb(shadow-color / alpha)` blurs with no hard offset, scaling from a barely-there resting shadow to a floating/modal-level shadow. Selected chips and stat cards use `shadow-elevated`; resting cards/bars use `shadow-soft`; nothing in the build uses a hard-edged offset (neobrutalist-style) shadow.

### Shadow Vocabulary
- **Soft** (`0 1px 2px rgb(28 23 18 / 0.06), 0 1px 1px rgb(28 23 18 / 0.04)`): resting cards, bars, hovered-but-unselected chips.
- **Elevated** (`0 6px 16px -4px rgb(.../ 0.14), 0 2px 6px -2px rgb(.../ 0.08)`): selected chips, stat cards, active/lifted state.
- **Floating** (`0 20px 48px -12px rgb(.../ 0.24), 0 8px 20px -8px rgb(.../ 0.14)`): modals and top-level overlays.

### Named Rules
**The Ambient-Only Rule.** Every shadow in the system is soft/diffuse and grows with elevation state (hover, selection, modal); none is a hard directional offset. A hard-offset "sticker" shadow would break this system and should not be introduced.

## Shapes

Corners are consistently rounded and never sharp: `rounded-lg`/`rounded-xl` (10-12px) for buttons, inputs, and chips; `rounded-2xl` (16px) for cards, modals, and the floor-plan container; `rounded-full` for avatar badges, status dots, and icon-only toggles. Borders are a thin 1-2px `line` colored stroke, thickening to 2px and switching to claret on selected/hovered interactive elements (chips, floor-plan table shapes). No sharp/rectangular cards and no clipped/angular cuts appear anywhere in the build.

## Components

### Buttons
- **Shape:** rounded-lg (10px), height 44px for primary actions.
- **Primary:** claret background, white text, `px-5`; hover darkens to claret-strong; disabled drops to 50% opacity.
- **Hover / Focus:** every button in the build (guest chips, summary-bar CTA, admin nav, modal close, sound toggle) uses Motion's `whileHover`/`whileTap` with a spring transition (~stiffness 400-420, damping 17-20) - a small lift (`y: -2` or `scale: 1.03-1.06`) on hover and a slight scale-down (`0.92-0.96`) on tap/press. This is a system-wide, reused pattern, not a one-off.
- **Icon-only / Ghost:** circular or `rounded-lg` hit area, muted text color, background tints to `line/50` or `paper` on hover.

### Chips (signature component)
- **Style:** `rounded-xl` (12px), 2px border, surface background, claret border+shadow on hover.
- **State:** unselected (line border, surface bg) / selected (claret fill, white text, elevated shadow) / disabled (40% opacity, line border, not-allowed cursor). Table and time chips share this exact state language.

### Cards / Containers
- **Corner Style:** rounded-2xl (16px).
- **Background:** surface, often with `/70` opacity + backdrop-blur for panels sitting over paper.
- **Shadow Strategy:** soft at rest, elevated when interactive/emphasized (see Elevation & Depth).
- **Border:** 1px line-colored border, near-universal.
- **Internal Padding:** `p-5`-`p-6`.

### Inputs / Fields
- **Style:** line-colored border, surface background, rounded-lg.
- **Focus:** border shifts to claret (no glow ring observed as a separate device).

### Navigation
- **Style:** IBM Plex Sans labels with a lucide-react icon (18-20px, `strokeWidth={1.75}`) leading each item; active state is a claret-tint background with claret text, inactive is muted text. Desktop: fixed sidebar (icon-only at 72px, icon+label from `lg`). Mobile: fixed bottom tab bar, icon over label, active item in claret. Both guest (summary bar) and admin (tab bar) mirror this same mobile-docked-bottom / desktop-inline split.

### Scaling Chip Row (signature component)
The guest booking screen's defining device: every table (or time slot) in the active set renders as one `flex-1 basis-[52px]` (tables) / `basis-[44px]` (times) chip in a single-row flex container - the row fills available width by growing each chip rather than scrolling or paginating, so the full table/time set is visible at once. `flex-wrap` is present only as a genuine fallback for narrow phones; at the surface's own working widths (desktop and a real ~390px phone) the row holds one line. Selecting a table chip and tapping its matching shape on the floor plan above are the same action (shared `selectedTableId` state) - this pairing, not either device alone, is the system's signature interaction.

## Do's and Don'ts

### Do:
- **Do** keep claret as the only interactive/selection accent color; gold stays reserved for success-only moments.
- **Do** use the spring `whileHover`/`whileTap` motion pattern (lift on hover, scale-down on tap) for new interactive controls, matching the existing stiffness/damping values.
- **Do** use lucide-react for all icons; no hand-rolled SVG icons or unicode/emoji glyphs.
- **Do** use the ambient soft/elevated/floating shadow scale; let shadow grow with elevation state rather than adding a new fixed shadow value.
- **Do** let chip/row-based selectors scale to fill width before allowing wrap; wrap is a narrow-viewport fallback, not the default behavior.

### Don't:
- **Don't** introduce a hard-offset/neobrutalist shadow anywhere in this system; every shadow here is diffuse.
- **Don't** add a second brand accent color alongside claret; extend with tints of claret or use the existing status colors for operational meaning instead.
- **Don't** use gold for anything interactive (buttons, chips, active nav, links) - it signals "booking succeeded" and nothing else.
- **Don't** invent decorative uppercase "kicker" text above headlines; the uppercase mono labels that exist are compact field/section labels tied directly to the control beneath them, not headline ornamentation - do not generalize them into a headline-kicker pattern.
- **Don't** reintroduce a scrolling/paginated/wrapping-by-default row for a bounded option set (tables, times) on the guest surface; scale-to-fit is the established mechanic there.
