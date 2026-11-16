import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { tileLayout, labelSize, darken, TILE, TILE_RADIUS } from '../shared/layout.js'
import { FACE } from '../apps/watchface/watchface/layout.js'
import { ICONS, ICON_TABLE } from '../shared/icons.js'

const SCREEN = { width: 390, height: 450, cornerRadius: 86 }
const layout = tileLayout(SCREEN.width, SCREEN.height)

// Is the point inside a rounded rectangle? Used for both screen and tiles.
function insideRounded(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r + 1e-9
}
const onScreen = (px, py) =>
  insideRounded(px, py, -1, -1, SCREEN.width + 2, SCREEN.height + 2, SCREEN.cornerRadius + 1)

// Width and height from a PNG file's header.
function pngSize(path) {
  const data = readFileSync(new URL('../' + path, import.meta.url))
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

test('the grid is nine square tiles, the size of the tile images, that do not overlap', () => {
  const { rects, size } = layout
  assert.equal(rects.length, 9)
  assert.equal(size, TILE)
  rects.forEach((r, i) => {
    assert.equal(r.w, r.h, 'tiles are square')
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= SCREEN.width && r.y + r.h <= SCREEN.height)
    rects.slice(i + 1).forEach((o) => {
      const apart = r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y
      assert.ok(apart, 'tiles overlap')
    })
  })
  // Reads left to right, top to bottom, with even margins left and right.
  assert.ok(rects[1].x > rects[0].x && rects[1].y === rects[0].y)
  assert.ok(rects[3].y > rects[0].y && rects[3].x === rects[0].x)
  assert.equal(rects[0].x, SCREEN.width - (rects[2].x + rects[2].w))
})

test('up to nine tiles fit one screen under a header band', () => {
  assert.ok(layout.header.h >= 40, `header is ${layout.header.h}px`)
  assert.ok(layout.rects[0].y > layout.header.h)
  assert.equal(layout.bottom, SCREEN.height, 'nothing to scroll')
  const few = tileLayout(SCREEN.width, SCREEN.height, 4)
  assert.deepEqual(few.rects, layout.rects.slice(0, 4), 'fewer tiles keep the same places')
  assert.equal(few.bottom, SCREEN.height)
})

test('more than nine tiles continue in rows below the screen, with room to scroll clear of the corners', () => {
  const many = tileLayout(SCREEN.width, SCREEN.height, 14)
  assert.equal(many.rects.length, 14)
  assert.deepEqual(many.rects.slice(0, 9), layout.rects, 'the first nine do not move')
  const last = many.rects[13]
  assert.equal(last.x, layout.rects[1].x, 'fourteenth tile is in the middle column')
  assert.ok(last.y > SCREEN.height - TILE)
  many.rects.forEach((r) => assert.equal(r.w, r.h))
  // Scrolled to the end, the last row sits above the rounded bottom corners.
  assert.ok(many.bottom - (last.y + last.h) >= 60)
})

test("the bottom corner tiles are not cut off by the watch's rounded screen corners", () => {
  for (const r of [layout.rects[6], layout.rects[8]]) {
    for (let px = r.x; px <= r.x + r.w; px++) {
      for (let py = r.y; py <= r.y + r.h; py++) {
        if (!insideRounded(px, py, r.x, r.y, r.w, r.h, TILE_RADIUS)) continue
        assert.ok(onScreen(px, py), `tile pixel ${px},${py} is clipped`)
      }
    }
  }
})

test('the watch face launcher button is inside the rounded bottom-right corner', () => {
  const { x, y, size } = FACE.launch
  const c = size / 2
  for (let deg = 0; deg < 360; deg += 5) {
    const px = x + c + (c - 2) * Math.cos((deg * Math.PI) / 180)
    const py = y + c + (c - 2) * Math.sin((deg * Math.PI) / 180)
    assert.ok(insideRounded(px, py, 0, 0, SCREEN.width, SCREEN.height, SCREEN.cornerRadius), `button edge at ${deg}° is clipped`)
  }
  assert.ok(x + c > SCREEN.width / 2 && y + c > SCREEN.height / 2, 'bottom right quarter')
})

test('the watch face elements stay on screen and do not collide', () => {
  const boxes = {
    hours: { ...FACE.hour, w: 2 * FACE.big.w, h: FACE.big.h },
    minutes: { ...FACE.minute, w: 2 * FACE.big.w, h: FACE.big.h },
    week: FACE.week,
    day: { ...FACE.day, w: 2 * FACE.day.w },
    ring: { x: FACE.ring.cx - FACE.ring.r, y: FACE.ring.cy - FACE.ring.r, w: 2 * FACE.ring.r, h: 2 * FACE.ring.r },
    steps: { x: FACE.steps.icon.x, y: FACE.steps.icon.y, w: FACE.steps.x + FACE.steps.w - FACE.steps.icon.x, h: FACE.iconSize },
    heart: { x: FACE.heart.icon.x, y: FACE.heart.icon.y, w: FACE.heart.x + FACE.heart.w - FACE.heart.icon.x, h: FACE.iconSize },
    launch: { x: FACE.launch.x, y: FACE.launch.y, w: FACE.launch.size, h: FACE.launch.size },
  }
  const names = Object.keys(boxes)
  names.forEach((name, i) => {
    const a = boxes[name]
    if (name !== 'launch') {
      for (const [px, py] of [[a.x, a.y], [a.x + a.w, a.y], [a.x, a.y + a.h], [a.x + a.w, a.y + a.h]]) {
        assert.ok(onScreen(px, py), `${name} corner ${px},${py} is clipped`)
      }
    }
    names.slice(i + 1).forEach((other) => {
      const b = boxes[other]
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
      assert.ok(apart, `${name} overlaps ${other}`)
    })
  })
  // The battery number sits inside its ring.
  assert.ok(FACE.battery.x >= boxes.ring.x && FACE.battery.x + FACE.battery.w <= boxes.ring.x + boxes.ring.w)
})

test('the layout scales to other square screens', () => {
  for (const [w, h] of [
    [320, 380],
    [432, 514],
  ]) {
    const { rects, size, header } = tileLayout(w, h)
    const last = rects[8]
    assert.ok(last.x + last.w <= w && last.y + last.h <= h)
    assert.ok(Math.abs(size - Math.ceil((TILE * w) / 390)) <= 2, 'tiles match the scaled images')
    assert.ok(header.h > 30)
  }
})

test('longer labels get smaller text', () => {
  assert.ok(labelSize('Timer') > labelSize('Stopwatch'))
  assert.ok(labelSize('Stopwatch') > labelSize('World clock'))
})

test('darken keeps each channel in range', () => {
  assert.equal(darken(0xffffff, 0.5), 0x808080)
  assert.equal(darken(0x000000), 0x000000)
  assert.equal(darken(0x2f7fd6, 1), 0x2f7fd6)
})

test('every icon has a normal and a pressed tile image of the right size', () => {
  for (const name of ICONS) {
    for (const suffix of ['', '_p']) {
      const path = `apps/launcher/assets/default.s/icons/${name}${suffix}.png`
      assert.ok(existsSync(new URL('../' + path, import.meta.url)), `${path} is missing; run npm run icons`)
    }
  }
  assert.deepEqual(pngSize('apps/launcher/assets/default.s/icons/hr.png'), [TILE, TILE])
  assert.ok(ICONS.length >= 80)
  for (const [glyph, color] of Object.values(ICON_TABLE)) {
    assert.match(glyph, /^[a-z-]+$/)
    assert.match(color, /^#[0-9a-f]{6}$/)
  }
})

test('the watch face images exist at the sizes the layout assumes', () => {
  const dir = 'apps/watchface/assets/default.s/face/'
  assert.deepEqual(pngSize(dir + 'bg.png'), [390, 450])
  assert.deepEqual(pngSize(dir + 'h7.png'), [FACE.big.w, FACE.big.h])
  assert.deepEqual(pngSize(dir + 'm7.png'), [FACE.big.w, FACE.big.h])
  assert.deepEqual(pngSize(dir + 'd7.png'), [FACE.day.w, FACE.day.h])
  assert.deepEqual(pngSize(dir + 't7.png'), [FACE.tiny.w, FACE.tiny.h])
  assert.deepEqual(pngSize(dir + 'p7.png'), [FACE.pct.w, FACE.pct.h])
  assert.ok(3 * FACE.pct.w <= FACE.battery.w, '"100" fits the battery box')
  assert.deepEqual(pngSize(dir + 'week7.png'), [FACE.week.w, FACE.week.h])
  assert.deepEqual(pngSize(dir + 'launch.png'), [FACE.launch.size, FACE.launch.size])
  assert.deepEqual(pngSize(dir + 'launch_p.png'), [FACE.launch.size, FACE.launch.size])
  assert.deepEqual(pngSize('apps/watchface/assets/default.s/preview.png'), [266, 307])
})
