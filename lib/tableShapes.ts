import type { DiningTable } from "@/components/hostess/TableForm";

/** Shared between the hostess floor-plan editor and the guest read-only
 * floor plan so a table's visual footprint never drifts between the two. */
export const SHAPE_SIZE: Record<DiningTable["shape"], { w: number; h: number; className: string }> = {
  round: { w: 84, h: 84, className: "rounded-full" },
  square: { w: 84, h: 84, className: "rounded-xl" },
  rectangle: { w: 120, h: 72, className: "rounded-xl" },
};
