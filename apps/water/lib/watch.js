// Watch-side glue shared by the page and the reminder service: the two
// stored records, the clock, the sleep data, whether the watch is worn, the
// buzz, and the alarms that wake the service.
//
// The records are small JSON files read from the file system every time.
// Not LocalStorage: an instance of it keeps the data in memory (so say the
// docs), and the page and the service each holding their own copy, each
// writing it back whole, is how the page could show a fresh tap while the
// service still buzzed for the old one. Each record has one job: the page's
// record is written only by the page; the wear record only ever gains a span
// or closes one, read just before it is written.
import { readFileSync, writeFileSync } from '@zos/fs'
import { Time, Sleep, Wear, Vibrator, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor'
import { set, cancel, getAllAlarms, REPEAT_ONCE } from '@zos/alarm'

import { normaliseRecord, normaliseOffs, clockOffset, sleepSpan } from './water'

export const SERVICE = 'app-service/remind'
const RECORD_FILE = 'water.json'
const WEAR_FILE = 'wear.json'

let time = null
let sleep = null
let wear = null

// --- files ---

function readJson(path) {
  try {
    const text = readFileSync({ path, options: { encoding: 'utf8' } })
    return text ? JSON.parse(text) : null
  } catch (e) {
    return null
  }
}

// False if it could not be written. An App Service may write files only
// while the screen is off (docs: App Service, limitations).
function writeJson(path, value) {
  try {
    writeFileSync({ path, data: JSON.stringify(value), options: { encoding: 'utf8' } })
    return true
  } catch (e) {
    console.log('water: could not write ' + path + ': ' + e)
    return false
  }
}

export const loadRecord = () => normaliseRecord(readJson(RECORD_FILE))
export const saveRecord = (record) => writeJson(RECORD_FILE, record)
export const loadOffs = () => normaliseOffs(readJson(WEAR_FILE))
export const saveOffs = (offs) => writeJson(WEAR_FILE, offs)

// --- sensors ---

// Now, and the wall clock's distance from UTC.
export function clockNow() {
  if (!time) time = new Time()
  return { now: time.getTime(), offset: clockOffset(time) }
}

// What the watch knows about your sleep: `{ asleep, night }` (see sleepSpan).
// `fresh` asks the system to update its sleep data first (it does so every 30
// minutes on its own). Without the data, or the permission, you count as
// awake and all the time since the tap counts.
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
    if (!wear) wear = new Wear()
    const status = wear.getStatus()
    if (status === 0) return false
    if (status === 1 || status === 2) return true
    return null
  } catch (e) {
    return null
  }
}

// --- the motor ---

// The buzz: the motor's strong reminder pattern (four strong pulses), the
// "4 times" button of the Buzz app. No notification: unread notifications
// were seen to silence vibrations on this watch.
export function buzz() {
  const vibrator = new Vibrator()
  vibrator.stop()
  vibrator.setMode(VIBRATOR_SCENE_STRONG_REMINDER)
  vibrator.start()
}

// Ends a buzz that is still going (from a page "4 times" keeps going).
export function stopBuzz() {
  try {
    new Vibrator().stop()
  } catch (e) {
    // Nothing to stop.
  }
}

// --- alarms ---

function setAlarm(t) {
  try {
    const at = Math.floor(t / 1000)
    // The docs name the time `time`; the official notification sample
    // names it `date`. Both are given. `param` tells the service it was an
    // alarm, not a system event.
    return set({ url: SERVICE, param: 'alarm', time: at, date: at, repeat_type: REPEAT_ONCE, store: true }) || 0
  } catch (e) {
    return 0
  }
}

// Replaces the app's alarms with one for each time (ascending). The first
// is set before any old one is cancelled: if alarms cannot be set from here,
// the old ones stay, since an old reminder is better than none. Returns how
// many were set.
export function plan(times) {
  let old = []
  try {
    old = getAllAlarms() || []
  } catch (e) {
    old = []
  }
  if (!times.length || !setAlarm(times[0])) return 0
  old.forEach((id) => {
    try {
      cancel(id)
    } catch (e) {
      // Already gone.
    }
  })
  return 1 + times.slice(1).filter(setAlarm).length
}
