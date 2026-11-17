// Runs the real Weather page, side service and settings page against the mock
// watch, phone and internet in test/support.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import {
  loadApp,
  reset,
  world,
  startApp,
  closeApp,
  flush,
  buttons,
  tap,
  texts,
  images,
  widgetsOf,
  settingsPage,
  settingsText,
  settingsCards,
  assertDark,
  nodes,
} from './support/harness.mjs'
import { isChosen } from '../shared/settings-ui.js'

// A real Open-Meteo answer for Helsinki (UTC+2): 5-7 degrees, drizzle, windy.
const sample = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-forecast.json', import.meta.url), 'utf8'))
const START = sample.hourly.time[0]
const HELSINKI = { name: 'Helsinki', region: 'Uusimaa, Finland', lat: 60.17, lon: 24.94 }

const SEARCH = {
  Springfield: [
    { name: 'Springfield', latitude: 37.2, longitude: -93.3, admin1: 'Missouri', country: 'United States' },
    { name: 'Springfield', latitude: 39.8, longitude: -89.6, admin1: 'Illinois', country: 'United States' },
  ],
  Helsinki: [{ name: 'Helsinki', latitude: 60.17, longitude: 24.94, admin1: 'Uusimaa', country: 'Finland' }],
}

// The phone has internet: place search and forecasts both answer.
function online(forecast = sample) {
  world.internet = (url) => {
    const { hostname, searchParams } = new URL(url)
    if (hostname === 'geocoding-api.open-meteo.com') {
      const results = SEARCH[searchParams.get('name')]
      return results ? { results } : { generationtime_ms: 0.1 }
    }
    assert.equal(hostname, 'api.open-meteo.com')
    return forecast
  }
}

// Sets the watch and phone clocks to `hour` o'clock at the place, `day` days on.
const clockAt = (hour, day = 0) => (world.now = new Date((START + (day * 24 + hour) * 3600) * 1000))
// A place already chosen on the phone, before anything runs.
const choose = (place) => world.settings.set('place', JSON.stringify(place))

const forecastFetches = () => world.fetched.filter((url) => url.startsWith('https://api.open-meteo.com/'))
const chip = () => buttons()[0]
const rects = (color) => widgetsOf('FILL_RECT').filter((w) => w.params.color === color)
const placeCard = () => settingsCards(settingsPage())[0]
// The line under the Place title.
const placeLine = () => settingsText(placeCard())[1]
const placeButtons = () => nodes(placeCard(), 'Button')
// The pills for one unit, as [label, value's button] in the Units card.
const unitButtons = (nth) => nodes(nodes(settingsCards(settingsPage())[1], 'View')[2 * nth + 1], 'Button')
const search = (text) => nodes(settingsPage(), 'TextInput')[0].props.onChange(text)

let entry
before(async () => {
  entry = await loadApp('weather')
})
beforeEach(() => {
  reset()
  clockAt(13.6)
})

async function open() {
  startApp(entry)
  await flush()
}

// --- first run and choosing a place ---

test('with no place chosen it says where to choose one', async () => {
  online()
  await open()
  assert.deepEqual(texts(), ['Choose a place in the Zepp app: open the Weather app settings there.'])
  assert.deepEqual(world.fetched, [])
  assert.equal(world.statusBarVisible, false)
  assert.equal(placeLine(), 'No place chosen yet. Search for your town or city.')
})

test('a search on the phone picks the best match, and the open watch app shows it', async () => {
  online()
  await open()
  search('  Springfield ')
  await flush()

  assert.equal(world.settings.get('query'), 'Springfield')
  assert.equal(JSON.parse(world.settings.get('place')).region, 'Missouri, United States')
  assert.equal(placeLine(), 'The watch shows the weather for Springfield, Missouri, United States.')
  assert.equal(chip().params.text, 'Springfield, today')
  assert.equal(forecastFetches().length, 1)
  assert.match(forecastFetches()[0], /latitude=37\.2&longitude=-93\.3/)
})

test('the other matches are offered as buttons, and choosing one switches the watch', async () => {
  online()
  await open()
  search('Springfield')
  await flush()

  const offered = () => placeButtons().map((b) => [b.props.label, isChosen(b)])
  assert.deepEqual(offered(), [
    ['Springfield, Missouri, United States', true],
    ['Springfield, Illinois, United States', false],
  ])

  placeButtons()[1].props.onClick()
  await flush()
  assert.equal(offered()[1][1], true)
  assert.equal(offered()[0][1], false)
  assert.equal(placeLine(), 'The watch shows the weather for Springfield, Illinois, United States.')
  assert.equal(forecastFetches().length, 2)
  assert.match(forecastFetches()[1], /latitude=39\.8&longitude=-89\.6/)
})

test('a search that finds nothing says so and keeps the current place', async () => {
  online()
  choose(HELSINKI)
  await open()
  search('Qqqqzz')
  await flush()
  assert.ok(settingsText(settingsPage()).includes('Nothing found for "Qqqqzz". Try the nearest larger town.'))
  assert.deepEqual(placeButtons(), [])
  assert.equal(JSON.parse(world.settings.get('place')).name, 'Helsinki')
})

test('a search without internet says it failed', async () => {
  await open()
  search('Helsinki')
  await flush()
  assert.ok(settingsText(settingsPage()).includes('The search failed. Check the internet connection and try again.'))
  assert.equal(world.settings.get('place'), undefined)
})

test('a place typed while the phone service was not running is looked up when the watch asks', async () => {
  online()
  world.settings.set('query', 'Helsinki')
  await open()
  assert.equal(JSON.parse(world.settings.get('place')).name, 'Helsinki')
  assert.equal(chip().params.text, 'Helsinki, today')
})

test('a typed place that does not exist is reported on the watch', async () => {
  online()
  world.settings.set('query', 'Qqqqzz')
  await open()
  assert.deepEqual(texts(), ['The place was not found. Search again in the Weather app settings on the phone.'])
})

// --- the day at a glance ---

test('shows now, then temperature, rain and wind over the day', async () => {
  online()
  choose(HELSINKI)
  clockAt(20.2) // just after the sample was measured
  await open()

  assert.equal(chip().params.text, 'Helsinki, today')
  for (const text of ['5°', 'Drizzle', 'Feels -1°', '5° to 7°', '6.5 mm, 100%', 'S, 8 to 12 m/s, gusts 19', 'Updated 20:12']) {
    assert.ok(texts().includes(text), `"${text}" not in ${JSON.stringify(texts())}`)
  }
  assert.deepEqual(images(), ['wx/rain.png', 'wx/s-temp.png', 'wx/s-drop.png', 'wx/s-wind.png'])
  // Hour marks along the bottom.
  for (const hour of ['0', '6', '12', '18', '24']) assert.ok(texts().includes(hour))
  // A bar for each of the 14 hours with rain; the 10 already past are dimmer.
  assert.equal(rects(0x3987e5).length, 4)
  assert.equal(rects(0x1a3d67).length, 10)
  // A "now" line through each of the three charts.
  assert.equal(rects(0x8a8a8a).length, 3)
  rects(0x8a8a8a).forEach((line) => assert.equal(line.params.x, 27 + Math.round((20.2 / 24) * 336) - 1))
})

test('every widget is on the screen and every image exists', async () => {
  online()
  choose(HELSINKI)
  for (const tomorrow of [false, true]) {
    await open()
    if (tomorrow) tap(chip())
    assert.ok(world.widgets.length < 250, `${world.widgets.length} widgets`)
    for (const w of world.widgets) {
      const { x, y, w: width = 0, h = 0 } = w.params
      assert.ok(x >= 0 && y >= 0 && x + width <= 390 && y + h <= 450, `${w.type} at ${x},${y} ${width}x${h}`)
      // Clear of the rounded corners (radius 86) at the widget's own height.
      if (w.type === 'FILL_RECT' || w.type === 'IMG') {
        const inset = (edge) => (edge >= 86 ? 0 : 86 - Math.sqrt(86 * 86 - (86 - edge) ** 2))
        const cut = Math.max(inset(y), inset(450 - (y + h)))
        assert.ok(x >= cut && x + width <= 390 - cut, `${w.type} at ${x},${y} is cut by a corner`)
      }
    }
    for (const src of images()) {
      assert.ok(existsSync(new URL('../apps/weather/assets/default.s/' + src, import.meta.url)), src)
    }
    closeApp()
  }
})

test('all the condition icons are drawn', async () => {
  const { CONDITION_ICONS } = await import('../apps/weather/lib/forecast.js')
  for (const icon of [...CONDITION_ICONS, 's-temp', 's-drop', 's-snow', 's-wind']) {
    assert.ok(existsSync(new URL(`../apps/weather/assets/default.s/wx/${icon}.png`, import.meta.url)), icon)
  }
})

test('snow is drawn in its own colour with a snowflake', async () => {
  const snowy = structuredClone(sample)
  snowy.hourly.snowfall = [...snowy.hourly.precipitation] // 1 cm of snow for every mm
  online(snowy)
  choose(HELSINKI)
  await open()
  assert.ok(images().includes('wx/s-snow.png'))
  assert.ok(texts().includes('6.5 cm snow, 100%'))
  assert.equal(rects(0x3987e5).length, 0)
  assert.ok(rects(0xe6edf5).length > 0)
})

test('tapping the place flips to tomorrow and back', async () => {
  online()
  choose(HELSINKI)
  await open()
  tap(chip())
  assert.equal(chip().params.text, 'Helsinki, tomorrow')
  for (const text of ['6°', 'Drizzle', 'Low 5°', '5° to 6°', '11.1 mm, 100%', '6 to 9 m/s, gusts 14']) {
    assert.ok(texts().includes(text), `"${text}" not in ${JSON.stringify(texts())}`)
  }
  // Tomorrow has no "now" and nothing dimmed as past.
  assert.equal(rects(0x8a8a8a).length, 0)
  assert.equal(rects(0x1a3d67).length, 0)

  tap(chip())
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.equal(rects(0x8a8a8a).length, 3)
})

// --- units ---

test('changing the units on the phone refetches in those units', async () => {
  online()
  choose(HELSINKI)
  await open()
  const chosen = (nth) => unitButtons(nth).filter(isChosen).map((b) => b.props.label)
  assert.deepEqual(chosen(0), ['Celsius (°C), rain in mm'])
  assert.deepEqual(unitButtons(1).map((b) => b.props.label), ['m/s', 'km/h', 'mph', 'knots'])
  assert.deepEqual(chosen(1), ['m/s'])

  unitButtons(0)[1].props.onClick()
  await flush()
  unitButtons(1)[2].props.onClick()
  await flush()

  assert.equal(forecastFetches().length, 3)
  const asked = new URL(forecastFetches()[2]).searchParams
  assert.equal(asked.get('temperature_unit'), 'fahrenheit')
  assert.equal(asked.get('precipitation_unit'), 'inch')
  assert.equal(asked.get('wind_speed_unit'), 'mph')
  assert.deepEqual(chosen(0), ['Fahrenheit (°F), rain in inches'])
  assert.deepEqual(chosen(1), ['mph'])
  // The numbers are whatever the service answers; the labels follow the units.
  assert.ok(texts().some((text) => text.includes(' mph')))
  assert.ok(texts().some((text) => text.includes(' in,')))
})

// --- without the phone, without internet ---

test('the last forecast is kept for when the phone is away', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  world.phoneConnected = false
  clockAt(16)
  await open()
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.ok(texts().includes('No phone, from 13:36'))
  // Too old for the measured "now": the headline comes off the hourly curve.
  assert.ok(texts().includes('6°'))
  assert.ok(!texts().some((text) => text.startsWith('Feels')))
})

test('a forecast from yesterday still covers today, but not tomorrow', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  world.phoneConnected = false
  clockAt(9, 1)
  await open()
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.ok(texts().includes('11.1 mm, 100%'))
  tap(chip())
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.deepEqual(world.toasts, ['No forecast for tomorrow yet'])
})

test('a forecast two days old is not shown as today', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  world.phoneConnected = false
  clockAt(9, 2)
  startApp(entry)
  assert.deepEqual(texts(), ['Getting the forecast...'])
  await flush()
  assert.deepEqual(texts(), ['The saved forecast is out of date. Open again with the phone nearby.'])
})

test('with no phone and nothing saved it says so', async () => {
  world.phoneConnected = false
  startApp(entry)
  assert.deepEqual(texts(), ['Getting the forecast...'])
  await flush()
  assert.deepEqual(texts(), ['Phone not reachable.'])
})

test('if messaging is unavailable on the watch it still shows the saved forecast', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()
  world.messagingBroken = true
  await open()
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.ok(texts().includes('No phone, from 13:36'))
})

test('when the forecast service cannot be reached the saved chart stays, with a note', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  world.internet = null
  clockAt(14)
  await open()
  assert.equal(chip().params.text, 'Helsinki, today')
  assert.ok(texts().includes('Not updated, from 13:36'))
})

test('with nothing saved, a failing forecast service is named', async () => {
  choose(HELSINKI)
  await open()
  assert.deepEqual(texts(), ['The phone could not reach the forecast service.'])
})

test('an answer that is not a forecast counts as a failure', async () => {
  online({ error: true, reason: 'Latitude must be in range of -90 to 90' })
  choose(HELSINKI)
  await open()
  assert.deepEqual(texts(), ['The phone could not reach the forecast service.'])
})

test('phones that hand the answer over as text work too', async () => {
  online()
  world.bodyAsText = true
  world.settings.set('query', 'Helsinki')
  await open()
  assert.equal(chip().params.text, 'Helsinki, today')
})

// --- refreshing ---

test('opening shows the saved forecast at once and updates it when the phone answers', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  const colder = structuredClone(sample)
  colder.current.temperature_2m = -3.2
  online(colder)
  clockAt(13.8)
  startApp(entry)
  assert.ok(texts().includes('5°'), 'the saved forecast is drawn before the phone answers')
  assert.ok(texts().includes('Updating...'))
  await flush()
  assert.ok(texts().includes('-3°'))
  assert.ok(texts().includes('Updated 13:48'))
})

test('an unchanged forecast only updates the time underneath', async () => {
  online()
  choose(HELSINKI)
  await open()
  closeApp()

  clockAt(13.8)
  startApp(entry)
  const drawn = [...world.widgets]
  await flush()
  assert.deepEqual(world.widgets, drawn)
  assert.ok(texts().includes('Updated 13:48'))
})

test('the watch stores one compact forecast', async () => {
  online()
  choose(HELSINKI)
  await open()
  assert.deepEqual(Object.keys(world.files), ['forecast'])
  const stored = JSON.parse(JSON.parse(world.files.forecast))
  assert.equal(stored.place, 'Helsinki')
  assert.equal(stored.h.t.length, 49)
})

test('unknown requests from the watch are refused', async () => {
  online()
  await open()
  await assert.rejects(world.page.request({ method: 'NOPE' }), /unknown method/)
})

test('the settings page is dark, down to every text and button', async () => {
  assertDark(settingsPage())
  online()
  await open()
  search('Springfield')
  await flush()
  assert.equal(placeButtons().length, 2)
  assertDark(settingsPage())
  search('Qqqqzz')
  await flush()
  assertDark(settingsPage())
})
