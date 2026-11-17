// Phone side of the Weather app: the only part with internet access. It looks
// up the place typed into the settings page and fetches the forecast the watch
// asks for, both from Open-Meteo.
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

import {
  QUERY_KEY,
  SEARCH_KEY,
  RESULTS_KEY,
  PLACE_KEY,
  TEMP_UNIT_KEY,
  WIND_UNIT_KEY,
  readPlace,
  readUnits,
  searchUrl,
  parsePlaces,
  forecastUrl,
  ensembleUrl,
  compactForecast,
} from '../lib/forecast'

const getItem = (key) => settingsLib.getItem(key)
const storedQuery = () => String(getItem(QUERY_KEY) || '').trim()

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    // The watch asks for the forecast every time the app opens. Problems are
    // answered as { error } so the watch can say what is wrong.
    onRequest(req, res) {
      if (req.method !== 'GET_WEATHER') {
        res('unknown method: ' + req.method)
        return
      }
      this.weather()
        .then((result) => res(null, result))
        .catch(() => res(null, { error: 'network' }))
    },

    onSettingsChange({ key }) {
      if (key === QUERY_KEY) this.search(storedQuery())
      else if (key === PLACE_KEY || key === TEMP_UNIT_KEY || key === WIND_UNIT_KEY) this.announce()
    },

    // GET a URL and parse the JSON. Some phones hand the body over as a string.
    getJson(url) {
      return this.fetch({ url, method: 'GET' }).then((response) => {
        const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
        if (!body || body.error || response.status >= 400) throw new Error('bad response from ' + url)
        return body
      })
    },

    // Looks the query up and shows the matches in the settings page. The best
    // match becomes the place straight away; the page offers the others.
    // Resolves to how it went: 'ok', 'none', 'failed' or 'stale'.
    search(query) {
      if (!query) return Promise.resolve('none')
      const finish = (state) => {
        // A newer search has started meanwhile: leave its results alone.
        if (storedQuery() !== query) return 'stale'
        settingsLib.setItem(SEARCH_KEY, JSON.stringify({ query, state }))
        return state
      }
      settingsLib.setItem(SEARCH_KEY, JSON.stringify({ query, state: 'searching' }))
      return this.getJson(searchUrl(query))
        .then((body) => {
          if (storedQuery() !== query) return 'stale'
          const places = parsePlaces(body)
          settingsLib.setItem(RESULTS_KEY, JSON.stringify(places))
          if (places.length) {
            settingsLib.setItem(PLACE_KEY, JSON.stringify(places[0]))
            this.announce()
          }
          return finish(places.length ? 'ok' : 'none')
        })
        .catch(() => finish('failed'))
    },

    // Tells the watch to ask again, in case the app is open right now. A
    // change is announced once, however many storage events it causes.
    announce() {
      const current = [getItem(PLACE_KEY), getItem(TEMP_UNIT_KEY), getItem(WIND_UNIT_KEY)].join('|')
      if (current === this.announced) return
      this.announced = current
      try {
        const sent = this.call({ method: 'CHANGED' })
        if (sent && sent.catch) sent.catch(() => {})
      } catch (e) {
        // The watch app is not running; it asks when it next opens.
      }
    },

    weather() {
      const place = readPlace(getItem(PLACE_KEY))
      if (place) return this.forecast(place)
      // A place was typed but never looked up, which happens if this service
      // was not running when the settings page was used.
      const query = storedQuery()
      if (!query) return Promise.resolve({ error: 'no-place' })
      return this.search(query).then((state) => {
        const found = readPlace(getItem(PLACE_KEY))
        if (found) return this.forecast(found)
        return { error: state === 'failed' ? 'network' : 'not-found' }
      })
    },

    // The forecast, with rain from the ensemble. Without the ensemble the
    // forecast's own rain figures are used.
    forecast(place) {
      const units = readUnits(getItem)
      const ensemble = this.getJson(ensembleUrl(place, units)).catch(() => null)
      return Promise.all([this.getJson(forecastUrl(place, units)), ensemble]).then(([body, runs]) => {
        const weather = compactForecast(body, place, units, Math.floor(Date.now() / 1000), runs)
        return weather ? { weather } : { error: 'network' }
      })
    },
  }),
)
