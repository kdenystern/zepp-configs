// When to buzz, and how full the glass is. Shared by the watch page, the
// reminder service, the phone's side service and the settings page, so it
// must stay free of platform imports.
//
// Times are UTC milliseconds. `offset` is how far the watch's wall clock is
// ahead of UTC, in milliseconds. `last` is when the drop was last tapped, 0
// for never. `night` is `{ start, end }`, the sleep the watch knows about
// (`end` is now while still asleep), or null. Only time awake with the watch
// on counts: the level does not drain while you sleep or while the watch is
// off the wrist, it carries on where it was.

export const LAST_KEY = 'last' // watch LocalStorage
export const SETTINGS_KEY = 'settings' // watch LocalStorage, as the phone sent them

// When the watch came off the wrist, 0 while it is worn (watch LocalStorage).
// The time it spends off does not count either.
export const OFF_KEY = 'off'

// The most time counted since the last tap (watch LocalStorage), so the level
// only ever goes down between taps, even if the sleep data later reads
// differently. Only a tap sets it back to 0.
export const SPENT_KEY = 'spent'

// Phone settings storage key: minutes to wait before the buzz, as a string.
export const GAP_KEY = 'gap'
export const PHONE_KEYS = [GAP_KEY]

export const DEFAULTS = { gap: 180 }
export const GAP_LIMITS = { min: 30, max: 360, step: 15 }

// Reminders are set this far ahead, at most MAX_ALARMS of them.
const PLAN_AHEAD = 48 * 3600 * 1000
export const MAX_ALARMS = 24

const MINUTE = 60000
const DAY = 24 * 60 * MINUTE
// While paused the service looks again this often, in case the system
// events that should wake it do not.
export const PAUSED_CHECK = 30 * MINUTE
// A buzz this close to due counts as due.
const EARLY = 5 * MINUTE

const pad = (n) => (n < 10 ? '0' + n : '' + n)

// --- settings ---

function clampGap(value, fallback) {
  const n = Number(value)
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) return fallback
  const { min, max, step } = GAP_LIMITS
  return Math.min(max, Math.max(min, Math.round(n / step) * step))
}

export const normaliseSettings = (raw) => ({
  gap: clampGap(raw && typeof raw === 'object' ? raw.gap : undefined, DEFAULTS.gap),
})

// The settings as the phone stores them; `getItem` reads one key.
export const phoneSettings = (getItem) => normaliseSettings({ gap: getItem(GAP_KEY) })

// A step more (+1) or less (-1), kept inside the limits.
export const stepGap = (settings, direction) => clampGap(settings.gap + direction * GAP_LIMITS.step, settings.gap)

// "3 h", "2 h 30 min"
export function gapLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const gapMs = (settings) => settings.gap * MINUTE

// --- clock ---

// From the watch's Time sensor: local wall clock against UTC, to the nearest
// quarter of an hour (no time zone is finer than that).
export function clockOffset(time) {
  const wall = Date.UTC(
    time.getFullYear(),
    time.getMonth() - 1,
    time.getDate(),
    time.getHours(),
    time.getMinutes(),
    time.getSeconds ? time.getSeconds() : 0,
  )
  const quarter = 15 * MINUTE
  return Math.round((wall - time.getTime()) / quarter) * quarter
}

// "13:45"
export function clock(t, offset) {
  const d = new Date(t + offset)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// --- sleep ---

// The latest moment before `t` that the wall clock read `minutes` after
// midnight.
function latestAt(minutes, t, offset) {
  const midnight = Math.floor((t + offset) / DAY) * DAY - offset
  const at = midnight + minutes * MINUTE
  return at > t ? at - DAY : at
}

const validMinutes = (m) => Number.isFinite(m) && m >= 0 && m < 1440

// The sleep to leave out, from the Sleep sensor's reading
// `{ asleep, startTime, endTime, totalTime }` (minutes after local midnight).
// Awake: the last night, if it ended within a day. Asleep: from the night's
// start until now. Null when the watch has nothing usable.
export function sleepSpan(sleep, now, offset) {
  if (!sleep) return null
  const startTime = Number(sleep.startTime)
  const endTime = Number(sleep.endTime)
  const recorded = Number(sleep.totalTime) > 0
  if (sleep.asleep) {
    if (!validMinutes(startTime) || !(recorded || startTime > 0)) return null
    const start = latestAt(startTime, now, offset)
    return now - start < 16 * 60 * MINUTE ? { start, end: now } : null
  }
  if (!recorded || !validMinutes(startTime) || !validMinutes(endTime)) return null
  const end = latestAt(endTime, now, offset)
  if (now - end >= DAY) return null
  return { start: latestAt(startTime, end - 1, offset), end }
}

// --- off the wrist ---

// The last tap moved on by the time the watch has been off the wrist (since
// `off`, 0 if worn), so that time does not count.
export function liftOff(last, off, now) {
  if (!last || !off) return last
  return last + Math.max(0, now - Math.max(off, last))
}

// How long you have been awake since the last tap. Never tapped: forever.
export function awakeSince(last, now, night) {
  if (!last) return Infinity
  let awake = now - last
  if (night) awake -= Math.max(0, Math.min(now, night.end) - Math.max(last, night.start))
  return Math.max(0, awake)
}

// Time counted since the last tap, never less than `spent` (what was counted
// before). Never tapped: forever.
export function counted({ last, now, night, spent = 0 }) {
  return Math.max(spent || 0, awakeSince(last, now, night))
}

// --- reminders ---

// Should a reminder that fires at `now` buzz? Not while paused (asleep or off
// the wrist), and only once the wait has passed in time that counts.
export function shouldBuzz(state) {
  if (state.paused) return false
  return counted(state) >= gapMs(state.settings) - EARLY
}

// When the service should look next, ascending: the moment the wait runs out
// if you stay awake (again a whole wait on once it has run out), every half
// hour while paused, then every wait after that in case the service cannot
// set alarms itself. The first is after `after`.
export function reminderTimes({ last, night, now, settings, paused, spent, after = now }) {
  const gap = gapMs(settings)
  const left = gap - counted({ last, now, night, spent })
  let t = paused ? now + PAUSED_CHECK : left > EARLY ? now + left : now + gap
  if (t <= after) t = after + MINUTE
  const times = []
  while (times.length < MAX_ALARMS && t <= now + PLAN_AHEAD) {
    times.push(t)
    t += gap
  }
  return times
}

// How full the glass is, 1 to 0: it drains over `gap` of time awake.
export function levelAt({ last, night, now, settings, spent }) {
  const gap = gapMs(settings)
  const awake = counted({ last, now, night, spent })
  return awake === Infinity ? 0 : Math.max(0, Math.min(1, (gap - awake) / gap))
}
