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
  // Wrapped text breaks where DejaVu is estimated to run out of room; other
  // text stays on one line. Either way it is centred vertically.
  const lines = w.params.text_style === 'WRAP' ? wrap(text, size, width) : [text]
  const pitch = size * 1.25
  return lines
    .map((line, i) => {
      const ty = y + h / 2 + size * 0.36 + (i - (lines.length - 1) / 2) * pitch
      return `<text x="${tx}" y="${ty}" font-family="DejaVu Sans" font-size="${size}" fill="${hex(color)}" text-anchor="${anchor}">${escape(line)}</text>`
    })
    .join('')
}

// Rough DejaVu Sans advance widths, in em.
function textWidth(text, size) {
  let em = 0
  for (const c of text) {
    if ("iljI.,:;'|!".includes(c)) em += 0.3
    else if (' ftr()-'.includes(c)) em += 0.38
    else if ('mwMW'.includes(c)) em += 0.92
    else if (c >= 'A' && c <= 'Z') em += 0.7
    else em += 0.62
  }
  return em * size
}

function wrap(text, size, width) {
  const lines = []
  let line = ''
  for (const word of String(text).split(' ')) {
    const longer = line ? line + ' ' + word : word
    if (line && textWidth(longer, size) > width) {
      lines.push(line)
      line = word
    } else {
      line = longer
    }
  }
  return lines.concat(line)
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

// Everything on the page: its own widgets first, then each VIEW_CONTAINER
// layer in z order, clipped to its box. `scroll` moves the page and the
// layers that can scroll.
function drawPage(scroll) {
  const own = world.widgets.filter((w) => !w.parent && w.type !== 'VIEW_CONTAINER')
  const layers = world.widgets
    .filter((w) => w.type === 'VIEW_CONTAINER')
    .sort((a, b) => (a.params.z_index || 0) - (b.params.z_index || 0))
  const layer = (box, i) => {
    const { x, y, w, h, scroll_enable: scrolls = 1 } = box.params
    const inside = world.widgets.filter((child) => child.parent === box)
    return `<clipPath id="layer${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
    <g clip-path="url(#layer${i})"><g transform="translate(${x} ${y - (scrolls ? scroll : 0)})">${inside.map(drawWidget).join('')}</g></g>`
  }
  return `<g transform="translate(0 ${-scroll})">${own.map(drawWidget).join('')}</g>${layers.map(layer).join('')}`
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
    <g clip-path="url(#screen)">${drawPage(scroll)}</g>
  </g>
</svg>`
  const out = join(root, 'docs', name + '.png')
  await mkdir(dirname(out), { recursive: true })
  await sharp(Buffer.from(svg)).png().toFile(out)
  console.log('wrote docs/' + name + '.png')
}

const app = process.argv[2]
if (!['watchface', 'launcher', 'nutrition', 'weather', 'tasks', 'water', 'buzz'].includes(app)) {
  console.error('usage: preview.mjs watchface|launcher|nutrition|weather|tasks|water|buzz')
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
  const ensemble = JSON.parse(readFileSync(join(root, 'test/fixtures/open-meteo-ensemble.json'), 'utf8'))
  world.internet = (url) => (url.includes('geocoding') ? { results: [] } : url.includes('ensemble') ? ensemble : sample)
  settingsStorage.setItem('place', JSON.stringify({ name: 'Helsinki', region: 'Uusimaa, Finland', lat: 60.17, lon: 24.94 }))
  startApp(entry)
  await flush()
  await snapshot('weather')
  tap(world.widgets.find((w) => w.type === 'BUTTON'))
  if (process.env.LOADING) await snapshot('weather-loading')
  // The new day is drawn under a spinner, a batch at a time.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await snapshot('weather-tomorrow')
} else if (app === 'tasks') {
  // Tasks are typed into the settings page on the phone.
  const { settingsPage, nodes } = await import('../test/support/harness.mjs')
  const add = (text) => nodes(settingsPage(), 'TextInput')[0].props.onChange(text)
  ;['Take pills every day', 'Workout every 3 days', 'Buy milk and star anise', 'Water the plants every week', 'Call the dentist'].forEach(add)
  startApp(entry)
  await flush()
  const rows = () => world.widgets.filter((w) => w.type === 'BUTTON' && w.visible && w.params.normal_src)
  tap(rows()[3])
  await snapshot('tasks')
  while (rows().length) tap(rows()[0])
  await snapshot('tasks-done')
  // More than a screenful: the list scrolls under Undo.
  ;['Stretch every day', 'Reply to Anna', 'Charge the watch every 5 days', 'Vitamin D every day', 'Take the bins out every Mon'].forEach(add)
  const undo = () => world.widgets.find((w) => w.type === 'BUTTON' && w.params.text === 'Undo')
  for (let i = 0; i < 4; i++) tap(undo())
  await snapshot('tasks-long', 150)
} else if (app === 'buzz') {
  world.now = new Date(2026, 10, 19, 14, 5, 0)
  startApp(entry)
  await flush()
  tap(button('Gentle'))
  await snapshot('buzz')
} else if (app === 'water') {
  // Tapped at 12:10: a little over a third left at 14:05, then dry at 15:10.
  world.now = new Date(2026, 10, 18, 12, 10, 0)
  startApp(entry)
  await flush()
  const drop = () => world.widgets.find((w) => w.type === 'BUTTON' && w.visible)
  tap(drop())
  world.now = new Date(2026, 10, 18, 14, 5, 0)
  world.page.render()
  await snapshot('water')
  world.now = new Date(2026, 10, 18, 15, 10, 0)
  world.page.render()
  await snapshot('water-dry')
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
