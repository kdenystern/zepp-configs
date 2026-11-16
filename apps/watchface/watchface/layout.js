// Where everything sits on the watch face, in pixels at 390x450 (the design
// size). tools/make-icons.mjs draws the images from the same numbers, and the
// build scales images for other screens, so positions are scaled to match.

export const ACCENT = '#c8ff3d'

export const FACE = {
  // Outlined hour digits over outlined minute digits, left side.
  big: { w: 100, h: 124 },
  hour: { x: 34, y: 46 },
  minute: { x: 34, y: 188 },
  // Right column: weekday, day of month, battery ring.
  week: { x: 272, y: 58, w: 88, h: 26 },
  day: { x: 290, y: 92, w: 28, h: 42 },
  ring: { cx: 320, cy: 204, r: 36, width: 3 },
  // Small numbers for steps and heart rate.
  tiny: { w: 15, h: 25 },
  // Battery percent inside the ring, in larger digits; "100" just fits.
  pct: { w: 20, h: 34 },
  battery: { x: 290, y: 187, w: 60 },
  steps: { x: 74, y: 372, w: 70, icon: { x: 40, y: 368 } },
  heart: { x: 190, y: 372, w: 44, icon: { x: 156, y: 368 } },
  iconSize: 28,
  // Thin rules framing the time.
  rules: [
    { x1: 256, y1: 52, x2: 256, y2: 312 },
    { x1: 36, y1: 338, x2: 256, y2: 338 },
  ],
  // Launcher button, bottom right, inside the rounded corner.
  launch: { x: 282, y: 342, size: 88 },
}

export const scaled = (width) => {
  const k = width / 390
  return (n) => Math.round(n * k)
}
