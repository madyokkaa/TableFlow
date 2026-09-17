import type { DiningTable } from "@/components/hostess/TableForm";

/** Shared between the hostess floor-plan editor and the guest read-only
 * floor plan so a table's visual footprint never drifts between the two.
 *
 * "round" uses an explicit half-size radius rather than Tailwind's
 * `rounded-full` (which compiles to `border-radius: calc(infinity * 1px)`,
 * clamped by the browser to a huge but finite number). That's harmless on a
 * plain static circle, but a round table's button also gets a CSS
 * `transform: scale()` on hover/selection (via motion) while living inside
 * an SVG `<foreignObject>` that is itself being scaled by the floor plan's
 * zoom-to-fit `viewBox` - stacking a near-infinite radius under two nested
 * scale factors is exactly the case where Chromium's corner rasterization
 * loses precision, producing a visibly offset/broken ring instead of a
 * clean circle. A finite radius equal to half the box renders an identical
 * circle and stays numerically well-behaved under any transform. */
export const SHAPE_SIZE: Record<DiningTable["shape"], { w: number; h: number; className: string }> = {
  round: { w: 84, h: 84, className: "rounded-[42px]" },
  square: { w: 84, h: 84, className: "rounded-xl" },
  rectangle: { w: 120, h: 72, className: "rounded-xl" },
};
