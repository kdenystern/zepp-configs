// The Water app's one screen, with no words or numbers on it: a blue level
// that drains over the wait set on the phone (3 hours unless changed), and a
// drop in the middle to tap after a drink, which fills it up again. When it
// has run dry the drop turns red. While you sleep (by the watch's sleep data)
// or the watch is off the wrist it does not drain, and only a tap on the drop
// ever fills it (the most time counted is kept in `spent`). A tap also moves the next buzz (lib/watch.js plan()).
import { createWidget, widget, prop, setStatusBarVisible } from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'

import {
  clockNow,
  readSleep,
  readWorn,
  loadLast,
  saveLast,
  loadOff,
  saveOff,
  loadSpent,
  saveSpent,
  loadSettings,
  saveSettings,
  plan,
} from '../lib/watch'
import { levelAt, liftOff, counted } from '../lib/water'

const WIDTH = 390
const HEIGHT = 450
const DROP = { size: 150 }
const DROP_AT = { x: (WIDTH - DROP.size) / 2, y: (HEIGHT - DROP.size) / 2 }
const WATER = 0x1f6fb8
// The level is redrawn this often while the app is open. Over 3 hours it
// drops about a pixel every 24 seconds.
const TICK = 20000

let last = 0
let spent = 0
// When the watch was seen off the wrist while open, 0 while worn.
let off = 0
let settings = null
// The sleep data, read when the page opens and again every few minutes.
let sleep = { asleep: false, night: null }
let sleepRead = 0
const SLEEP_EVERY = 5 * 60000

function readSleepNow(fresh) {
  const { now, offset } = clockNow()
  sleep = readSleep(now, offset, fresh)
  sleepRead = now
}

// Off the wrist while open: that time does not count. Back on: the tap is
// moved on by the time it was off.
function checkWorn(now) {
  const worn = readWorn()
  if (worn === false && !off) {
    off = now
    saveOff(off)
  } else if (worn !== false && off) {
    last = liftOff(last, off, now)
    if (last) saveLast(last)
    off = 0
    saveOff(0)
  }
}

// The state as of `now`, with the most time counted so far kept.
function stateAt(now) {
  const state = { last: liftOff(last, off, now), night: sleep.night, now, settings, spent }
  const total = counted(state)
  if (last && total > spent && total !== Infinity) {
    spent = state.spent = total
    saveSpent(spent)
  }
  return state
}

function replan() {
  const { now } = clockNow()
  plan({ ...stateAt(now), paused: sleep.asleep || !!off })
}

Page(
  BasePage({
    state: { built: false, water: null, drop: null, dry: null, timer: null },

    onInit() {
      last = loadLast()
      spent = loadSpent()
      // The time it was off (noticed by the reminder service) does not count;
      // if it is back on now, the tap is moved on by that time.
      off = loadOff()
      checkWorn(clockNow().now)
      // The very first time, it starts full.
      if (!last) {
        last = clockNow().now
        saveLast(last)
        spent = 0
        saveSpent(0)
      }
      settings = loadSettings()
      readSleepNow(true)
      replan()
      this.sync()
    },

    build() {
      setStatusBarVisible(false)
      this.state.water = createWidget(widget.FILL_RECT, { x: 0, y: HEIGHT, w: WIDTH, h: 0, color: WATER })
      const drop = (src) =>
        createWidget(widget.BUTTON, {
          ...DROP_AT,
          w: -1, // take the size of the image
          h: -1,
          text: '',
          normal_src: `${src}.png`,
          press_src: `${src}_p.png`,
          click_func: () => this.drank(),
        })
      this.state.drop = drop('drop')
      this.state.dry = drop('drop_red')
      this.state.built = true
      this.render()
      this.state.timer = setInterval(() => this.render(), TICK)
    },

    onDestroy() {
      if (this.state.timer) clearInterval(this.state.timer)
      this.state.timer = null
      this.state.built = false
    },

    render() {
      if (!this.state.built) return
      let { now } = clockNow()
      if (now - sleepRead >= SLEEP_EVERY) {
        readSleepNow(false)
        now = sleepRead
      }
      const wasOff = off
      checkWorn(now)
      if (wasOff !== off) replan()
      const level = levelAt(stateAt(now))
      const h = Math.round(HEIGHT * level)
      this.state.water.setProperty(prop.VISIBLE, h > 0)
      if (h > 0) this.state.water.setProperty(prop.MORE, { x: 0, y: HEIGHT - h, w: WIDTH, h })
      this.state.drop.setProperty(prop.VISIBLE, h > 0)
      this.state.dry.setProperty(prop.VISIBLE, h === 0)
    },

    drank() {
      last = clockNow().now
      saveLast(last)
      spent = 0
      saveSpent(0)
      off = 0
      saveOff(0)
      replan()
      this.render()
    },

    // Pushed by the phone when the wait is changed while this is open.
    onCall(message) {
      if (message && message.method === 'SETTINGS') this.applySettings(message.params)
    },

    // Picks up the wait from the phone. With the phone out of reach the
    // stored one is used.
    sync() {
      try {
        this.request({ method: 'SETTINGS' })
          .then((result) => this.applySettings(result && result.settings))
          .catch(() => {})
      } catch (e) {
        console.log('water: sync unavailable: ' + e)
      }
    },

    applySettings(raw) {
      if (!raw) return
      const before = JSON.stringify(settings)
      settings = saveSettings(raw)
      if (JSON.stringify(settings) === before) return
      replan()
      this.render()
    },
  }),
)
