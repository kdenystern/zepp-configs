// Watch-side glue shared by the page and the reminder service: the time of
// the last tap, the settings, the clock, the sleep data, whether the watch is
// worn, the buzz, and the alarms that wake the service.
import { LocalStorage } from '@zos/storage'
import { Time, Sleep, Wear, Vibrator, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor'
import { set, cancel, getAllAlarms, REPEAT_ONCE } from '@zos/alarm'

import { LAST_KEY, OFF_KEY, SPENT_KEY, SETTINGS_KEY, normaliseSettings, clockOffset, sleepSpan, reminderTimes } from './water'

export const SERVICE = 'app-service/remind'

let storage = null
let time = null
let sleep = null

function store() {
  if (!storage) storage = new LocalStorage()
  return storage
}

// Now, and the wall clock's distance from UTC.
export function clockNow() {
  if (!time) time = new Time()
  return { now: time.getTime(), offset: clockOffset(time) }
}

// What the watch knows about your sleep: `{ asleep, night }` (see sleepSpan).
// `fresh` asks the system to update its sleep data first (it does so every 30
// minutes on its own). Without the data, or the permission, you count as
// awake and all the time since the last tap counts.
export function readSleep(now, offset, fresh = false) {
  try {
    if (!sleep) sleep = new Sleep()
    if (fresh && sleep.updateInfo) sleep.updateInfo()
    const asleep = sleep.getSleepingStatus ? sleep.getSleepingStatus() === 1 : false
    const info = sleep.getInfo() || {}
    return { asleep, night: sleepSpan({ ...info, asleep }, now, offset) }
  } catch (e) {
    return { asleep: false, night: null }
  }
}

// Is the watch on the wrist? true (worn or moving), false (not worn), or null
// when the watch is not sure or cannot say.
export function readWorn() {
  try {
    const status = new Wear().getStatus()
    if (status === 0) return false
    if (status === 1 || status === 2) return true
    return null
  } catch (e) {
    return null
  }
}

// The buzz: the motor's strong reminder pattern (four strong pulses), the
// "4 times" button of the Buzz app. No notification: unread notifications
// were seen to silence vibrations on this watch.
export function buzz() {
  const vibrator = new Vibrator()
  vibrator.stop()
  vibrator.setMode(VIBRATOR_SCENE_STRONG_REMINDER)
  vibrator.start()
}

export function loadOff() {
  try {
    const n = Number(store().getItem(OFF_KEY, 0))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    return 0
  }
}

export const saveOff = (t) => store().setItem(OFF_KEY, t)

export function loadSpent() {
  try {
    const n = Number(store().getItem(SPENT_KEY, 0))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    return 0
  }
}

export const saveSpent = (t) => store().setItem(SPENT_KEY, t)

export function loadLast() {
  const n = Number(store().getItem(LAST_KEY, 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const saveLast = (t) => store().setItem(LAST_KEY, t)

export function loadSettings() {
  try {
    return normaliseSettings(JSON.parse(store().getItem(SETTINGS_KEY, '') || 'null'))
  } catch (e) {
    return normaliseSettings(null)
  }
}

export function saveSettings(raw) {
  const settings = normaliseSettings(raw)
  store().setItem(SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

// Replaces every alarm of this app with the reminders that follow. Returns the
// first one, 0 if none could be set. `after` keeps a reminder that is firing
// right now from being set again.
export function plan({ last, night, paused, settings, now, spent = 0, after = now }) {
  let ids = []
  try {
    ids = getAllAlarms() || []
  } catch (e) {
    ids = []
  }
  ids.forEach((id) => {
    try {
      cancel(id)
    } catch (e) {
      // Already gone.
    }
  })

  let next = 0
  reminderTimes({ last, night, paused, now, settings, spent, after }).forEach((t) => {
    let id = 0
    try {
      const at = Math.floor(t / 1000)
      // The docs name the time `time`; the official notification sample
      // names it `date`. Both are given.
      id = set({ url: SERVICE, time: at, date: at, repeat_type: REPEAT_ONCE, store: true })
    } catch (e) {
      id = 0
    }
    if (id && !next) next = t
  })
  return next
}
