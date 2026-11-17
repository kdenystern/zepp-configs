// Chart geometry for the Weather page. Everything is drawn with plain
// FILL_RECT widgets, the one drawing primitive already proven on the watch,
// so this turns data into lists of { x, y, w, h } rectangles. Pure logic.

// A value range for an axis, widened to at least `minSpan` so that a day
// with an almost flat reading does not look dramatic.
export function range(values, minSpan) {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  return { lo, hi }
}

// The top edge of a line through evenly spaced `values`, `px` pixels from the
// left edge of the box.
function topAt(values, box, { lo, hi, thickness = 3 }) {
  const span = hi - lo || 1
  const last = values.length - 1
  return (px) => {
    const position = Math.min(last, Math.max(0, (px / box.w) * last))
    const i = Math.min(last - 1, Math.floor(position))
    const value = values[i] + (values[i + 1] - values[i]) * (position - i)
    return Math.round(box.y + (1 - (value - lo) / span) * (box.h - thickness))
  }
}

// A line through evenly spaced `values`, as columns `step` pixels wide. Each
// column is tall enough to reach its neighbours, so the pieces join up. Runs
// of identical columns are merged into one rectangle. `splitAt` (pixels from
// the left edge of the box) keeps the pieces before and after it apart, and
// each piece says which side it is on with `before`.
export function lineRects(values, box, { lo, hi, step = 3, thickness = 3, splitAt = null }) {
  const top = topAt(values, box, { lo, hi, thickness })
  const split = splitAt === null ? null : Math.round(splitAt / step) * step

  const rects = []
  for (let px = 0; px < box.w; px += step) {
    const w = Math.min(step, box.w - px)
    const a = top(px)
    const b = top(px + w)
    const y = Math.min(a, b)
    const h = Math.abs(a - b) + thickness
    const before = split !== null && px < split
    const previous = rects[rects.length - 1]
    if (previous && previous.y === y && previous.h === h && previous.before === before) previous.w += w
    else rects.push({ x: box.x + px, y, w, h, before })
  }
  return rects
}

// The y of the line drawn by lineRects at `px` pixels from the left edge.
export const lineY = (values, box, scale, px) => topAt(values, box, scale)(px)

// One bar per value, standing on the bottom of the box, on a scale from zero
// to `max`. Values under `least` get no bar; the rest are at least `minH`
// tall so a trace still shows. Returns a list as long as `values`, with null
// where there is no bar.
export function barRects(values, box, { max, least = Number.MIN_VALUE, gap = 4, minH = 4 }) {
  const slot = box.w / values.length
  return values.map((value, i) => {
    if (!(value >= least)) return null
    const h = Math.max(minH, Math.min(box.h, Math.round((value / max) * box.h)))
    return { x: Math.round(box.x + i * slot + gap / 2), y: box.y + box.h - h, w: Math.round(slot - gap), h }
  })
}

// A step line through hourly `values`: a level across each value's slot and an
// upright joining it to the next level. Levels that run on unchanged are
// merged. `splitAt` (pixels from the left edge of the box) marks each piece
// that ends at or before it with `before`.
export function stepRects(values, box, { lo, hi, thickness = 2, splitAt = null }) {
  const span = hi - lo || 1
  const slot = box.w / values.length
  const edge = (i) => Math.round(i * slot)
  const top = (value) =>
    Math.round(box.y + (1 - (Math.min(hi, Math.max(lo, value)) - lo) / span) * (box.h - thickness))
  const isBefore = (px) => splitAt !== null && px <= splitAt

  const rects = []
  let level = null
  values.forEach((value, i) => {
    const y = top(value)
    const before = isBefore(edge(i + 1))
    if (level && level.y === y && level.before === before) level.w = box.x + edge(i + 1) - level.x
    else {
      level = { x: box.x + edge(i), y, w: edge(i + 1) - edge(i), h: thickness, before }
      rects.push(level)
    }
    const next = i + 1 < values.length ? top(values[i + 1]) : y
    if (next !== y) {
      const x = edge(i + 1) - Math.floor(thickness / 2)
      rects.push({ x: box.x + x, y: Math.min(y, next), w: thickness, h: Math.abs(next - y) + thickness, before: isBefore(x) })
      level = null
    }
  })
  return rects
}

// A short dash per value at its height, for readings that sit above a line
// (gusts above the wind speed).
export function dashRects(values, box, { lo, hi, gap = 6, thickness = 2 }) {
  const span = hi - lo || 1
  const slot = box.w / values.length
  return values.map((value, i) => ({
    x: Math.round(box.x + i * slot + gap / 2),
    y: Math.round(box.y + (1 - (Math.min(hi, value) - lo) / span) * (box.h - thickness)),
    w: Math.round(slot - gap),
    h: thickness,
  }))
}

// Scales a 0xRRGGBB colour towards black.
export function dim(color, factor) {
  const channel = (shift) => Math.round(((color >> shift) & 0xff) * factor) << shift
  return channel(16) | channel(8) | channel(0)
}
