import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  dayKey,
  normaliseDb,
  totals,
  addEntry,
  undoLast,
  prune,
  summary,
  barWidth,
  MAX_AMOUNT,
} from '../apps/nutrition/lib/log.js'
import {
  parsePresets,
  presetsText,
  phoneSettings,
  normaliseSettings,
  mergeHistory,
  historyRows,
  DEFAULT_GOALS,
  DEFAULT_PRESETS_TEXT,
  DEFAULT_SETTINGS,
  MAX_PRESETS,
  HISTORY_DAYS,
} from '../apps/nutrition/lib/settings.js'

const DAY = '2026-11-16'
const empty = () => normaliseDb(null)

// --- the log on the watch ---

test('dayKey pads month and day', () => {
  assert.equal(dayKey(2026, 1, 5), '2026-01-05')
  assert.equal(dayKey(2026, 11, 16), '2026-11-16')
})

test('additions accumulate into the day totals', () => {
  const db = empty()
  assert.deepEqual(totals(db, DAY), { kcal: 0, protein: 0 })
  addEntry(db, DAY, 350, 0)
  addEntry(db, DAY, 0, 30)
  addEntry(db, DAY, 150, 12)
  assert.deepEqual(totals(db, DAY), { kcal: 500, protein: 42 })
  assert.deepEqual(totals(db, '2026-11-17'), { kcal: 0, protein: 0 })
})

test('an addition of nothing is refused and bad amounts are cleaned up', () => {
  const db = empty()
  assert.equal(addEntry(db, DAY, 0, 0), null)
  assert.equal(addEntry(db, DAY, -5, 'abc'), null)
  assert.deepEqual(db.days, {})
  assert.deepEqual(addEntry(db, DAY, 99.6, 1e9), [100, MAX_AMOUNT])
})

test('undo removes the most recent addition, one at a time', () => {
  const db = empty()
  addEntry(db, DAY, 350, 0)
  addEntry(db, DAY, 150, 30)
  assert.deepEqual(undoLast(db, DAY), [150, 30])
  assert.deepEqual(totals(db, DAY), { kcal: 350, protein: 0 })
  assert.deepEqual(undoLast(db, DAY), [350, 0])
  assert.deepEqual(totals(db, DAY), { kcal: 0, protein: 0 })
  assert.equal(undoLast(db, DAY), null)
  assert.equal(undoLast(db, '2026-01-01'), null)
})

test('prune keeps only the most recent days', () => {
  const db = empty()
  for (let d = 1; d <= 9; d++) addEntry(db, dayKey(2026, 11, d), 100, 1)
  addEntry(db, '2025-12-31', 100, 1)
  prune(db, 3)
  assert.deepEqual(Object.keys(db.days).sort(), ['2026-11-07', '2026-11-08', '2026-11-09'])
})

test('summary is the per-day totals without the individual entries', () => {
  const db = empty()
  addEntry(db, DAY, 350, 10)
  addEntry(db, DAY, 150, 5)
  addEntry(db, '2026-11-15', 2000, 140)
  assert.deepEqual(summary(db), { [DAY]: [500, 15], '2026-11-15': [2000, 140] })
})

test('a log survives a round trip through storage', () => {
  const db = empty()
  addEntry(db, DAY, 350, 10)
  const restored = normaliseDb(JSON.parse(JSON.stringify(db)))
  assert.deepEqual(restored, db)
  assert.deepEqual(undoLast(restored, DAY), [350, 10])
})

test('corrupt stored data becomes an empty or cleaned-up log, never a crash', () => {
  for (const raw of [null, undefined, 'x', 7, [], {}, { days: null }, { days: 'x' }, { days: [] }]) {
    assert.deepEqual(normaliseDb(raw), { days: {} })
  }
  const messy = normaliseDb({
    days: {
      'not-a-date': { kcal: 5 },
      '2026-11-16': { kcal: '300', protein: null, log: [[300, 0], 'junk', [1]] },
      '2026-11-15': 'junk',
    },
  })
  assert.deepEqual(messy, { days: { '2026-11-16': { kcal: 300, protein: 0, log: [[300, 0], [1, 0]] } } })
})

test('barWidth scales with progress, caps at full and stays drawable', () => {
  assert.equal(barWidth(0, 2000, 342, 12), 0)
  assert.equal(barWidth(1000, 2000, 342, 12), 171)
  assert.equal(barWidth(5000, 2000, 342, 12), 342)
  assert.equal(barWidth(1, 2000, 342, 12), 12)
  assert.equal(barWidth(100, 0, 342, 12), 0)
})

// --- presets, goals and history on the phone ---

test('presets parse as "Label = kcal, protein" with flexible separators', () => {
  const { presets, errors } = parsePresets('Shake = 150, 30\nRice=200 4\nOil = 120\nBar = 0/20\n# note\n')
  assert.deepEqual(errors, [])
  assert.deepEqual(presets, [
    { label: 'Shake', kcal: 150, protein: 30 },
    { label: 'Rice', kcal: 200, protein: 4 },
    { label: 'Oil', kcal: 120, protein: 0 },
    { label: 'Bar', kcal: 0, protein: 20 },
  ])
})

test('bad preset lines are reported and skipped', () => {
  const { presets, errors } = parsePresets('Shake\n= 100, 5\nX = lots\nY = 1, 2, 3\nZ = 0, 0\nGood = 10\nBig = 10000')
  assert.deepEqual(presets, [{ label: 'Good', kcal: 10, protein: 0 }])
  assert.deepEqual(
    errors.map((e) => e.line),
    [1, 2, 3, 4, 5, 7],
  )
})

test('only the first six presets are kept', () => {
  const text = Array.from({ length: 8 }, (_, i) => `P${i} = 100, 1`).join('\n')
  const { presets, errors } = parsePresets(text)
  assert.equal(presets.length, MAX_PRESETS)
  assert.deepEqual(
    errors.map((e) => e.line),
    [7, 8],
  )
})

test('phone settings fall back to defaults for anything missing or invalid', () => {
  assert.deepEqual(DEFAULT_SETTINGS.goals, DEFAULT_GOALS)
  assert.equal(DEFAULT_SETTINGS.presets.length, 3)
  assert.equal(presetsText(' '), DEFAULT_PRESETS_TEXT)

  const stored = { goalKcal: '2600', goalProtein: 'lots', presets: 'Egg = 70, 6' }
  assert.deepEqual(phoneSettings((key) => stored[key]), {
    goals: { kcal: 2600, protein: DEFAULT_GOALS.protein },
    presets: [{ label: 'Egg', kcal: 70, protein: 6 }],
  })
  assert.equal(phoneSettings(() => '0').goals.kcal, DEFAULT_GOALS.kcal, 'a zero goal is ignored')
})

test('settings received by the watch are validated', () => {
  assert.deepEqual(normaliseSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(normaliseSettings({ goals: { kcal: 1800, protein: -1 }, presets: [{ label: 'A', kcal: 1 }, null, {}] }), {
    goals: { kcal: 1800, protein: DEFAULT_GOALS.protein },
    presets: [{ label: 'A', kcal: 1, protein: 0 }],
  })
  const same = normaliseSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))
  assert.deepEqual(same, DEFAULT_SETTINGS)
})

test('history merge: the watch wins for days it reports, older days are kept', () => {
  let stored = mergeHistory(undefined, { '2026-11-14': [1800, 100], '2026-11-15': [2000, 120] })
  stored = mergeHistory(stored, { '2026-11-15': [2100, 130], '2026-11-16': [500, 15] })
  assert.deepEqual(historyRows(stored), [
    { day: '2026-11-16', kcal: 500, protein: 15 },
    { day: '2026-11-15', kcal: 2100, protein: 130 },
    { day: '2026-11-14', kcal: 1800, protein: 100 },
  ])
})

test('history merge ignores junk and caps the number of days kept', () => {
  assert.deepEqual(historyRows(mergeHistory('not json', { bad: [1, 2], '2026-11-16': 'x' })), [])
  assert.deepEqual(historyRows('[1,2]'), [])

  const days = {}
  const start = Date.UTC(2026, 0, 1)
  for (let i = 0; i < HISTORY_DAYS + 20; i++) {
    days[new Date(start + i * 86400000).toISOString().slice(0, 10)] = [i, i]
  }
  const rows = historyRows(mergeHistory(undefined, days))
  assert.equal(rows.length, HISTORY_DAYS)
  assert.equal(rows[0].kcal, HISTORY_DAYS + 19, 'newest first, oldest dropped')
})
