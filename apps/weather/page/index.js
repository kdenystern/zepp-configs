// The Weather app's one screen: a day at a glance. Current conditions on top,
// then three charts over the same 24 hours: temperature, rain or snow (the
// largest, with the chance of it), and wind. Tapping the place name flips between today and tomorrow.
//
// The forecast comes from the phone (see app-side/index.js). The last one is
// kept on the watch, so the screen fills in at once and works without the
// phone for the rest of the day.
//
// Drawing a day takes a couple of hundred widgets, which is slow on the
// watch. So when the day is flipped, a spinner covers the charts at once and
// the new day is drawn behind it a few widgets at a time, the spinner turning
// in between.
import { createWidget, deleteWidget, widget, align, prop, text_style, setStatusBarVisible } from '@zos/ui'
import { LocalStorage } from '@zos/storage'
import { Time } from '@zos/sensor'
import { showToast } from '@zos/interaction'
import { BasePage } from '@zeppos/zml/base-page'

import {
  normaliseForecast,
  sameForecast,
  dayView,
  condition,
  degrees,
  tempCaption,
  rainCaption,
  rainScale,
  chanceMarks,
  TEMP_UNITS,
  TRACE,
  windCaption,
  clock,
} from '../lib/forecast'
import { range, lineRects, lineY, barRects, stepRects, dashRects, dim } from '../lib/chart'
import { SERIES } from '../lib/palette'

const storage = new LocalStorage()

const WIDTH = 390

// The header keeps this far from the sides of the screen.
const SIDE = 27
// The charts share one time axis: 24 hours, 13 px each. The margins either
// side hold the rain chart's scales.
const HOUR = 13
const PLOT_X = 39
const PLOT_W = 24 * HOUR
// Rain gets the most room: temperature barely moves over a day.
const TEMP = { x: PLOT_X, y: 152, w: PLOT_W, h: 36 }
// The temperature line keeps clear of its chart's top edge and baseline.
const TEMP_LINE = { x: PLOT_X, y: TEMP.y + 4, w: PLOT_W, h: TEMP.h - 8 }
// The rain chart: a strip for the chance labels, then the bars and the chance
// line under it. Chance (0-100%) is marked on the left, rain (mm) on the right.
const RAIN = { x: PLOT_X, y: 222, w: PLOT_W, h: 96 }
const CHANCE_LABELS = { y: RAIN.y, h: 18 }
const RAIN_BARS = { x: PLOT_X, y: RAIN.y + 20, w: PLOT_W, h: RAIN.h - 20 }
const WIND = { x: PLOT_X, y: 352, w: PLOT_W, h: 40 }
const AXIS_Y = 396
const STATUS = { x: 95, y: 420, w: 200, h: 22 }
const CHIP = { x: 62, y: 10, w: WIDTH - 124, h: 36 }

// The spinner: a ring of dots under the header, one bright dot going round
// with a fainter one behind it.
const SPINNER = { x: 195, y: 245, r: 26, dot: 8, dots: 10, tick: 90 }
// Widgets made or removed in one go between turns of the spinner.
const BATCH = 20

const COLOR = {
  text: 0xffffff,
  soft: 0xd0d0d0,
  dim: 0x8a8a8a,
  chip: 0x1c1c1c,
  chipPressed: 0x3a3a3a,
  grid: 0x262626,
  baseline: 0x3a3a3a,
  now: 0x8a8a8a,
  // The chance of rain or snow: a light line over the bars.
  chance: 0x9cc3f0,
  ...SERIES,
}
// Hours already gone are drawn darker. Rain bars less so, so that a small
// amount still shows.
const PAST = 0.45
const PAST_BARS = 0.6

// The least an axis spans, so a calm, dry, steady day looks like one.
const MIN_TEMP_SPAN = { c: 6, f: 10 }
const MIN_WIND_MAX = { ms: 8, kmh: 30, mph: 18, kn: 16 }

const PROBLEMS = {
  'no-place': 'Choose a place in the Zepp app: open the Weather app settings there.',
  'not-found': 'The place was not found. Search again in the Weather app settings on the phone.',
  network: 'The phone could not reach the forecast service.',
  offline: 'Phone not reachable.',
  stale: 'The saved forecast is out of date. Open again with the phone nearby.',
}

function readStored() {
  try {
    return normaliseForecast(JSON.parse(storage.getItem('forecast', '')))
  } catch (e) {
    return null
  }
}

// The header chip: the place, shortened, and the day.
function chipText(forecast, tomorrow) {
  const name = forecast.place.length > 12 ? forecast.place.slice(0, 11) + '.' : forecast.place
  return `${name}, ${tomorrow ? 'tomorrow' : 'today'}`
}

// The watch's clock as UTC seconds.
let time = null
function nowSeconds() {
  if (!time) time = new Time()
  return Math.floor((time.getTime ? time.getTime() : Date.now()) / 1000)
}

Page(
  BasePage({
    state: {
      built: false,
      forecast: null,
      tomorrow: false,
      // 'loading', 'ok', or why the last request failed (a PROBLEMS key)
      sync: 'loading',
      // The day's widgets, all in the `content` layer. `queue` collects the
      // ones the drawing code asks for (see add) until they are made.
      widgets: [],
      queue: [],
      status: null,
      chip: null,
      content: null,
      // The layer over the charts that hides them while a day is drawn.
      cover: [],
      dots: [],
      spin: null,
      // A redraw in progress: { again, stopped }.
      job: null,
    },

    onInit() {
      this.state.forecast = readStored()
      this.refresh()
    },

    build() {
      setStatusBarVisible(false)
      this.state.built = true
      // Two layers, as in the Tasks app: the day, and over it (z_index 1) the
      // cover with the spinner, hidden until a redraw needs it.
      this.state.content = createWidget(widget.VIEW_CONTAINER, {
        x: 0,
        y: 0,
        w: WIDTH,
        h: 450,
        scroll_enable: 0,
      })
      const top = CHIP.y + CHIP.h + 4
      const cover = createWidget(widget.VIEW_CONTAINER, {
        x: 0,
        y: top,
        w: WIDTH,
        h: 450 - top,
        z_index: 1,
        scroll_enable: 0,
      })
      const black = cover.createWidget(widget.FILL_RECT, { x: 0, y: 0, w: WIDTH, h: 450 - top, color: 0x000000 })
      const dots = []
      for (let i = 0; i < SPINNER.dots; i++) {
        const angle = (i / SPINNER.dots) * 2 * Math.PI
        const x = Math.round(SPINNER.x + SPINNER.r * Math.sin(angle) - SPINNER.dot / 2)
        const y = Math.round(SPINNER.y - top - SPINNER.r * Math.cos(angle) - SPINNER.dot / 2)
        const dot = (color) =>
          cover.createWidget(widget.FILL_RECT, { x, y, w: SPINNER.dot, h: SPINNER.dot, radius: SPINNER.dot / 2, color })
        dots.push({ base: dot(COLOR.grid), trail: dot(COLOR.dim), head: dot(COLOR.text) })
      }
      this.state.dots = dots
      this.state.cover = [black, ...dots.map((d) => d.base)]
      this.showSpinner(false)
      this.render()
    },

    onDestroy() {
      this.state.built = false
      if (this.state.job) this.state.job.stopped = true
      this.state.job = null
      if (this.state.spin) clearInterval(this.state.spin)
      this.state.spin = null
      this.state.widgets = []
      this.state.queue = []
      this.state.status = null
      this.state.chip = null
    },

    // The phone says the place or the units changed while this is open.
    onCall(data) {
      if (data && data.method === 'CHANGED') this.refresh()
    },

    refresh() {
      try {
        this.request({ method: 'GET_WEATHER' })
          .then((result) => this.receive(result))
          .catch(() => this.receive({ error: 'offline' }))
      } catch (e) {
        console.log('weather: sync unavailable: ' + e)
        this.receive({ error: 'offline' })
      }
    },

    receive(result) {
      const fresh = normaliseForecast(result && result.weather)
      if (!fresh) {
        this.state.sync = (result && PROBLEMS[result.error] && result.error) || 'network'
        // A message screen names the problem; a chart only notes it underneath.
        if (this.state.built) {
          if (this.view()) this.showStatus()
          else this.render()
        }
        return
      }
      const redraw = !sameForecast(fresh, this.state.forecast)
      this.state.forecast = fresh
      this.state.sync = 'ok'
      storage.setItem('forecast', JSON.stringify(fresh))
      if (!this.state.built) return
      if (redraw) this.render()
      else this.showStatus()
    },

    // The day on screen, or null if there is no forecast for it.
    view() {
      const { forecast, tomorrow } = this.state
      return forecast ? dayView(forecast, nowSeconds(), tomorrow) : null
    },

    // Asks for a widget. It is made later (see render); the returned record
    // gets its `widget` then.
    add(type, params) {
      const spec = { type, params, widget: null }
      this.state.queue.push(spec)
      return spec
    },

    make(spec) {
      spec.widget = this.state.content.createWidget(spec.type, spec.params)
      this.state.widgets.push(spec.widget)
    },

    text(x, y, w, h, text, size, color, alignH) {
      return this.add(widget.TEXT, {
        x,
        y,
        w,
        h,
        text,
        text_size: size,
        color,
        align_h: alignH || align.LEFT,
        align_v: align.CENTER_V,
      })
    },

    rect(r, color, radius) {
      return this.add(widget.FILL_RECT, { x: r.x, y: r.y, w: r.w, h: r.h, color, radius: radius || 0 })
    },

    // Draws the screen again. With `covered`, the old day stays hidden under
    // the spinner while the new one is made, a batch at a time. Otherwise it
    // is all done at once.
    render(covered) {
      if (this.state.job) {
        // A redraw is under way: it draws once more when it is done.
        this.state.job.again = true
        return
      }
      const old = this.state.widgets
      this.state.widgets = []
      this.state.queue = []
      this.state.status = null
      this.state.chip = null

      let view = this.view()
      if (!view && this.state.tomorrow) {
        // Tomorrow has dropped out of the forecast: fall back to today.
        this.state.tomorrow = false
        view = this.view()
      }
      if (view) this.drawDay(view)
      else this.drawMessage()
      const queue = this.state.queue
      this.state.queue = []

      if (!covered || !old.length) {
        old.forEach((w) => deleteWidget(w))
        queue.forEach((spec) => this.make(spec))
        return
      }

      const job = { again: false, stopped: false }
      this.state.job = job
      this.showSpinner(true)
      const step = () => {
        if (job.stopped) return
        let n = BATCH
        while (n > 0 && old.length) {
          deleteWidget(old.pop())
          n--
        }
        while (n > 0 && queue.length) {
          this.make(queue.shift())
          n--
        }
        if (old.length || queue.length) {
          setTimeout(step, 0)
          return
        }
        this.state.job = null
        this.showSpinner(false)
        if (job.again) this.render(true)
      }
      // A moment first, so that the spinner is on the screen before the work.
      setTimeout(step, SPINNER.tick)
    },

    // Shows or hides the cover and starts or stops the spinner turning.
    showSpinner(on) {
      const { cover, dots } = this.state
      cover.forEach((w) => w.setProperty(prop.VISIBLE, on))
      if (this.state.spin) clearInterval(this.state.spin)
      this.state.spin = null
      let at = 0
      const turn = () => {
        dots.forEach((d, i) => {
          d.head.setProperty(prop.VISIBLE, on && i === at % dots.length)
          d.trail.setProperty(prop.VISIBLE, on && i === (at + dots.length - 1) % dots.length)
        })
        at++
      }
      turn()
      if (on) this.state.spin = setInterval(turn, SPINNER.tick)
    },

    drawMessage() {
      const { forecast, sync } = this.state
      let message = PROBLEMS[sync]
      if (sync === 'loading') message = 'Getting the forecast...'
      else if (sync === 'ok' || (forecast && sync === 'offline')) message = PROBLEMS.stale
      this.add(widget.TEXT, {
        x: 40,
        y: 120,
        w: WIDTH - 80,
        h: 210,
        text: message,
        text_size: 26,
        color: COLOR.soft,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    },

    drawDay(view) {
      const { forecast } = this.state
      const units = forecast.units
      // Where "now" falls on the time axis; charts for tomorrow have no past.
      const nowX = view.nowHour === null ? null : Math.round((view.nowHour / 24) * PLOT_W)

      this.drawHeader(view, forecast)
      this.drawGrid(nowX)

      // Temperature: a line.
      const tempScale = range(view.temp, MIN_TEMP_SPAN[units.temp])
      this.caption(TEMP, 'temp', tempCaption(view))
      lineRects(view.temp, TEMP_LINE, { ...tempScale, splitAt: nowX }).forEach((r) =>
        this.rect(r, r.before ? dim(COLOR.temp, PAST) : COLOR.temp),
      )

      this.drawRain(view, units, nowX)

      // Wind: a line for the speed, a dash above it for each hour's gusts.
      const windScale = { lo: 0, hi: Math.max(MIN_WIND_MAX[units.wind], view.summary.gustMax) }
      this.caption(WIND, 'wind', windCaption(view, units))
      dashRects(view.gust, WIND, windScale).forEach((r, hour) => {
        // Gusts barely above the wind speed would only smudge the line.
        if (r.y + r.h + 3 > lineY(view.wind, WIND, windScale, (hour + 0.5) * HOUR)) return
        const past = nowX !== null && r.x - PLOT_X + r.w <= nowX
        this.rect(r, dim(COLOR.wind, past ? 0.3 : 0.6))
      })
      lineRects(view.wind, WIND, { ...windScale, splitAt: nowX }).forEach((r) =>
        this.rect(r, r.before ? dim(COLOR.wind, PAST) : COLOR.wind),
      )

      // "Now" on the temperature line: a white dot with a black ring.
      if (nowX !== null) {
        const y = lineY(view.temp, TEMP_LINE, tempScale, nowX) + 1
        this.rect({ x: PLOT_X + nowX - 7, y: y - 7, w: 14, h: 14 }, 0x000000, 7)
        this.rect({ x: PLOT_X + nowX - 4, y: y - 4, w: 8, h: 8 }, COLOR.text, 4)
      }

      ;[0, 6, 12, 18, 24].forEach((hour) => {
        this.text(PLOT_X + hour * HOUR - 20, AXIS_Y, 40, 22, String(hour), 17, COLOR.dim, align.CENTER_H)
      })

      this.state.status = this.text(STATUS.x, STATUS.y, STATUS.w, STATUS.h, '', 16, COLOR.dim, align.CENTER_H)
      this.showStatus()
    },

    // Rain and snow: a bar per hour for the amount expected in it, on a scale
    // from zero marked in the right margin. Over the bars, a line for the
    // chance of rain or snow, 0 to 100% as marked in the left margin, labelled
    // where rain becomes likely.
    drawRain(view, units, nowX) {
      const wet = rainCaption(view, units)
      this.caption(RAIN, wet.icon, wet.text)

      const scale = rainScale(view, units)
      const box = RAIN_BARS
      const right = box.x + box.w + 3
      this.rect({ x: box.x, y: box.y, w: box.w, h: 1 }, COLOR.grid)
      this.text(0, box.y - 9, PLOT_X - 3, 18, '100%', 14, COLOR.chance, align.RIGHT)
      this.text(0, box.y + box.h - 9, PLOT_X - 3, 18, '0%', 14, COLOR.chance, align.RIGHT)
      this.text(right, box.y - 9, WIDTH - right, 18, scale.label, 14, COLOR.rain)
      this.text(right, box.y + 8, WIDTH - right, 18, TEMP_UNITS[units.temp].rain, 14, COLOR.rain)

      barRects(view.rain, box, { max: scale.max, least: TRACE[units.temp] }).forEach((r, hour) => {
        if (!r) return
        const color = view.snowy[hour] ? COLOR.snow : COLOR.rain
        const past = nowX !== null && r.x - PLOT_X + r.w <= nowX
        this.rect(r, past ? dim(color, PAST_BARS) : color, r.h >= 6 ? 2 : 0)
      })

      stepRects(view.prob, box, { lo: 0, hi: 100, splitAt: nowX }).forEach((r) =>
        this.rect(r, r.before ? dim(COLOR.chance, PAST_BARS) : COLOR.chance),
      )

      // A label over each hour where rain becomes likely, from now on, kept
      // clear of the scale in the margin.
      const from = view.nowHour === null ? 0 : Math.floor(view.nowHour)
      const w = 44
      let free = PLOT_X - 4
      chanceMarks(view.prob, from).forEach((hour) => {
        const x = Math.min(WIDTH - w, Math.max(free, Math.round(PLOT_X + (hour + 0.5) * HOUR - w / 2)))
        // No room: pushed off its hour by the label before, or into it at the edge.
        if (x > PLOT_X + (hour + 1) * HOUR || x < free) return
        free = x + w
        const label = `${Math.round(view.prob[hour])}%`
        this.text(x, CHANCE_LABELS.y, w, CHANCE_LABELS.h, label, 16, COLOR.chance, align.CENTER_H)
      })
    },

    // Place and day (a button that flips the day), then the headline numbers.
    drawHeader(view, forecast) {
      this.state.chip = this.add(widget.BUTTON, {
        ...CHIP,
        radius: 18,
        normal_color: COLOR.chip,
        press_color: COLOR.chipPressed,
        color: COLOR.soft,
        text_size: 20,
        text: chipText(forecast, view.tomorrow),
        click_func: () => this.flipDay(),
      })

      const head = view.head
      const sky = condition(head.code, head.isDay)
      this.add(widget.IMG, { x: SIDE, y: 56, src: `wx/${sky.icon}.png` })
      // Four characters ("-12°", "100°") need smaller type to stay clear of
      // the text on the right.
      const big = degrees(head.temp)
      this.text(96, 50, 110, 72, big, big.length > 3 ? 42 : 58, COLOR.text)

      let second = ''
      if (view.tomorrow) second = `Low ${degrees(view.summary.tempMin)}`
      else if (head.feels !== undefined) second = `Feels ${degrees(head.feels)}`
      const column = { x: 206, w: WIDTH - SIDE - 206 }
      this.text(column.x, second ? 58 : 72, column.w, 28, sky.text, 22, COLOR.text, align.RIGHT)
      if (second) this.text(column.x, 88, column.w, 26, second, 20, COLOR.dim, align.RIGHT)
    },

    // Faint lines at 6, 12 and 18 o'clock, a baseline under each chart, and a
    // brighter line for "now".
    drawGrid(nowX) {
      ;[TEMP, RAIN_BARS, WIND].forEach((box) => {
        ;[6, 12, 18].forEach((hour) => {
          this.rect({ x: box.x + hour * HOUR, y: box.y, w: 1, h: box.h }, COLOR.grid)
        })
        this.rect({ x: box.x, y: box.y + box.h, w: box.w, h: 1 }, COLOR.baseline)
        if (nowX !== null) this.rect({ x: box.x + nowX - 1, y: box.y, w: 2, h: box.h }, COLOR.now)
      })
    },

    // A small icon in the chart's colour, then the day's figures in plain text.
    caption(box, icon, text) {
      this.add(widget.IMG, { x: box.x, y: box.y - 27, src: `wx/s-${icon}.png` })
      this.text(box.x + 30, box.y - 29, WIDTH - SIDE - box.x - 30, 26, text, 20, COLOR.soft)
    },

    showStatus() {
      const { status, forecast, sync } = this.state
      if (!status || !forecast) return
      const fetched = clock(forecast.at, forecast.offset)
      let text = `Updated ${fetched}`
      if (sync === 'loading') text = 'Updating...'
      else if (sync === 'offline') text = `No phone, from ${fetched}`
      else if (sync !== 'ok') text = `Not updated, from ${fetched}`
      status.params.text = text
      if (status.widget) status.widget.setProperty(prop.TEXT, text)
    },

    flipDay() {
      // Still drawing the last flip.
      if (this.state.job) return
      const view = this.view()
      if (!this.state.tomorrow && !(view && view.hasTomorrow)) {
        showToast({ content: 'No forecast for tomorrow yet' })
        return
      }
      this.state.tomorrow = !this.state.tomorrow
      // The chip names the new day at once; the rest follows under the spinner.
      const chip = this.state.chip && this.state.chip.widget
      if (chip) chip.setProperty(prop.MORE, { ...CHIP, text: chipText(this.state.forecast, this.state.tomorrow) })
      this.render(true)
    },
  }),
)
