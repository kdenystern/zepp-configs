// The Weather app's data logic and chart geometry, without any watch or phone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  searchUrl,
  parsePlaces,
  readPlace,
  readResults,
  readUnits,
  placeLabel,
  forecastUrl,
  compactForecast,
  normaliseForecast,
  sameForecast,
  dayView,
  condition,
  CONDITION_ICONS,
  compass,
  degrees,
  tempCaption,
  rainCaption,
  rainScale,
  chanceMarks,
  ensembleUrl,
  readEnsemble,
  windCaption,
  clock,
  HOURS,
} from '../apps/weather/lib/forecast.js'
import { range, lineRects, lineY, barRects, stepRects, dashRects, dim } from '../apps/weather/lib/chart.js'

// A real Open-Meteo answer for Helsinki (UTC+2), fetched at 20:00 local time.
const sample = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-forecast.json', import.meta.url), 'utf8'))
const START = sample.hourly.time[0]
const HELSINKI = { name: 'Helsinki', region: 'Uusimaa, Finland', lat: 60.17, lon: 24.94 }
const METRIC = { temp: 'c', wind: 'ms' }
const hours = (n) => START + n * 3600

// The ensemble's answer for the same place and days.
const runs = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-ensemble.json', import.meta.url), 'utf8'))

const compact = (body = sample, at = hours(20), ensemble) => compactForecast(body, HELSINKI, METRIC, at, ensemble)

// A forecast whose hourly series can be set by hand.
function made(overrides = {}, units = METRIC) {
  const flat = (value) => Array(HOURS).fill(value)
  const h = { t: flat(10), rain: flat(0), snow: flat(0), prob: flat(0), code: flat(3), wind: flat(4), gust: flat(6), day: flat(1) }
  return normaliseForecast({
    v: 1,
    place: 'Testville',
    at: START,
    offset: 0,
    start: START,
    units,
    now: { t: 10, feels: 9, code: 3, wind: 4, dir: 270, day: 1 },
    h: { ...h, ...overrides },
  })
}

// --- places ---

test('the search URL carries the typed name, encoded', () => {
  const url = new URL(searchUrl('São Paulo & co'))
  assert.equal(url.hostname, 'geocoding-api.open-meteo.com')
  assert.equal(url.searchParams.get('name'), 'São Paulo & co')
  assert.equal(url.searchParams.get('count'), '6')
})

test('search results become places with a region to tell them apart', () => {
  const places = parsePlaces({
    results: [
      { name: 'Springfield', latitude: 37.2, longitude: -93.3, admin1: 'Missouri', country: 'United States' },
      { name: 'Singapore', latitude: 1.29, longitude: 103.85, admin1: 'Singapore', country: 'Singapore' },
      { name: 'Broken', latitude: 'north', longitude: 1 },
    ],
  })
  assert.deepEqual(places.map(placeLabel), ['Springfield, Missouri, United States', 'Singapore'])
  assert.deepEqual(places[0], { name: 'Springfield', region: 'Missouri, United States', lat: 37.2, lon: -93.3 })
})

test('no match means no results, not an error', () => {
  assert.deepEqual(parsePlaces({ generationtime_ms: 0.07 }), [])
  assert.deepEqual(parsePlaces(null), [])
})

test('stored places and units are validated', () => {
  assert.equal(readPlace(undefined), null)
  assert.equal(readPlace('{"name":"X","lat":95,"lon":0}'), null)
  assert.equal(readPlace('not json'), null)
  assert.deepEqual(readPlace(JSON.stringify(HELSINKI)), HELSINKI)
  assert.deepEqual(readResults(JSON.stringify([HELSINKI, { name: '' }])), [HELSINKI])
  assert.deepEqual(readResults('{}'), [])
  assert.deepEqual(readUnits(() => undefined), { temp: 'c', wind: 'ms' })
  assert.deepEqual(readUnits((key) => ({ tempUnit: 'f', windUnit: 'parsecs' })[key]), { temp: 'f', wind: 'ms' })
})

// --- the forecast request and its compact form ---

test('the forecast URL asks for the place, its own time zone and the chosen units', () => {
  const metric = new URL(forecastUrl(HELSINKI, METRIC)).searchParams
  assert.equal(metric.get('latitude'), '60.17')
  assert.equal(metric.get('longitude'), '24.94')
  assert.equal(metric.get('timezone'), 'auto')
  assert.equal(metric.get('timeformat'), 'unixtime')
  assert.equal(metric.get('temperature_unit'), 'celsius')
  assert.equal(metric.get('wind_speed_unit'), 'ms')
  assert.equal(metric.get('precipitation_unit'), 'mm')
  // Exactly the hourly series the fixture was fetched with.
  assert.deepEqual(metric.get('hourly').split(','), Object.keys(sample.hourly).slice(1))

  const imperial = new URL(forecastUrl(HELSINKI, { temp: 'f', wind: 'mph' })).searchParams
  assert.equal(imperial.get('temperature_unit'), 'fahrenheit')
  assert.equal(imperial.get('wind_speed_unit'), 'mph')
  assert.equal(imperial.get('precipitation_unit'), 'inch')
})

test('a real answer shrinks to 49 hours from local midnight', () => {
  const forecast = compact()
  assert.equal(forecast.place, 'Helsinki')
  assert.equal(forecast.start, START)
  assert.equal(forecast.offset, 7200)
  assert.equal(forecast.at, hours(20))
  // Local midnight: the start plus the UTC offset is a whole day.
  assert.equal((forecast.start + forecast.offset) % 86400, 0)
  for (const key of ['t', 'rain', 'snow', 'prob', 'code', 'wind', 'gust', 'day']) {
    assert.equal(forecast.h[key].length, 49, key)
  }
  assert.deepEqual(forecast.h.t.slice(0, 3), [7.3, 7, 6.7])
  assert.deepEqual(forecast.now, { t: 5.4, feels: -0.6, code: 51, wind: 8.4, dir: 193, day: 0 })
  // Small enough to send over Bluetooth in one go.
  assert.ok(JSON.stringify(forecast).length < 3500, 'compact forecast is ' + JSON.stringify(forecast).length)
})

test('a gap in the data repeats the hour before', () => {
  const body = structuredClone(sample)
  body.hourly.temperature_2m[5] = null
  assert.equal(compact(body).h.t[5], compact(body).h.t[4])
})

test('answers that are not a forecast are rejected', () => {
  assert.equal(compact({ error: true, reason: 'Latitude must be in range' }), null)
  assert.equal(compact({}), null)
  const noCurrent = structuredClone(sample)
  delete noCurrent.current
  assert.equal(compact(noCurrent), null)
  const short = structuredClone(sample)
  Object.keys(short.hourly).forEach((key) => (short.hourly[key] = short.hourly[key].slice(0, 10)))
  assert.equal(compact(short), null)
  const missing = structuredClone(sample)
  delete missing.hourly.wind_gusts_10m
  assert.equal(compact(missing), null)
})

test('forecasts read back from storage are validated', () => {
  const good = compact()
  assert.equal(normaliseForecast(JSON.parse(JSON.stringify(good))).place, 'Helsinki')
  assert.equal(normaliseForecast(null), null)
  assert.equal(normaliseForecast({ ...good, v: 2 }), null)
  assert.equal(normaliseForecast({ ...good, units: { temp: 'k', wind: 'ms' } }), null)
  assert.equal(normaliseForecast({ ...good, h: { ...good.h, wind: good.h.wind.slice(1) } }), null)
  assert.equal(normaliseForecast({ ...good, h: { ...good.h, t: good.h.t.map(() => 'warm') } }), null)
  assert.equal(normaliseForecast({ ...good, now: {} }), null)
})

test('two fetches of the same weather count as the same forecast', () => {
  assert.ok(sameForecast(compact(sample, 100), compact(sample, 200)))
  const warmer = structuredClone(sample)
  warmer.current.temperature_2m += 1
  assert.ok(!sameForecast(compact(), compact(warmer)))
  assert.ok(!sameForecast(compact(), null))
})

// --- the day on screen ---

test('today runs from midnight to midnight with "now" placed on it', () => {
  const view = dayView(compact(), hours(13.5), false)
  assert.equal(view.temp.length, 25)
  assert.equal(view.wind.length, 25)
  assert.equal(view.rain.length, 24)
  assert.equal(view.gust.length, 24)
  assert.equal(view.nowHour, 13.5)
  assert.equal(view.temp[0], 7.3)
  assert.equal(view.temp[24], 5) // tomorrow's 00:00 closes the line
  assert.equal(view.hasTomorrow, true)
  assert.equal(view.tomorrow, false)
})

test("an hour's rain and gusts sit in the hour they fell in", () => {
  // Open-Meteo dates the total for 09:00-10:00 at 10:00.
  const rain = Array(HOURS).fill(0)
  rain[10] = 2.5
  const gust = Array(HOURS).fill(5)
  gust[24] = 20
  const view = dayView(made({ rain, gust }), hours(1), false)
  assert.equal(view.rain[9], 2.5)
  assert.equal(view.rain[10], 0)
  assert.equal(view.gust[23], 20)
  assert.equal(view.summary.rain, 2.5)
  assert.equal(view.summary.gustMax, 20)
})

test('the summary gives the range of each chart', () => {
  const view = dayView(compact(), hours(13.5), false)
  assert.equal(view.summary.tempMax, 7.3)
  assert.equal(view.summary.tempMin, 5)
  assert.equal(view.summary.windMax, 12)
  assert.equal(view.summary.gustMax, 18.6)
  assert.equal(view.summary.prob, 100)
  assert.ok(Math.abs(view.summary.rain - 6.5) < 1e-9)
  assert.equal(view.summary.snow, 0)
})

test('snowy hours are told apart from rainy ones', () => {
  const rain = Array(HOURS).fill(0)
  const snow = Array(HOURS).fill(0)
  rain[3] = 1 // rain only
  rain[4] = 1
  snow[4] = 0.7 // all of it fell as snow: 0.7 cm is 1 mm of water
  rain[5] = 2
  snow[5] = 0.14 // sleet, mostly rain
  const view = dayView(made({ rain, snow }), hours(1), false)
  assert.deepEqual(view.snowy.slice(2, 5), [false, true, false])
  assert.equal(view.summary.rain, 3)
  assert.equal(view.summary.snow, 0.7)

  // In inches, snow depth is also about seven times its water.
  const inches = dayView(made({ rain: rain.map((r) => r / 25), snow: snow.map((s) => s / 2.5) }, { temp: 'f', wind: 'mph' }), hours(1), false)
  assert.deepEqual(inches.snowy.slice(2, 5), [false, true, false])
})

test('a fresh forecast headlines the measured conditions', () => {
  const view = dayView(compact(), hours(20.2), false)
  assert.deepEqual(view.head, { temp: 5.4, feels: -0.6, code: 51, isDay: false, wind: 8.4, dir: 193 })
})

test('an old forecast headlines the hourly curve instead', () => {
  // Fetched at 20:00, looked at the next day at 09:30 without the phone.
  const view = dayView(compact(), hours(24 + 9.5), false)
  assert.equal(view.nowHour, 9.5)
  assert.ok(Math.abs(view.head.temp - 6.15) < 1e-9) // between 6.1 at 09:00 and 6.2 at 10:00
  assert.equal(view.head.feels, undefined)
  assert.equal(view.head.dir, undefined)
  assert.equal(view.head.code, 51)
  assert.equal(view.head.isDay, true)
  assert.equal(view.hasTomorrow, false)
  assert.equal(view.temp[0], 5)
})

test('tomorrow has no "now" and headlines the high', () => {
  const view = dayView(compact(), hours(13.5), true)
  assert.equal(view.tomorrow, true)
  assert.equal(view.nowHour, null)
  assert.equal(view.head.temp, view.summary.tempMax)
  assert.equal(view.head.isDay, true)
  assert.equal(view.temp[0], 5)
})

test('days the forecast does not cover give no view', () => {
  const forecast = compact()
  assert.equal(dayView(forecast, hours(49), false), null) // two days later
  assert.equal(dayView(forecast, hours(30), true), null) // tomorrow, seen from day two
  assert.equal(dayView(forecast, hours(-2), false), null) // watch clock behind the data
})

test("tomorrow's headline is the worst weather that lasts, in daylight", () => {
  const code = Array(HOURS).fill(2)
  const day = Array(HOURS).fill(0)
  for (let hour = 24 + 8; hour < 24 + 18; hour++) day[hour] = 1
  code[24 + 3] = 95 // a storm at night does not count
  code[24 + 4] = 95
  code[24 + 9] = 71 // one hour of snow does not make a snowy day
  code[24 + 12] = 61
  code[24 + 13] = 61
  assert.equal(dayView(made({ code, day }), hours(1), true).head.code, 61)
  code[24 + 12] = 2
  code[24 + 13] = 2
  assert.equal(dayView(made({ code, day }), hours(1), true).head.code, 2)
})

// --- conditions and text ---

test('every weather code has a short description and an icon that exists', () => {
  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
  for (const code of codes) {
    for (const isDay of [true, false]) {
      const { text, icon } = condition(code, isDay)
      assert.notEqual(text, 'Unknown', `code ${code}`)
      assert.ok(text.length <= 13, `"${text}" is too long to fit`)
      assert.ok(CONDITION_ICONS.includes(icon), `${icon} for code ${code}`)
    }
  }
  assert.equal(condition(0, true).icon, 'sun')
  assert.equal(condition(0, false).icon, 'moon')
  assert.equal(condition(2, false).icon, 'cloud-moon')
  assert.equal(condition(73, true).icon, 'snow')
  assert.deepEqual(condition(1234, true), { text: 'Unknown', icon: 'cloud', severity: 0 })
})

test('wind direction is a compass point', () => {
  assert.deepEqual([0, 44, 90, 193, 270, 350, 360].map(compass), ['N', 'NE', 'E', 'S', 'W', 'N', 'N'])
})

test('temperatures are whole degrees, never minus zero', () => {
  assert.deepEqual([5.4, -0.6, -0.4, 0.4, -12.5].map(degrees), ['5°', '-1°', '0°', '0°', '-12°'])
})

test('captions sum up each chart', () => {
  const view = dayView(compact(), hours(20.2), false)
  assert.equal(tempCaption(view), '5° to 7°')
  // The forecast's own figures for 20:00 to 21:00; the ensemble's when it is there.
  assert.deepEqual(rainCaption(view, METRIC), { icon: 'drop', text: 'Now 0.1 mm/h, 92%' })
  const withRuns = dayView(compact(sample, hours(20), runs), hours(20.2), false)
  assert.deepEqual(rainCaption(withRuns, METRIC), { icon: 'drop', text: 'Now 1.0 mm/h, 100%' })
  assert.equal(windCaption(view, METRIC), 'S, 8 to 12 m/s, gusts 19')
})

// Series with one value set: index 2 is 01:00 to 02:00 today, 30 is 05:00 to
// 06:00 tomorrow.
const one = (index, value) => Object.assign(Array(HOURS).fill(0), { [index]: value })

test("today's rain caption is about the hour now", () => {
  const now = (overrides, units = METRIC) => rainCaption(dayView(made(overrides, units), hours(1.5), false), units)
  assert.deepEqual(now({}), { icon: 'drop', text: 'Now dry' })
  assert.deepEqual(now({ prob: one(2, 30) }), { icon: 'drop', text: 'Now dry, 30%' })
  assert.deepEqual(now({ rain: one(2, 0.3), prob: one(2, 84) }), { icon: 'drop', text: 'Now 0.3 mm/h, 84%' })
  assert.deepEqual(now({ rain: one(2, 0.04) }), { icon: 'drop', text: 'Now dry' }) // too little to show
  assert.deepEqual(now({ rain: one(2, 0.06) }), { icon: 'drop', text: 'Now 0.1 mm/h' })
  assert.deepEqual(now({ rain: one(2, 2), snow: one(2, 2.8) }), { icon: 'snow', text: 'Now 2.8 cm/h snow' })
  assert.deepEqual(now({ rain: one(2, 0.25) }, { temp: 'f', wind: 'mph' }), { icon: 'drop', text: 'Now 0.25 in/h' })
  // Rain later in the day is the chart's business, not the caption's.
  assert.deepEqual(now({ rain: one(10, 3), prob: one(10, 90) }), { icon: 'drop', text: 'Now dry' })
})

test("tomorrow's rain caption is the day's total and its highest chance", () => {
  const day = (overrides) => rainCaption(dayView(made(overrides), hours(1), true), METRIC)
  assert.deepEqual(day({}), { icon: 'drop', text: 'Dry' })
  assert.deepEqual(day({ prob: one(30, 30) }), { icon: 'drop', text: 'Dry, up to 30%' })
  const wet = { rain: Object.assign(one(30, 2), { 31: 1.5 }), prob: one(30, 80) }
  assert.deepEqual(day(wet), { icon: 'drop', text: 'Total 3.5 mm, up to 80%' })
  assert.deepEqual(day({ rain: one(30, 2), snow: one(30, 2.8) }), { icon: 'snow', text: 'Total 2.8 cm snow' })
  const mixed = { rain: Object.assign(one(30, 2), { 32: 1.5 }), snow: one(30, 2.8), prob: one(30, 80) }
  assert.deepEqual(day(mixed), { icon: 'drop', text: '1.5 mm, 2.8 cm snow' })
})

test('the rain scale starts at zero and tops out at a round amount', () => {
  const top = (rain, units = METRIC) => rainScale({ rain }, units)
  assert.deepEqual(top([0, 0]), { max: 1, label: '1' })
  assert.deepEqual(top([0, 0.8]), { max: 1, label: '1' })
  assert.deepEqual(top([1.6, 0.2]), { max: 2, label: '2' })
  assert.deepEqual(top([12]), { max: 20, label: '20' })
  assert.deepEqual(top([500]), { max: 100, label: '100' })
  const us = { temp: 'f', wind: 'mph' }
  assert.deepEqual(top([0.03], us), { max: 0.04, label: '.04' })
  assert.deepEqual(top([0.3], us), { max: 0.5, label: '.5' })
})

test('the hours where rain becomes likely are marked, once per spell', () => {
  //            0   1   2   3   4   5   6   7   8   9
  const prob = [10, 20, 60, 90, 40, 45, 20, 55, 70, 35]
  assert.deepEqual(chanceMarks(prob, 0), [2, 7])
  // A dip that stays at 30% or more does not start a new spell.
  assert.deepEqual(chanceMarks([60, 35, 80], 0), [0])
  // From now on only; a spell already under way is marked at now.
  assert.deepEqual(chanceMarks(prob, 3), [3, 7])
  assert.deepEqual(chanceMarks(prob, 9), [])
  assert.deepEqual(chanceMarks(Array(24).fill(49), 0), [])
})

test('the day carries the hourly chance of rain', () => {
  const view = dayView(compact(), hours(20.2), false)
  assert.equal(view.prob.length, 24)
  assert.equal(view.prob[9], 71) // the hour 09:00 to 10:00
})

test('the wind caption drops what adds nothing', () => {
  const view = dayView(made({}), hours(30), false) // old forecast: no direction
  assert.equal(windCaption(view, { temp: 'c', wind: 'kmh' }), '4 km/h, gusts 6')
  const calm = dayView(made({ gust: Array(HOURS).fill(4.2) }), hours(30), false)
  assert.equal(windCaption(calm, METRIC), '4 m/s')
})

test('clock times are shown at the place, not in UTC', () => {
  assert.equal(clock(START, 7200), '00:00')
  assert.equal(clock(hours(13.6), 7200), '13:36')
  assert.equal(clock(0, -5 * 3600), '19:00')
})

// --- the ensemble ---

test('the ensemble is asked for rain and snow from every ICON run, in the chosen unit', () => {
  const url = new URL(ensembleUrl(HELSINKI, { temp: 'f', wind: 'kn' }))
  assert.equal(url.hostname, 'ensemble-api.open-meteo.com')
  assert.equal(url.searchParams.get('hourly'), 'precipitation,snowfall')
  assert.equal(url.searchParams.get('models'), 'icon_seamless')
  assert.equal(url.searchParams.get('precipitation_unit'), 'inch')
  assert.equal(url.searchParams.get('timeformat'), 'unixtime')
})

test("an hour's rain is the average over the runs, its chance the share of runs with rain", () => {
  const body = {
    hourly: {
      time: [hours(-1), hours(0), hours(1), hours(2)],
      precipitation: [9, 0.0, 0.4, null],
      precipitation_member01: [9, 0.2, 0.0, null],
      precipitation_member02: [9, 0.0, 0.2, 1],
      precipitation_member03: [9, 0.0, 0.2, null],
      snowfall: [0, 0, 0.7, 0],
      snowfall_member01: [0, 0, 0, 0],
      snowfall_member02: [0, 0, 0.7, 0],
      snowfall_member03: [0, 0, 0.7, 0],
    },
  }
  const [first, second, third, fourth] = readEnsemble(body, hours(0), 4, METRIC)
  assert.deepEqual(first, { rain: 0.05, snow: 0, prob: 25 })
  assert.equal(second.prob, 75)
  assert.ok(Math.abs(second.rain - 0.2) < 1e-9)
  assert.ok(Math.abs(second.snow - 0.525) < 1e-9)
  // Fewer than half the runs, or past the end: nothing for that hour.
  assert.equal(third, null)
  assert.equal(fourth, null)
  // In inches, 0.004 is the least that counts as rain.
  const inches = { hourly: { time: [hours(0)], precipitation: [0.004], precipitation_member01: [0.003] } }
  assert.equal(readEnsemble(inches, hours(0), 1, { temp: 'f', wind: 'mph' })[0].prob, 50)
  assert.equal(readEnsemble({ hourly: { time: [] } }, hours(0), 1, METRIC), null)
  assert.equal(readEnsemble(null, hours(0), 1, METRIC), null)
})

test('the compact forecast takes rain from the ensemble, and keeps its own where the ensemble has a gap', () => {
  const plain = compact()
  const mixed = compact(sample, hours(20), runs)
  assert.deepEqual(mixed.h.t, plain.h.t)
  assert.deepEqual(mixed.h.code, plain.h.code)
  // 12:00 to 13:00: 0.0 mm at 93% in the forecast, 0.2 mm at 78% in the ensemble.
  assert.deepEqual([plain.h.rain[13], plain.h.prob[13]], [0, 93])
  assert.deepEqual([mixed.h.rain[13], mixed.h.prob[13]], [0.205, 78])
  const holed = structuredClone(runs)
  for (const key of Object.keys(holed.hourly)) if (key !== 'time') holed.hourly[key][13] = null
  const patched = compact(sample, hours(20), holed)
  assert.deepEqual([patched.h.rain[13], patched.h.prob[13]], [0, 93])
  assert.equal(patched.h.rain[14], mixed.h.rain[14])
})

// --- chart geometry ---

const BOX = { x: 27, y: 100, w: 336, h: 74 }

test('an axis never spans less than its minimum', () => {
  assert.deepEqual(range([3, 4], 6), { lo: 0.5, hi: 6.5 })
  assert.deepEqual(range([-5, 15], 6), { lo: -5, hi: 15 })
})

test('a line is an unbroken run of rectangles across the whole box', () => {
  const values = [0, 4, 9, 3, 3, 3, 10, 0]
  const rects = lineRects(values, BOX, { lo: 0, hi: 10 })
  assert.equal(rects[0].x, BOX.x)
  rects.forEach((r, i) => {
    assert.ok(r.y >= BOX.y && r.y + r.h <= BOX.y + BOX.h, 'stays inside the box')
    assert.ok(r.h >= 3)
    if (!i) return
    const before = rects[i - 1]
    assert.equal(r.x, before.x + before.w, 'no horizontal gap')
    assert.ok(r.y <= before.y + before.h && before.y <= r.y + r.h, 'no vertical gap')
  })
  const last = rects[rects.length - 1]
  assert.equal(last.x + last.w, BOX.x + BOX.w)
  // The top of the scale touches the top of the box, the bottom the baseline.
  assert.equal(Math.min(...rects.map((r) => r.y)), BOX.y)
  assert.equal(Math.max(...rects.map((r) => r.y + r.h)), BOX.y + BOX.h)
})

test('a flat line is a single rectangle, or two when split at "now"', () => {
  const flat = Array(25).fill(5)
  assert.deepEqual(lineRects(flat, BOX, { lo: 0, hi: 10 }), [{ x: 27, y: 136, w: 336, h: 3, before: false }])
  const split = lineRects(flat, BOX, { lo: 0, hi: 10, splitAt: 100 })
  assert.deepEqual(
    split.map((r) => [r.x, r.w, r.before]),
    [
      [27, 99, true],
      [126, 237, false],
    ],
  )
})

test('lineY follows the drawn line', () => {
  const values = [0, 10]
  assert.equal(lineY(values, BOX, { lo: 0, hi: 10 }, 0), BOX.y + BOX.h - 3)
  assert.equal(lineY(values, BOX, { lo: 0, hi: 10 }, BOX.w), BOX.y)
})

test('bars stand on the baseline, and a trace still shows', () => {
  const values = Array(24).fill(0)
  values[2] = 1
  values[3] = 0.01
  values[4] = 5
  const bars = barRects(values, { x: 27, y: 200, w: 336, h: 46 }, { max: 2 })
  assert.equal(bars.length, 24)
  assert.equal(bars[0], null)
  assert.deepEqual(bars[2], { x: 57, y: 223, w: 10, h: 23 })
  assert.equal(bars[3].h, 4)
  // Under `least`, no bar.
  assert.equal(barRects([0.04, 0.05], { x: 0, y: 0, w: 28, h: 46 }, { max: 2, least: 0.05 })[0], null)
  assert.equal(bars[4].h, 46) // clipped to the box
  bars.filter(Boolean).forEach((b) => assert.equal(b.y + b.h, 246))
})

test('a step line has a level per hour joined by uprights, merged where flat', () => {
  const box = { x: 10, y: 0, w: 56, h: 52 }
  const rects = stepRects([0, 0, 50, 100], box, { lo: 0, hi: 100, splitAt: 28 })
  assert.deepEqual(rects, [
    { x: 10, y: 50, w: 28, h: 2, before: true },
    { x: 37, y: 25, w: 2, h: 27, before: true },
    { x: 38, y: 25, w: 14, h: 2, before: false },
    { x: 51, y: 0, w: 2, h: 27, before: false },
    { x: 52, y: 0, w: 14, h: 2, before: false },
  ])
  assert.equal(stepRects(Array(24).fill(30), { x: 0, y: 0, w: 336, h: 76 }, { lo: 0, hi: 100 }).length, 1)
})

test('gust dashes sit at their value, one per hour', () => {
  const dashes = dashRects([0, 8, 20], { x: 0, y: 0, w: 42, h: 46 }, { lo: 0, hi: 16 })
  assert.deepEqual(dashes.map((d) => d.y), [44, 22, 0])
  assert.deepEqual(dashes.map((d) => [d.x, d.w, d.h]), [[3, 8, 2], [17, 8, 2], [31, 8, 2]])
})

test('dim darkens each colour channel', () => {
  assert.equal(dim(0xc98500, 0.5), 0x654300)
  assert.equal(dim(0xffffff, 0), 0)
})
