/** Shared entrance animation for dashboard cards/stats - a parent StaggerGrid
 * triggers these via variant propagation, one child after another. */
export const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.34, 1, 0.64, 1] } },
} as const;
