// When to buzz, and how full the glass is. Shared by the watch page, the
// reminder service, the phone's side service and the settings page, so it
// must stay free of platform imports.
//
// Times are UTC milliseconds. The watch keeps two small records (stored by
// lib/watch.js):
// - the page's record `{ tap, floor, gap }`: when the drop was last tapped
//   (0 for never), the most time counted since then that the page has shown,
//   and the wait in minutes. Only the page writes it.
// - the wear record: spans `[start, end]` off the wrist, `end` 0 while still
//   off. Whoever sees the watch go off or on (the page or the service)
//   updates it.
// Only time awake with the watch on counts: the time since the tap, minus
// the night and the spans off the wrist, and never less than `floor`, so the
// level only ever goes down between taps.

// Phone settings storage key: minutes to wait before the buzz, as a string.
export const GAP_KEY = 'gap'
export const PHONE_KEYS = [GAP_KEY]

export const DEFAULTS = { gap: 180 }
export const GAP_LIMITS = { min: 30, max: 360, step: 15 }

const MINUTE = 60000
const DAY = 24 * 60 * MINUTE

// Once the wait has run out the service buzzes, then looks again every NAG
// until the drop is tapped; after NAG_FOR of that, every LATER. While paused
// (asleep or off the wrist) it looks every PAUSED_CHECK, in case the system
// events that should wake it do not come.
const NAG = 5 * MINUTE
const NAG_FOR = 60 * MINUTE
const LATER = 30 * MINUTE
const PAUSED_CHECK = 30 * MINUTE
// A look this close to the end of the wait counts as the end, so an alarm
// that fires a moment early still buzzes. The page shows empty from then on
// as well, so the two always agree.
const EARLY = MINUTE
// The most alarms set at once.
export const MAX_ALARMS = 24
// The most spans off the wrist kept.
const KEEP_SPANS = 20

const pad = (n) => (n < 10 ? '0' + n : '' + n)
const time = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

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

// --- the stored records ---

// The page's record as read back from the watch: anything missing or
// damaged reads as never tapped, with the default wait.
export function normaliseRecord(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const tap = time(r.tap)
  return { tap, floor: tap ? time(r.floor) : 0, gap: normaliseSettings(r).gap }
}

// The wear record as read back: only well-formed spans, oldest first.
export function normaliseOffs(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => Array.isArray(s) && time(s[0]) && (s[1] === 0 || time(s[1]) >= s[0]))
    .map((s) => [s[0], s[1]])
    .sort((a, b) => a[0] - b[0])
}

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
  if (!recorded || !validMinutes(endTime) || !validMinutes(startTime)) return null
  const end = latestAt(endTime, now, offset)
  if (now - end >= DAY) return null
  return { start: latestAt(startTime, end - 1, offset), end }
}

// --- off the wrist ---

// Is the watch off the wrist by the record (the last span still open)?
export const isOff = (offs) => offs.length > 0 && !offs[offs.length - 1][1]

// The wear record after a look at the Wear sensor at `now` (`worn` is true,
// false, or null when the watch is not sure): seen off opens a span, seen on
// closes it, unsure changes nothing. Returns the very same array when nothing
// changed, so the caller knows whether to store it; a changed one keeps only
// the spans that reach past `since` (the tap).
export function noteWear(offs, worn, now, since) {
  let next
  if (worn === false && !isOff(offs)) next = offs.concat([[now, 0]])
  else if (worn === true && isOff(offs)) {
    const start = offs[offs.length - 1][0]
    next = offs.slice(0, -1).concat([[start, Math.max(start, now)]])
  } else return offs
  return next.filter((s) => !s[1] || s[1] > since).slice(-KEEP_SPANS)
}

// --- counting ---

// How much of the time from `from` to `to` the spans cover, overlaps counted
// once. A span with `end` 0 is still going.
export function covered(spans, from, to) {
  const parts = spans
    .map((s) => [Math.max(s[0], from), Math.min(s[1] || to, to)])
    .filter((s) => s[1] > s[0])
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let reach = from
  parts.forEach(([start, end]) => {
    if (end <= reach) return
    total += end - Math.max(start, reach)
    reach = end
  })
  return total
}

// The time that counts since the tap: awake and with the watch on, never
// less than `floor`. Never tapped: forever.
export function counted({ tap, floor = 0, night = null, offs = [], now }) {
  if (!tap) return Infinity
  const pauses = night ? offs.concat([[night.start, night.end]]) : offs
  const awake = now - tap - covered(pauses, tap, now)
  return Math.max(floor || 0, awake, 0)
}

// Has the wait run out? Both the page (empty, red drop) and the service
// (buzz) go by this.
export const isDue = (spent, gap) => spent >= gap * MINUTE - EARLY

// How full the glass is, 1 to 0.
export function levelOf(spent, gap) {
  if (isDue(spent, gap)) return 0
  return Math.min(1, (gap * MINUTE - spent) / (gap * MINUTE))
}

// When the service should look next, ascending, at most `max` of them, if
// nothing changes before then: while paused every half hour; otherwise when
// the wait runs out (or in NAG if it already has), then every NAG for an
// hour, then every half hour. The service sets them again whenever it looks,
// so the later ones are only a fallback.
export function checkTimes({ spent, gap, paused, now, max = MAX_ALARMS }) {
  const times = []
  if (paused) {
    for (let t = now + PAUSED_CHECK; times.length < max; t += PAUSED_CHECK) times.push(t)
    return times
  }
  const left = gap * MINUTE - spent
  const due = left > EARLY ? now + left : now
  for (let t = left > EARLY ? due : now + NAG; times.length < max; t += t - due < NAG_FOR ? NAG : LATER) {
    times.push(t)
  }
  return times
}
