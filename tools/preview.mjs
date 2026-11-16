// Draws the watch screens to docs/*.png by running the real page code against
// the mock runtime in test/support. These are approximations for checking
// layout (the watch has its own font and renderer), not screenshots.
//
//   node --import ./test/support/register.mjs tools/preview.mjs
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { sharp, root } from './sharp.mjs'
import {
  loadApp,
  reset,
  world,
  startApp,
  startWatchface,
  closeApp,
  flush,
  button,
  tap,
} from '../test/support/harness.mjs'
import { settingsStorage } from '../test/support/harness.mjs'

const SCREEN = { width: 390, height: 450, radius: 86 }

const hex = (color) => '#' + (color || 0).toString(16).padStart(6, '0')
const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function drawText(w, { centre }) {
  const { x, y, w: width, h, text, text_size: size = 20, color = 0xffffff, align_h: alignH } = w.params
  if (!text) return ''
  let anchor = 'start'
  let tx = x
  if (centre || alignH === 'CENTER_H') {
    anchor = 'middle'
    tx = x + width / 2
  } else if (alignH === 'RIGHT') {
    anchor = 'end'
    tx = x + width
  }
  // Wrapping is not simulated; text is centred vertically on one line.
  const ty = y + h / 2 + size * 0.36
  return `<text x="${tx}" y="${ty}" font-family="DejaVu Sans" font-size="${size}" fill="${hex(color)}" text-anchor="${anchor}">${escape(text)}</text>`
}

function image(src, x, y, w, h) {
  const data = readFileSync(join(root, 'apps', app, 'assets/default.s', src)).toString('base64')
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${data}"/>`
}

const two = (n) => String(n).padStart(2, '0')

function drawWidget(w) {
  if (!w.visible) return ''
  const p = w.params
  const { x, y, w: width, h, radius = 0 } = p
  if (w.type === 'FILL_RECT') {
    return `<rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${radius}" fill="${hex(p.color)}"/>`
  }
  if (w.type === 'BUTTON' && p.normal_src) {
    const [iw, ih] = pngSize(p.normal_src)
    return image(p.normal_src, x, y, iw, ih)
  }
  if (w.type === 'BUTTON') {
    return (
      `<rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${radius}" fill="${hex(p.normal_color)}"/>` +
      drawText(w, { centre: true })
    )
  }
  if (w.type === 'TEXT') return drawText(w, { centre: false })
  if (w.type === 'IMG') return image(p.src, x, y, ...pngSize(p.src))
  // The watch draws the rest itself from image arrays; imitate it with sample data.
  const row = (sources, startX, startY) => {
    let cx = startX
    return sources
      .map((src) => {
        const [iw, ih] = pngSize(src)
        const out = image(src, cx, startY, iw, ih)
        cx += iw
        return out
      })
      .join('')
  }
  const pick = (array, number) => [...two(number)].map((c) => array[Number(c)])
  if (w.type === 'IMG_TIME') {
    return (
      row(pick(p.hour_array, world.now.getHours()), p.hour_startX, p.hour_startY) +
      row(pick(p.minute_array, world.now.getMinutes()), p.minute_startX, p.minute_startY)
    )
  }
  if (w.type === 'IMG_WEEK') return row([p.week_en[(world.now.getDay() + 6) % 7]], x, y)
  if (w.type === 'IMG_DATE') return row(pick(p.day_en_array, world.now.getDate()), p.day_startX, p.day_startY)
  const SAMPLE = { BATTERY: 72, STEP: 6482, HEART: 64 }
  if (w.type === 'TEXT_IMG') {
    const sources = [...String(SAMPLE[p.type])].map((c) => p.font_array[Number(c)])
    const total = sources.reduce((sum, src) => sum + pngSize(src)[0], 0)
    return row(sources, p.align_h === 'CENTER_H' ? x + (width - total) / 2 : x, y)
  }
  if (w.type === 'ARC_PROGRESS') {
    const sweep = (SAMPLE[p.type] / 100) * (p.end_angle - p.start_angle)
    const point = (deg) => {
      const rad = (deg * Math.PI) / 180
      return `${p.center_x + p.radius * Math.cos(rad)} ${p.center_y + p.radius * Math.sin(rad)}`
    }
    return `<path d="M ${point(p.start_angle)} A ${p.radius} ${p.radius} 0 ${sweep > 180 ? 1 : 0} 1 ${point(p.start_angle + sweep)}" fill="none" stroke="${hex(p.color)}" stroke-width="${p.line_width}" stroke-linecap="round"/>`
  }
  return ''
}

function pngSize(src) {
  const data = readFileSync(join(root, 'apps', app, 'assets/default.s', src))
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

// The current page, scrolled down by `scroll` pixels, clipped to the watch's
// rounded screen.
async function snapshot(name, scroll = 0) {
  const { width, height, radius } = SCREEN
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 40}" height="${height + 40}">
  <rect width="100%" height="100%" fill="#1b1b1f"/>
  <g transform="translate(20 20)">
    <clipPath id="screen"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
    <rect width="${width}" height="${height}" rx="${radius}" fill="#000"/>
    <g clip-path="url(#screen)"><g transform="translate(0 ${-scroll})">${world.widgets.map(drawWidget).join('')}</g></g>
  </g>
</svg>`
  const out = join(root, 'docs', name + '.png')
  await mkdir(dirname(out), { recursive: true })
  await sharp(Buffer.from(svg)).png().toFile(out)
  console.log('wrote docs/' + name + '.png')
}

const app = process.argv[2]
if (!['watchface', 'launcher', 'nutrition', 'weather'].includes(app)) {
  console.error('usage: preview.mjs watchface|launcher|nutrition|weather')
  process.exit(1)
}

// App modules load once per process, so each app is drawn in its own run.
const entry = await loadApp(app)
reset()

if (app === 'watchface') {
  world.now = new Date(2026, 10, 16, 9, 41, 0)
  startWatchface()
  await snapshot('watchface')
  // The picture the Zepp app shows for the watch face: the bare screen at the
  // Cheetah Square's preview size.
  await sharp(join(root, 'docs/watchface.png'))
    .extract({ left: 20, top: 20, width: SCREEN.width, height: SCREEN.height })
    .resize(266, 307)
    .png()
    .toFile(join(root, 'apps/watchface/assets/default.s/preview.png'))
  console.log('wrote apps/watchface/assets/default.s/preview.png')
} else if (app === 'launcher') {
  startApp(entry)
  await flush()
  await snapshot('launcher')
  // More than nine tiles: the page scrolls.
  settingsStorage.setItem(
    'config',
    'workout\nhr\ntimer\nstopwatch\nalarm\nweather\nmusic\nNutrition = app:68232:page/index @food\nsettings\nsleep\ncompass\ncalendar\nCalc = app:1:page/index @calculator\nNotes = app:2:page/index',
  )
  const bottom = Math.max(...world.widgets.map((w) => w.params.y + (w.params.h > 0 ? w.params.h : 114)))
  await snapshot('launcher-scrolled', bottom - SCREEN.height)
} else if (app === 'weather') {
  // A real Open-Meteo answer (Helsinki), looked at in the early afternoon.
  const sample = JSON.parse(readFileSync(join(root, 'test/fixtures/open-meteo-forecast.json'), 'utf8'))
  world.now = new Date((sample.hourly.time[0] + 13.6 * 3600) * 1000)
  sample.current = { ...sample.current, time: sample.hourly.time[13], temperature_2m: 6.9, apparent_temperature: 1.2, is_day: 1 }
  world.internet = (url) => (url.includes('geocoding') ? { results: [] } : sample)
  settingsStorage.setItem('place', JSON.stringify({ name: 'Helsinki', region: 'Uusimaa, Finland', lat: 60.17, lon: 24.94 }))
  startApp(entry)
  await flush()
  await snapshot('weather')
  tap(world.widgets.find((w) => w.type === 'BUTTON'))
  await snapshot('weather-tomorrow')
} else {
  startApp(entry)
  await flush()
  tap(button('Meal: 600 kcal, 35 g'))
  tap(button('Protein shake: 150 kcal, 30 g'))
  await snapshot('nutrition')
  const bottom = Math.max(...world.widgets.map((w) => w.params.y + w.params.h))
  await snapshot('nutrition-scrolled', bottom - SCREEN.height)
  tap(button('+ kcal'))
  ;[...'350'].forEach((digit) => tap(button(digit)))
  await snapshot('nutrition-add')
}
closeApp()
