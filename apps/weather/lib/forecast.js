// Forecast data for the Weather app: the Open-Meteo requests the phone makes,
// the compact forecast it sends to the watch, and the one-day view the watch
// draws. Pure data logic, no platform imports.

// --- phone settings ---

export const QUERY_KEY = 'query' // what the user typed into the search box
export const SEARCH_KEY = 'search' // { query, state } for the last search
export const RESULTS_KEY = 'results' // places found by the last search
export const PLACE_KEY = 'place' // the chosen place
export const TEMP_UNIT_KEY = 'tempUnit'
export const WIND_UNIT_KEY = 'windUnit'

// Rain and snow amounts follow the temperature unit: mm and cm, or inches.
export const TEMP_UNITS = {
  c: { name: 'Celsius (°C), rain in mm', api: 'celsius', rainApi: 'mm', rain: 'mm', snow: 'cm' },
  f: { name: 'Fahrenheit (°F), rain in inches', api: 'fahrenheit', rainApi: 'inch', rain: 'in', snow: 'in' },
}
export const WIND_UNITS = {
  ms: { name: 'm/s', api: 'ms' },
  kmh: { name: 'km/h', api: 'kmh' },
  mph: { name: 'mph', api: 'mph' },
  kn: { name: 'knots', api: 'kn' },
}
export const DEFAULT_UNITS = { temp: 'c', wind: 'ms' }

const isNumber = (value) => typeof value === 'number' && isFinite(value)

function parseJson(stored) {
  try {
    return JSON.parse(stored)
  } catch (e) {
    return null
  }
}

export function readUnits(getItem) {
  const temp = getItem(TEMP_UNIT_KEY)
  const wind = getItem(WIND_UNIT_KEY)
  return {
    temp: TEMP_UNITS[temp] ? temp : DEFAULT_UNITS.temp,
    wind: WIND_UNITS[wind] ? wind : DEFAULT_UNITS.wind,
  }
}

function place(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.name !== 'string' || !raw.name) return null
  if (!isNumber(raw.lat) || !isNumber(raw.lon) || Math.abs(raw.lat) > 90 || Math.abs(raw.lon) > 180) return null
  return { name: raw.name, region: typeof raw.region === 'string' ? raw.region : '', lat: raw.lat, lon: raw.lon }
}

export const readPlace = (stored) => place(parseJson(stored))

export function readResults(stored) {
  const list = parseJson(stored)
  return Array.isArray(list) ? list.map(place).filter(Boolean) : []
}

// The last search: { query, state } with state 'searching', 'ok', 'none' or 'failed'.
export function readSearch(stored) {
  const search = parseJson(stored)
  return search && typeof search.query === 'string' ? search : null
}

export const placeLabel = (p) => (p.region ? `${p.name}, ${p.region}` : p.name)

export const samePlace = (a, b) => !!a && !!b && a.lat === b.lat && a.lon === b.lon

// --- Open-Meteo: free, no key. https://open-meteo.com/en/docs ---

export const MAX_RESULTS = 6

export function searchUrl(query) {
  return (
    'https://geocoding-api.open-meteo.com/v1/search?count=' +
    MAX_RESULTS +
    '&language=en&format=json&name=' +
    encodeURIComponent(query)
  )
}

// The body has no `results` at all when nothing matches.
export function parsePlaces(body) {
  const results = body && Array.isArray(body.results) ? body.results : []
  return results
    .map((r) =>
      place({
        name: r.name,
        region: [r.admin1, r.country].filter((part) => part && part !== r.name).join(', '),
        lat: r.latitude,
        lon: r.longitude,
      }),
    )
    .filter(Boolean)
}

// Hours sent to the watch: today, tomorrow and the midnight after. A forecast
// fetched yesterday then still covers all of today.
export const HOURS = 49

const HOURLY = [
  ['t', 'temperature_2m'],
  ['rain', 'precipitation'],
  ['snow', 'snowfall'],
  ['prob', 'precipitation_probability'],
  ['code', 'weather_code'],
  ['wind', 'wind_speed_10m'],
  ['gust', 'wind_gusts_10m'],
  ['day', 'is_day'],
]

// `timezone=auto` makes the hourly data start at the place's own midnight.
export function forecastUrl(p, units) {
  const temp = TEMP_UNITS[units.temp]
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${p.lat}&longitude=${p.lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
    '&hourly=' +
    HOURLY.map((pair) => pair[1]).join(',') +
    '&timezone=auto&timeformat=unixtime&forecast_days=3' +
    `&temperature_unit=${temp.api}&wind_speed_unit=${WIND_UNITS[units.wind].api}&precipitation_unit=${temp.rainApi}`
  )
}

const round = (value) => Math.round(value * 100) / 100

// A gap in the data repeats the hour before it.
function series(values, length) {
  const out = []
  for (let i = 0; i < length; i++) {
    out.push(isNumber(values[i]) ? round(values[i]) : i ? out[i - 1] : 0)
  }
  return out
}

// Shrinks an Open-Meteo response to what the watch draws. Returns null if the
// response is not a usable forecast. `at` is when it was fetched, in seconds.
export function compactForecast(body, p, units, at) {
  const hourly = body && body.hourly
  const now = body && body.current
  if (!hourly || !now || !Array.isArray(hourly.time) || !isNumber(body.utc_offset_seconds)) return null
  const length = Math.min(HOURS, hourly.time.length)
  if (length < 24 || !isNumber(hourly.time[0])) return null

  const h = {}
  for (const [short, long] of HOURLY) {
    if (!Array.isArray(hourly[long])) return null
    h[short] = series(hourly[long], length)
  }
  return normaliseForecast({
    v: 1,
    place: p.name,
    at,
    offset: body.utc_offset_seconds,
    start: hourly.time[0],
    units: { temp: units.temp, wind: units.wind },
    now: {
      t: now.temperature_2m,
      feels: now.apparent_temperature,
      code: now.weather_code,
      wind: now.wind_speed_10m,
      dir: now.wind_direction_10m,
      day: now.is_day,
    },
    h,
  })
}

// Validates a forecast received from the phone or read back from watch
// storage. Returns null for anything the page could not draw.
export function normaliseForecast(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null
  if (typeof raw.place !== 'string' || !isNumber(raw.at) || !isNumber(raw.offset) || !isNumber(raw.start)) return null
  const units = raw.units || {}
  if (!TEMP_UNITS[units.temp] || !WIND_UNITS[units.wind]) return null
  const h = raw.h
  if (!h || !Array.isArray(h.t) || h.t.length < 24) return null
  for (const [short] of HOURLY) {
    if (!Array.isArray(h[short]) || h[short].length !== h.t.length || !h[short].every(isNumber)) return null
  }
  const now = raw.now
  if (!now || !['t', 'feels', 'code', 'wind', 'dir', 'day'].every((key) => isNumber(now[key]))) return null
  return raw
}

// True when two forecasts would draw the same charts; only the fetch time may differ.
export function sameForecast(a, b) {
  if (!a || !b) return false
  return JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })
}

// --- conditions (WMO weather codes) ---

// [codes, text, icon, severity]. Text has to fit beside the big temperature.
const CONDITIONS = [
  [[0], 'Clear', 'clear', 0],
  [[1], 'Mostly clear', 'partly', 0],
  [[2], 'Partly cloudy', 'partly', 0],
  [[3], 'Overcast', 'cloud', 0],
  [[45, 48], 'Fog', 'fog', 1],
  [[51, 53, 55], 'Drizzle', 'rain', 2],
  [[56, 57], 'Icy drizzle', 'rain', 2],
  [[61], 'Light rain', 'rain', 3],
  [[63], 'Rain', 'rain', 3],
  [[65], 'Heavy rain', 'rain', 3],
  [[66, 67], 'Icy rain', 'rain', 3],
  [[80], 'Light showers', 'rain', 3],
  [[81], 'Showers', 'rain', 3],
  [[82], 'Heavy showers', 'rain', 3],
  [[71], 'Light snow', 'snow', 4],
  [[73], 'Snow', 'snow', 4],
  [[75], 'Heavy snow', 'snow', 4],
  [[77], 'Snow grains', 'snow', 4],
  [[85, 86], 'Snow showers', 'snow', 4],
  [[95], 'Thunderstorm', 'storm', 5],
  [[96, 99], 'Thunder, hail', 'storm', 5],
]

const BY_CODE = {}
CONDITIONS.forEach(([codes, text, icon, severity]) => {
  codes.forEach((code) => (BY_CODE[code] = { text, icon, severity }))
})

// Icon names match the images in assets/wx (see tools/make-icons.mjs).
export const CONDITION_ICONS = ['sun', 'moon', 'cloud-sun', 'cloud-moon', 'cloud', 'fog', 'rain', 'snow', 'storm']

export function condition(code, isDay) {
  const known = BY_CODE[code] || { text: 'Unknown', icon: 'cloud', severity: 0 }
  let icon = known.icon
  if (icon === 'clear') icon = isDay ? 'sun' : 'moon'
  else if (icon === 'partly') icon = isDay ? 'cloud-sun' : 'cloud-moon'
  return { text: known.text, icon, severity: known.severity }
}

// One code to stand for a whole day: the worst weather that lasts at least two
// daylight hours, otherwise whatever there is most of.
function dominantCode(codes, daylight) {
  let pool = codes.filter((code, i) => daylight[i])
  if (!pool.length) pool = codes
  const count = {}
  pool.forEach((code) => (count[code] = (count[code] || 0) + 1))
  const rank = (code) => {
    const severity = condition(code, true).severity
    return (severity >= 2 && count[code] >= 2 ? severity * 100 : 0) + count[code]
  }
  return pool.reduce((best, code) => (rank(code) > rank(best) ? code : best), pool[0])
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

// Where the wind comes from, as a compass point.
export const compass = (degrees) => COMPASS[((Math.round(degrees / 45) % 8) + 8) % 8]

// --- the day the watch draws ---

// "Now" readings from the phone are used for this long, then the hourly
// forecast takes over.
const NOW_FRESH_SECONDS = 90 * 60

// A snowy hour: at least half of its precipitation fell as snow. Snowfall is
// depth; about 7 units of snow melt to 1 of water.
function isSnow(rain, snow, units) {
  if (!(snow > 0)) return false
  const water = units.temp === 'f' ? snow / 7 : (snow * 10) / 7
  return water >= rain / 2
}

const sum = (values) => values.reduce((total, value) => total + value, 0)

// One calendar day of a forecast, at the place's own time. `now` is the
// current time in seconds; `tomorrow` picks the day after today.
//
// Days are taken as 24 hours from the forecast's first midnight, so on the two
// days a year the clocks change, the chart is an hour out for part of the day.
//
// Returns null when the forecast does not cover that day. Otherwise:
//   temp, wind  25 points, 00:00 to 24:00 (readings at each full hour)
//   rain, gust, snowy, prob  24 slots, one per hour (totals over that hour)
//   nowHour     position of "now" in the day, 0-24, or null for tomorrow
export function dayView(forecast, now, tomorrow) {
  const h = forecast.h
  const elapsed = (now - forecast.start) / 3600
  if (!(elapsed >= 0)) return null
  const today = Math.floor(elapsed / 24)
  const base = (today + (tomorrow ? 1 : 0)) * 24
  if (base + 24 > h.t.length) return null

  // Open-Meteo dates an hour's rain and gusts at the end of that hour.
  const at = (list, i) => list[Math.min(base + i, list.length - 1)]
  const points = (list) => Array.from({ length: 25 }, (unused, i) => at(list, i))
  const slots = (list) => Array.from({ length: 24 }, (unused, i) => at(list, i + 1))

  const temp = points(h.t)
  const wind = points(h.wind)
  const rain = slots(h.rain)
  const snow = slots(h.snow)
  const gust = slots(h.gust)
  const snowy = rain.map((amount, i) => isSnow(amount, snow[i], forecast.units))
  const codes = h.code.slice(base, base + 24)
  const daylight = h.day.slice(base, base + 24)

  const view = {
    tomorrow: !!tomorrow,
    hasTomorrow: (today + 2) * 24 <= h.t.length,
    nowHour: tomorrow ? null : elapsed - today * 24,
    temp,
    wind,
    rain,
    gust,
    snowy,
    summary: {
      tempMin: Math.min(...temp),
      tempMax: Math.max(...temp),
      rain: sum(rain.filter((amount, i) => !snowy[i])),
      snow: sum(snow.filter((amount, i) => snowy[i])),
      prob: Math.max(...slots(h.prob)),
      windMin: Math.min(...wind),
      windMax: Math.max(...wind),
      gustMax: Math.max(...gust),
    },
  }

  if (tomorrow) {
    view.head = { temp: view.summary.tempMax, code: dominantCode(codes, daylight), isDay: true }
  } else if (now - forecast.at < NOW_FRESH_SECONDS && now >= forecast.at) {
    const n = forecast.now
    view.head = { temp: n.t, feels: n.feels, code: n.code, isDay: !!n.day, wind: n.wind, dir: n.dir }
  } else {
    // An old forecast: read "now" off the hourly curve instead.
    const hour = Math.min(23, Math.floor(view.nowHour))
    const part = view.nowHour - hour
    const between = (list) => list[hour] + (list[hour + 1] - list[hour]) * part
    view.head = { temp: between(temp), code: codes[hour], isDay: !!daylight[hour], wind: between(wind) }
  }
  return view
}

// --- text ---

// Whole degrees; never "-0".
export const degrees = (value) => `${Math.round(value) || 0}°`

const whole = (value) => String(Math.round(value) || 0)

function amount(value, unit) {
  const digits = unit === 'in' ? 2 : 1
  const text = value.toFixed(digits)
  // 0.04 mm is "0.0 mm" but it did rain.
  return `${Number(text) === 0 && value > 0 ? '<' + (unit === 'in' ? '0.01' : '0.1') : text} ${unit}`
}

export function tempCaption(view) {
  return `${degrees(view.summary.tempMin)} to ${degrees(view.summary.tempMax)}`
}

// icon: 'drop' or 'snow', whichever there is more of.
export function rainCaption(view, units) {
  const { rain, snow, prob } = view.summary
  const unit = TEMP_UNITS[units.temp]
  const parts = []
  if (rain > 0) parts.push(amount(rain, unit.rain) + (snow > 0 ? ' rain' : ''))
  if (snow > 0) parts.push(amount(snow, unit.snow) + ' snow')
  if (!parts.length) parts.push('Dry')
  if (prob >= 5) parts.push(`${whole(prob)}%`)
  return { icon: snow > 0 && !(rain > 0) ? 'snow' : 'drop', text: parts.join(', ') }
}

export function windCaption(view, units) {
  const { windMin, windMax, gustMax } = view.summary
  const lo = whole(windMin)
  const hi = whole(windMax)
  const range = lo === hi ? hi : `${lo} to ${hi}`
  const from = view.head.dir === undefined ? '' : compass(view.head.dir) + ', '
  const gusts = Math.round(gustMax) > Math.round(windMax) ? `, gusts ${whole(gustMax)}` : ''
  return `${from}${range} ${WIND_UNITS[units.wind].name}${gusts}`
}

const two = (n) => String(n).padStart(2, '0')

// "14:05" at the place, for a time in seconds.
export function clock(seconds, offset) {
  const day = 24 * 60
  const minutes = ((Math.floor((seconds + offset) / 60) % day) + day) % day
  return `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`
}
