// The Water app's one screen, with no words or numbers on it: a blue level
// that drains over the wait set on the phone (3 hours unless changed), and a
// drop in the middle to tap after a drink, which fills it up again and stops
// a buzz. When it has run dry the drop turns red. While you sleep (by the
// watch's sleep data) or the watch is off the wrist it does not drain, and
// only a tap ever fills it.
//
// What it shows is worked out exactly as the reminder service decides to
// buzz (lib/water.js), from the same records, read afresh on every redraw.
import { createWidget, widget, prop, setStatusBarVisible } from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'

import {
  clockNow,
  readSleep,
  readWorn,
  loadRecord,
  saveRecord,
  loadOffs,
  saveOffs,
  stopBuzz,
  plan,
} from '../lib/watch'
import { normaliseSettings, noteWear, isOff, counted, levelOf, checkTimes } from '../lib/water'

const WIDTH = 390
const HEIGHT = 450
const DROP = { size: 150 }
const DROP_AT = { x: (WIDTH - DROP.size) / 2, y: (HEIGHT - DROP.size) / 2 }
const WATER = 0x1f6fb8
// The level is redrawn this often while the app is open. Over 3 hours it
// drops about a pixel every 24 seconds.
const TICK = 20000
// The sleep data is read again this often while open.
const SLEEP_EVERY = 5 * 60000
// The floor (the most time shown as counted) is stored once it has grown by
// this much, so reopening never shows more water than before.
const FLOOR_STEP = 60000

// This page's copy of its record { tap, floor, gap }. Only this page writes
// the record, so the copy is always current.
let record = null
let sleep = { asleep: false, night: null }
let sleepRead = 0
// Whether the alarms were last set for a pause (asleep or off the wrist);
// null when they must be set again.
let plannedPaused = null

// Everything as of `now`: how much time counts, and whether it is paused.
// The wear record is read afresh, since the service writes it too.
function look(now, offset) {
  if (!sleepRead || now - sleepRead >= SLEEP_EVERY) {
    sleep = readSleep(now, offset, !sleepRead)
    sleepRead = now
  }
  const before = loadOffs()
  const offs = noteWear(before, readWorn(), now, record.tap)
  if (offs !== before) saveOffs(offs)
  const spent = counted({ ...record, night: sleep.night, offs, now })
  return { spent, paused: sleep.asleep || isOff(offs) }
}

function keepFloor(spent) {
  if (spent === Infinity || spent < record.floor + FLOOR_STEP) return
  record = { ...record, floor: spent }
  saveRecord(record)
}

Page(
  BasePage({
    state: { built: false, water: null, drop: null, dry: null, timer: null },

    onInit() {
      sleepRead = 0
      plannedPaused = null
      record = loadRecord()
      // The very first time, it starts full.
      if (!record.tap) {
        record = { ...record, tap: clockNow().now, floor: 0 }
        saveRecord(record)
      }
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

    // Redraws the level, and sets the reminders again whenever the pause
    // (asleep, off the wrist) has changed since they were set.
    render() {
      if (!this.state.built) return
      const { now, offset } = clockNow()
      const { spent, paused } = look(now, offset)
      if (paused !== plannedPaused) {
        plan(checkTimes({ spent, gap: record.gap, paused, now }))
        plannedPaused = paused
      }
      keepFloor(spent)
      const h = Math.round(HEIGHT * levelOf(spent, record.gap))
      this.state.water.setProperty(prop.VISIBLE, h > 0)
      if (h > 0) this.state.water.setProperty(prop.MORE, { x: 0, y: HEIGHT - h, w: WIDTH, h })
      this.state.drop.setProperty(prop.VISIBLE, h > 0)
      this.state.dry.setProperty(prop.VISIBLE, h === 0)
    },

    drank() {
      stopBuzz()
      record = { ...record, tap: clockNow().now, floor: 0 }
      saveRecord(record)
      plannedPaused = null
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
      const { gap } = normaliseSettings(raw)
      if (gap === record.gap) return
      record = { ...record, gap }
      saveRecord(record)
      plannedPaused = null
      this.render()
    },
  }),
)
