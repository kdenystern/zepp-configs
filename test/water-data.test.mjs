// The Water app's pure logic: the wait, time asleep and when to buzz.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULTS,
  MAX_ALARMS,
  normaliseSettings,
  stepGap,
  gapLabel,
  clockOffset,
  clock,
  sleepSpan,
  awakeSince,
  liftOff,
  reminderTimes,
  shouldBuzz,
  levelAt,
} from '../apps/water/lib/water.js'

const HOUR = 3600000
// Helsinki in winter: the wall clock is two hours ahead of UTC.
const OFFSET = 2 * HOUR
// A wall-clock time in that zone, as UTC milliseconds.
const at = (h, m = 0, day = 18) => Date.UTC(2026, 10, day, h, m) - OFFSET
const S = DEFAULTS // 3 hours
const local = (times) => times.map((t) => `${new Date(t + OFFSET).getUTCDate()} ${clock(t, OFFSET)}`)

test('the clock offset comes from the Time sensor', () => {
  const time = {
    getTime: () => at(9, 30) + 12345,
    getFullYear: () => 2026,
    getMonth: () => 11,
    getDate: () => 18,
    getHours: () => 9,
    getMinutes: () => 30,
    getSeconds: () => 12,
  }
  assert.equal(clockOffset(time), OFFSET)
  assert.equal(clock(at(9, 5), OFFSET), '09:05')
})

test('the wait steps by a quarter of an hour, from 30 min to 6 hours', () => {
  assert.deepEqual(normaliseSettings(null), { gap: 180 })
  assert.deepEqual(normaliseSettings({ gap: '100' }), { gap: 105 })
  assert.deepEqual(normaliseSettings({ gap: 'x' }), { gap: 180 })
  assert.equal(stepGap(S, 1), 195)
  assert.equal(stepGap(S, -1), 165)
  assert.equal(stepGap({ gap: 30 }, -1), 30)
  assert.equal(stepGap({ gap: 360 }, 1), 360)
  assert.equal(gapLabel(180), '3 h')
  assert.equal(gapLabel(165), '2 h 45 min')
  assert.equal(gapLabel(45), '0 h 45 min')
})

const NIGHT = { asleep: false, startTime: 23 * 60 + 30, endTime: 7 * 60 + 20, totalTime: 450 }

test('the night comes from the sleep data', () => {
  assert.deepEqual(sleepSpan(NIGHT, at(9, 0), OFFSET), { start: at(23, 30, 17), end: at(7, 20) })
  // Late in the evening it is still last night.
  assert.deepEqual(sleepSpan(NIGHT, at(23, 0), OFFSET), { start: at(23, 30, 17), end: at(7, 20) })
  // Asleep: from the start until now.
  const asleep = { ...NIGHT, asleep: true }
  assert.deepEqual(sleepSpan(asleep, at(2, 0, 19), OFFSET), { start: at(23, 30), end: at(2, 0, 19) })
  // Nothing recorded, or too old: none.
  assert.equal(sleepSpan({ asleep: false, startTime: 0, endTime: 0, totalTime: 0 }, at(9, 0), OFFSET), null)
  assert.equal(sleepSpan(null, at(9, 0), OFFSET), null)
})

test('time asleep does not count', () => {
  const night = { start: at(23, 0, 17), end: at(7, 0) }
  // Tapped 22:00, slept 23:00 to 07:00: at 08:00 two hours awake.
  assert.equal(awakeSince(at(22, 0, 17), at(8, 0), night), 2 * HOUR)
  // Tapped after waking: the night is before it.
  assert.equal(awakeSince(at(7, 30), at(8, 0), night), HOUR / 2)
  assert.equal(awakeSince(0, at(8, 0), night), Infinity)
  assert.equal(awakeSince(at(8, 0), at(9, 0), null), HOUR)
})

test('the next look is when the wait runs out awake', () => {
  const night = { start: at(23, 0, 17), end: at(7, 0) }
  // Tapped 22:00, an hour used before bed: due 09:00.
  const times = reminderTimes({ last: at(22, 0, 17), night, now: at(7, 30), settings: S })
  assert.deepEqual(local(times).slice(0, 3), ['18 09:00', '18 12:00', '18 15:00'])
  // Already due: again a whole wait on.
  assert.equal(local(reminderTimes({ last: at(9, 0), night: null, now: at(12, 0), settings: S, after: at(12, 1) }))[0], '18 15:00')
  // Asleep: every half hour.
  assert.equal(local(reminderTimes({ last: at(22, 0, 17), night, now: at(1, 0), settings: S, paused: true }))[0], '18 01:30')
})

test('a tap moves the chain; it reaches two days ahead', () => {
  const times = reminderTimes({ last: at(11, 20), night: null, now: at(11, 20), settings: S })
  assert.deepEqual(local(times).slice(0, 2), ['18 14:20', '18 17:20'])
  assert.equal(times.length, 16)
  const hourly = reminderTimes({ last: at(11, 0), night: null, now: at(11, 0), settings: { gap: 60 } })
  assert.equal(hourly.length, MAX_ALARMS)
})

test('a buzz stays quiet while paused, or before the wait has passed awake', () => {
  const night = { start: at(23, 0, 17), end: at(7, 0) }
  const base = { night, now: at(13, 0), settings: S, paused: false }
  assert.equal(shouldBuzz({ ...base, last: at(10, 0) }), true)
  assert.equal(shouldBuzz({ ...base, last: at(12, 0) }), false)
  assert.equal(shouldBuzz({ ...base, last: at(10, 0), paused: true }), false)
  assert.equal(shouldBuzz({ ...base, last: at(22, 0, 17), now: at(8, 30) }), false)
  assert.equal(shouldBuzz({ ...base, last: at(22, 0, 17), now: at(9, 0) }), true)
  assert.equal(shouldBuzz({ ...base, last: 0 }), true)
  assert.equal(shouldBuzz({ ...base, last: at(10, 30), settings: { gap: 120 } }), true)
})

test('time off the wrist moves the last tap on', () => {
  // Tapped 09:00, off from 10:00 to 11:30: as if tapped 10:30.
  assert.equal(liftOff(at(9, 0), at(10, 0), at(11, 30)), at(10, 30))
  assert.equal(liftOff(at(9, 0), 0, at(11, 30)), at(9, 0))
  assert.equal(liftOff(0, at(10, 0), at(11, 30)), 0)
})

test('the level drains over the wait, and stands still in the night', () => {
  const level = (last, night, now, settings = S) => levelAt({ last, night, now, settings })
  assert.equal(level(at(10, 0), null, at(10, 0)), 1)
  assert.equal(level(at(10, 0), null, at(11, 30)), 0.5)
  assert.equal(level(at(10, 0), null, at(13, 0)), 0)
  assert.equal(level(at(10, 0), null, at(11, 0), { gap: 120 }), 0.5)
  const night = { start: at(22, 30, 17), end: at(7, 0) }
  // Tapped 21:00, 1.5 h used before bed: half full on waking.
  assert.equal(level(at(21, 0, 17), night, at(7, 0)), 0.5)
  assert.equal(level(at(21, 0, 17), night, at(8, 30)), 0)
  // Without sleep data, all the time counts.
  assert.equal(level(at(22, 0, 17), null, at(8, 30)), 0)
  assert.equal(level(0, null, at(8, 30)), 0)
})
