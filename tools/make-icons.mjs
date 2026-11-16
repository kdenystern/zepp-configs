// Regenerates every image asset: app icons, launcher tile icons and the watch
// face artwork. Run with: npm run icons
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { sharp, root } from './sharp.mjs'
import { ICON_TABLE } from '../shared/icons.js'
import { TILE, TILE_RADIUS } from '../shared/layout.js'
import { FACE, ACCENT } from '../apps/watchface/watchface/layout.js'
import { SERIES } from '../apps/weather/lib/palette.js'

const images = {} // path relative to the repo -> svg

// --- app icons: 248x248 round with a 4px transparent safe area (Zepp spec) ---

const appIcon = (background, body) => `
<svg xmlns="http://www.w3.org/2000/svg" width="248" height="248" viewBox="0 0 248 248">
  <circle cx="124" cy="124" r="120" fill="${background}"/>
  ${body}
</svg>`

function launcherIcon() {
  const size = 36
  const gap = 10
  const start = 124 - (3 * size + 2 * gap) / 2
  let tiles = ''
  for (let i = 0; i < 9; i++) {
    const x = start + (i % 3) * (size + gap)
    const y = start + Math.floor(i / 3) * (size + gap)
    tiles += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="${i === 4 ? '#ffd166' : '#ffffff'}"/>`
  }
  return appIcon('#2b5fd9', tiles)
}

function nutritionIcon() {
  return appIcon(
    '#2f9e55',
    `<circle cx="124" cy="124" r="70" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="16"/>
     <path d="M124 54 A70 70 0 1 1 54 124" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
     <rect x="116" y="92" width="16" height="64" rx="8" fill="#ffffff"/>
     <rect x="92" y="116" width="64" height="16" rx="8" fill="#ffffff"/>`,
  )
}

images['apps/launcher/assets/default.s/icon.png'] = launcherIcon()
images['apps/nutrition/assets/default.s/icon.png'] = nutritionIcon()
// The weather icon is added further down, once glyph() exists.

// --- tile icons: a coloured rounded square with a white Phosphor glyph ---

const shade = (hex, factor) =>
  '#' +
  [1, 3, 5]
    .map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor))))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')

async function glyph(name, style = 'fill') {
  const file = join(root, 'node_modules/@phosphor-icons/core/assets', style, `${name}${style === 'regular' ? '' : '-' + style}.svg`)
  const svg = await readFile(file, 'utf8')
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

// Phosphor glyphs are drawn on a 256 grid; the glyph fills 58% of the tile.
// Flat colour: gradients band on this screen.
function tileSvg(inner, color, pressed) {
  const size = TILE * 0.58
  const offset = (TILE - size) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">
  <rect width="${TILE}" height="${TILE}" rx="${TILE_RADIUS}" fill="${pressed ? shade(color, 0.6) : color}"/>
  <g transform="translate(${offset} ${offset}) scale(${size / 256})" fill="${pressed ? '#d0d0d0' : '#ffffff'}">${inner}</g>
</svg>`
}

const TILE_DIRS = ['apps/launcher/assets/default.s/icons']
for (const dir of TILE_DIRS) await rm(join(root, dir), { recursive: true, force: true })

for (const [name, [phosphor, color]] of Object.entries(ICON_TABLE)) {
  const inner = await glyph(phosphor)
  for (const dir of TILE_DIRS) {
    images[`${dir}/${name}.png`] = tileSvg(inner, color, false)
    images[`${dir}/${name}_p.png`] = tileSvg(inner, color, true)
  }
}

// --- weather app: thin-line condition icons and a small icon per chart ---

const glyphSvg = (inner, size, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <g transform="scale(${size / 256})" fill="${color}">${inner}</g>
</svg>`

images['apps/weather/assets/default.s/icon.png'] = appIcon(
  '#1c7ed6',
  `<g transform="translate(46 46) scale(${156 / 256})" fill="#ffffff">${await glyph('cloud-sun')}</g>`,
)

const wx = 'apps/weather/assets/default.s/wx'
await rm(join(root, wx), { recursive: true, force: true })

// Names used by condition() in apps/weather/lib/forecast.js -> Phosphor icon.
const CONDITION_GLYPHS = {
  sun: 'sun',
  moon: 'moon',
  'cloud-sun': 'cloud-sun',
  'cloud-moon': 'cloud-moon',
  cloud: 'cloud',
  fog: 'cloud-fog',
  rain: 'cloud-rain',
  snow: 'cloud-snow',
  storm: 'cloud-lightning',
}
for (const [name, phosphor] of Object.entries(CONDITION_GLYPHS)) {
  images[`${wx}/${name}.png`] = glyphSvg(await glyph(phosphor, 'light'), 60, '#ffffff')
}

const css = (color) => '#' + color.toString(16).padStart(6, '0')
const CHART_GLYPHS = {
  temp: ['thermometer-simple', SERIES.temp],
  drop: ['drop', SERIES.rain],
  snow: ['snowflake', SERIES.snow],
  wind: ['wind', SERIES.wind],
}
for (const [name, [phosphor, color]] of Object.entries(CHART_GLYPHS)) {
  images[`${wx}/s-${name}.png`] = glyphSvg(await glyph(phosphor, 'bold'), 22, css(color))
}

// --- watch face: thin lines only, which is what reads well on this screen ---

const face = 'apps/watchface/assets/default.s/face'
for (const old of ['face', 'icons', 'clock']) {
  await rm(join(root, 'apps/watchface/assets/default.s', old), { recursive: true, force: true })
}

const GREY = '#8a8a8a'

// Text centred in a w x h box. `outline` draws hollow letters with a thin stroke.
function textSvg(text, { w, h, size, color, weight = 'normal', family = 'DejaVu Sans', outline = 0, spacing = 0 }) {
  // Cap height of DejaVu is 0.729em; centre the capitals vertically.
  const baseline = (h + size * 0.729) / 2
  const paint = outline
    ? `fill="none" stroke="${color}" stroke-width="${outline}" stroke-linejoin="round"`
    : `fill="${color}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <text x="${w / 2 + spacing / 2}" y="${baseline}" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" ${paint} text-anchor="middle">${text}</text>
</svg>`
}

const big = { ...FACE.big, size: 150, weight: 'bold', family: 'DejaVu Sans Condensed', outline: 2 }
for (let d = 0; d <= 9; d++) {
  images[`${face}/h${d}.png`] = textSvg(d, { ...big, color: '#ffffff' })
  images[`${face}/m${d}.png`] = textSvg(d, { ...big, color: ACCENT })
  images[`${face}/d${d}.png`] = textSvg(d, { w: FACE.day.w, h: FACE.day.h, size: 44, color: '#ffffff', family: 'DejaVu Sans Light' })
  images[`${face}/t${d}.png`] = textSvg(d, { ...FACE.tiny, size: 20, color: '#d0d0d0' })
  images[`${face}/p${d}.png`] = textSvg(d, { ...FACE.pct, size: 28, color: '#d0d0d0' })
}
;['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((day, i) => {
  images[`${face}/week${i + 1}.png`] = textSvg(day, { w: FACE.week.w, h: FACE.week.h, size: 22, color: ACCENT, spacing: 4 })
})

// Static background: rules, the battery ring's track and the two small icons.
const icon = async (name, spot) => {
  const k = FACE.iconSize / 256
  return `<g transform="translate(${spot.x} ${spot.y}) scale(${k})" fill="${GREY}">${await glyph(name, 'light')}</g>`
}
images[`${face}/bg.png`] = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="450">
  <rect width="390" height="450" fill="#000000"/>
  ${FACE.rules.map((r) => `<line x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" stroke="#3a3a3a" stroke-width="1.5"/>`).join('')}
  <circle cx="${FACE.ring.cx}" cy="${FACE.ring.cy}" r="${FACE.ring.r}" fill="none" stroke="#2c2c2c" stroke-width="${FACE.ring.width}"/>
  ${await icon('footprints', FACE.steps.icon)}
  ${await icon('heartbeat', FACE.heart.icon)}
</svg>`

// Launcher button: a ring with a 3x3 grid of small hollow squares.
function launchSvg(pressed) {
  const n = FACE.launch.size
  const c = n / 2
  const cell = 11
  const gap = 6
  const start = c - (3 * cell + 2 * gap) / 2
  let cells = ''
  for (let i = 0; i < 9; i++) {
    const x = start + (i % 3) * (cell + gap)
    const y = start + Math.floor(i / 3) * (cell + gap)
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${pressed ? '#000000' : 'none'}" stroke="${pressed ? '#000000' : ACCENT}" stroke-width="1.5"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
  <circle cx="${c}" cy="${c}" r="${c - 3}" fill="${pressed ? ACCENT : '#000000'}" stroke="${ACCENT}" stroke-width="2"/>
  ${cells}
</svg>`
}
images[`${face}/launch.png`] = launchSvg(false)
images[`${face}/launch_p.png`] = launchSvg(true)

for (const [path, svg] of Object.entries(images)) {
  const out = resolve(root, path)
  await mkdir(dirname(out), { recursive: true })
  await sharp(Buffer.from(svg)).png().toFile(out)
}
console.log(`wrote ${Object.keys(images).length} images`)
