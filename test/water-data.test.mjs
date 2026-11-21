// The Water app's pure logic: the wait, the records, time asleep or off the
// wrist, and when to look and buzz.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULTS,
  MAX_ALARMS,
  normaliseSettings,
  normaliseRecord,
  normaliseOffs,
  stepGap,
  gapLabel,
  clockOffset,
  clock,
  sleepSpan,
  noteWear,
  isOff,
  covered,
  counted,
  isDue,
  levelOf,
  checkTimes,
} from '../apps/water/lib/water.js'

const MIN = 60000
const HOUR = 60 * MIN
// Helsinki in winter: the wall clock is two hours ahead of UTC.
const OFFSET = 2 * HOUR
// A wall-clock time in that zone, as UTC milliseconds.
const at = (h, m = 0, day = 18) => Date.UTC(2026, 10, day, h, m) - OFFSET
const GAP = DEFAULTS.gap // 3 hours
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
  assert.equal(stepGap({ gap: GAP }, 1), 195)
  assert.equal(stepGap({ gap: GAP }, -1), 165)
  assert.equal(stepGap({ gap: 30 }, -1), 30)
  assert.equal(stepGap({ gap: 360 }, 1), 360)
  assert.equal(gapLabel(180), '3 h')
  assert.equal(gapLabel(165), '2 h 45 min')
  assert.equal(gapLabel(45), '0 h 45 min')
})

test('a missing or damaged record reads as never tapped', () => {
  assert.deepEqual(normaliseRecord(null), { tap: 0, floor: 0, gap: 180 })
  assert.deepEqual(normaliseRecord('junk'), { tap: 0, floor: 0, gap: 180 })
  assert.deepEqual(normaliseRecord({ tap: -5, floor: 99 }), { tap: 0, floor: 0, gap: 180 })
  assert.deepEqual(normaliseRecord({ tap: at(9), floor: 'x', gap: 165 }), { tap: at(9), floor: 0, gap: 165 })
  assert.deepEqual(normaliseOffs(null), [])
  assert.deepEqual(normaliseOffs([[at(10), 0], 'x', [at(8), at(9)], [at(9), at(8)]]), [
    [at(8), at(9)],
    [at(10), 0],
  ])
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

test('the wear record opens a span when the watch comes off and closes it when it is back', () => {
  const none = []
  assert.equal(noteWear(none, true, at(9), at(8)), none, 'worn: nothing to change')
  assert.equal(noteWear(none, null, at(9), at(8)), none, 'unsure: nothing to change')
  const off = noteWear(none, false, at(10), at(8))
  assert.deepEqual(off, [[at(10), 0]])
  assert.equal(isOff(off), true)
  assert.equal(noteWear(off, false, at(11), at(8)), off, 'still off: nothing to change')
  assert.equal(noteWear(off, null, at(11), at(8)), off)
  const back = noteWear(off, true, at(12), at(8))
  assert.deepEqual(back, [[at(10), at(12)]])
  assert.equal(isOff(back), false)
  // Spans over before the tap go when the record next changes.
  assert.deepEqual(noteWear(back, false, at(15), at(13)), [[at(15), 0]])
})

test('time asleep or off the wrist does not count, overlaps only once', () => {
  assert.equal(covered([[at(10), at(11)], [at(10, 30), at(12)]], at(9), at(13)), 2 * HOUR)
  assert.equal(covered([[at(8), 0]], at(9), at(10)), HOUR, 'a span still going runs to the end')
  const night = { start: at(23, 0, 17), end: at(7, 0) }
  // Tapped 22:00, slept 23:00 to 07:00: at 08:00 two hours count.
  assert.equal(counted({ tap: at(22, 0, 17), night, now: at(8) }), 2 * HOUR)
  // Off the wrist 08:30 to 09:30 as well: at 10:00 still three.
  assert.equal(counted({ tap: at(22, 0, 17), night, offs: [[at(8, 30), at(9, 30)]], now: at(10) }), 3 * HOUR)
  // Still off since 09:00: stands still at three.
  assert.equal(counted({ tap: at(22, 0, 17), night, offs: [[at(9), 0]], now: at(11) }), 3 * HOUR)
  // Never less than the floor; never tapped is forever.
  assert.equal(counted({ tap: at(9), floor: 2 * HOUR, now: at(10) }), 2 * HOUR)
  assert.equal(counted({ tap: 0, now: at(10) }), Infinity)
})

test('the page shows empty exactly when the service would buzz', () => {
  assert.equal(levelOf(0, GAP), 1)
  assert.equal(levelOf(90 * MIN, GAP), 0.5)
  assert.equal(levelOf(60 * MIN, 120), 0.5)
  for (const spent of [0, 90 * MIN, 179 * MIN - 1, 179 * MIN, 180 * MIN, 500 * MIN, Infinity]) {
    assert.equal(levelOf(spent, GAP) === 0, isDue(spent, GAP), `at ${spent / MIN} min`)
  }
})

test('the next look is when the wait runs out, then every 5 minutes for an hour', () => {
  const times = checkTimes({ spent: HOUR, gap: GAP, paused: false, now: at(9) })
  assert.equal(times.length, MAX_ALARMS)
  assert.deepEqual(local(times).slice(0, 3), ['18 11:00', '18 11:05', '18 11:10'])
  assert.deepEqual(local(times).slice(12, 15), ['18 12:00', '18 12:30', '18 13:00'])
  // Already run out: the next buzz in 5 minutes.
  assert.deepEqual(local(checkTimes({ spent: 4 * HOUR, gap: GAP, paused: false, now: at(9), max: 2 })), [
    '18 09:05',
    '18 09:10',
  ])
  // Paused: every half hour.
  assert.deepEqual(local(checkTimes({ spent: 4 * HOUR, gap: GAP, paused: true, now: at(1), max: 3 })), [
    '18 01:30',
    '18 02:00',
    '18 02:30',
  ])
})
