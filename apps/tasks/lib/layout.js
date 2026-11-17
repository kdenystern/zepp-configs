// Where the list sits on the watch, in pixels at 390x450 (the design size).
// tools/make-icons.mjs draws the row images from the same numbers.

export const ACCENT = '#c8ff3d'

// One task: a ring to tick on the left, the title beside it, a thin rule
// underneath. The whole row is one image button laid over the title.
export const ROW = {
  x: 24,
  y: 62, // top of the first row
  w: 342,
  h: 64,
  ring: { cx: 20, r: 12 },
  text: { x: 46, size: 24 },
}
