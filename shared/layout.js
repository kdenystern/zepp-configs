// Pure layout maths for the Launcher app's tiles, kept apart from the page so
// it can be tested without a watch. Everything is designed
// at 390 pixels wide (the Cheetah Square is 390x450) and scaled from there.

export const DESIGN_WIDTH = 390
export const TILE = 114 // size of the tile images in assets/*/icons
export const TILE_RADIUS = 34

const MARGIN = 16
const GAP = 8

// Square tiles, three to a row. The first three rows sit along the bottom of
// the screen under a header band, as a 3x3 block; further rows continue below
// and the page scrolls. Returns { size, radius, rects, header, bottom }, where
// `bottom` is how far down the page should extend so the last row can scroll
// clear of the rounded screen corners.
export function tileLayout(width, height, count = 9) {
  const scale = width / DESIGN_WIDTH
  const margin = Math.round(MARGIN * scale)
  const gap = Math.round(GAP * scale)
  const size = Math.floor((width - 2 * margin - 2 * gap) / 3)
  const span = 3 * size + 2 * gap
  const x0 = Math.floor((width - span) / 2)
  const y0 = height - margin - span

  const rects = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3
    rects.push({ x: x0 + col * (size + gap), y: y0 + row * (size + gap), w: size, h: size })
  }
  const rows = Math.ceil(count / 3)
  const bottom = rows > 3 ? y0 + rows * (size + gap) - gap + Math.round(72 * scale) : height
  return { size, radius: Math.round(TILE_RADIUS * scale), rects, header: { y: 0, h: y0 - gap }, bottom, scale }
}

// Button text is a single line, so shrink it as the label grows.
export function labelSize(label) {
  const n = String(label).length
  if (n <= 6) return 28
  if (n <= 8) return 24
  if (n <= 10) return 20
  return 18
}

// Darker shade of a 0xRRGGBB colour, for the pressed state.
export function darken(color, factor = 0.65) {
  const r = Math.round(((color >> 16) & 0xff) * factor)
  const g = Math.round(((color >> 8) & 0xff) * factor)
  const b = Math.round((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}
