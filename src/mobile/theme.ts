// The phone app's colours, taken from DESIGN.md and kept in ONE place for the same reason the
// web app keeps them in index.css: a hex literal typed into a screen is a token that has quietly
// left the system, and the next palette change misses it.
//
// This file is the pattern every module under src/mobile follows: plain TypeScript, no
// react-native and no expo import, so the repo's own `npm test` collects its tests and the
// logic can be exercised without a simulator. src/mobile/seal.test.ts enforces that.
export const COLORS = {
  /** The pantry wall. The app ground and all chrome. */
  wall: "#1f3b34",
  /** The header rail and the plate rim keyline. */
  wallDeep: "#16302a",
  /** The bone content surface. Everything readable sits on one of these. */
  plate: "#f3ede1",
  plateAlt: "#e9e1d0",
  /** Body text on a plate. */
  ink: "#182b25",
  /** Secondary text on a plate: bylines, times, meta. */
  inkSoft: "#4f605a",
  /** Text on the wall. */
  onWall: "#f3ede1",
  /** The ONE reserved action colour. A second use is a design decision, not a styling one. */
  action: "#b53514",
  actionDeep: "#8f260b",
  actionLit: "#ff8f73",
  onAction: "#fdf3ec",
  /** Highlight, used for the sync banner rather than for actions. */
  spark: "#e7c24a",
  chip: "#ddd2bb",
  chipInk: "#333024",
} as const;

export type ColorName = keyof typeof COLORS;
