// Runs the real tracker pages, side service and settings page against the
// mock watch and phone in test/support.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  loadApp,
  reset,
  world,
  startApp,
  closeApp,
  flush,
  buttons,
  button,
  tap,
  texts,
  widgetsOf,
  settingsPage,
  settingsStorage,
  settingsText,
  nodes,
  assertDark,
} from './support/harness.mjs'

let entry
before(async () => {
  entry = await loadApp('nutrition')
})
beforeEach(() => reset())

const pageUrl = () => world.stack[world.stack.length - 1].url
const history = () => JSON.parse(world.settings.get('history') || '{}')
// The watch stores the log as a JSON string; the mock storage adds its own layer.
const storedDb = () => JSON.parse(JSON.parse(world.files.db))
// The coloured part of each progress bar: the 2nd and 4th filled rectangles.
const fills = () => world.widgets.filter((w) => w.type === 'FILL_RECT').filter((_, i) => i % 2 === 1)
const typeDigits = (digits) => [...digits].forEach((d) => tap(button(d)))

test('opens on an empty day with the default goals', () => {
  startApp(entry)
  assert.ok(texts().includes('0 / 2000'))
  assert.ok(texts().includes('0 / 120 g'))
  assert.deepEqual(
    fills().map((f) => f.visible),
    [false, false],
  )
  assert.equal(world.statusBarVisible, false)
})

test('adding calories with the keypad updates the total, the bar, storage and the phone', async () => {
  startApp(entry)
  tap(button('+ kcal'))
  assert.equal(pageUrl(), 'page/add')
  assert.ok(texts().includes('Add calories'))
  assert.ok(texts().includes('0 kcal'))

  typeDigits('350')
  assert.ok(texts().includes('350 kcal'))
  tap(button('OK'))

  assert.equal(pageUrl(), 'page/index')
  assert.ok(texts().includes('350 / 2000'))
  const [kcalFill, proteinFill] = fills()
  assert.equal(kcalFill.visible, true)
  assert.equal(kcalFill.params.w, Math.round((342 * 350) / 2000))
  assert.equal(proteinFill.visible, false)

  assert.deepEqual(storedDb().days['2026-11-16'], { kcal: 350, protein: 0, log: [[350, 0]] })
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [350, 0] })
})

test('adding protein goes to the protein total only', async () => {
  startApp(entry)
  tap(button('+ protein'))
  assert.ok(texts().includes('Add protein'))
  typeDigits('42')
  assert.ok(texts().includes('42 g'))
  tap(button('OK'))
  assert.ok(texts().includes('0 / 2000'))
  assert.ok(texts().includes('42 / 120 g'))
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [0, 42] })
})

test('keypad: delete, leading zeros and the four digit limit', () => {
  startApp(entry)
  tap(button('+ kcal'))
  const shown = () => texts()[1]

  tap(button('0'))
  assert.equal(shown(), '0 kcal', 'a leading zero is ignored')
  typeDigits('1205')
  assert.equal(shown(), '1205 kcal')
  tap(button('7'))
  assert.equal(shown(), '1205 kcal', 'a fifth digit is ignored')
  tap(button('Del'))
  tap(button('Del'))
  assert.equal(shown(), '12 kcal')
  tap(button('Del'))
  tap(button('Del'))
  tap(button('Del'))
  assert.equal(shown(), '0 kcal')
})

test('OK with nothing entered asks for an amount and stays on the keypad', () => {
  startApp(entry)
  tap(button('+ kcal'))
  tap(button('OK'))
  assert.equal(pageUrl(), 'page/add')
  assert.deepEqual(world.toasts, ['Enter an amount first'])
  assert.equal(world.files.db, undefined)
})

test('a quick-add button adds its calories and protein in one tap', async () => {
  startApp(entry)
  tap(button('Protein shake: 150 kcal, 30 g'))
  tap(button('Meal: 600 kcal, 35 g'))
  assert.ok(texts().includes('750 / 2000'))
  assert.ok(texts().includes('65 / 120 g'))
  assert.deepEqual(world.toasts, ['Added Protein shake', 'Added Meal'])
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [750, 65] })
})

test('undo takes back the last addition, and says so when there is none', async () => {
  startApp(entry)
  tap(button('Undo last'))
  assert.deepEqual(world.toasts, ['Nothing to undo today'])

  tap(button('Meal: 600 kcal, 35 g'))
  tap(button('+ kcal'))
  typeDigits('90')
  tap(button('OK'))
  assert.ok(texts().includes('690 / 2000'))

  tap(button('Undo last'))
  assert.ok(texts().includes('600 / 2000'))
  tap(button('Undo last'))
  assert.ok(texts().includes('0 / 2000'))
  assert.ok(texts().includes('0 / 120 g'))
  assert.deepEqual(world.toasts.slice(-2), ['Removed 90 kcal', 'Removed 600 kcal, 35 g'])
  assert.deepEqual(
    fills().map((f) => f.visible),
    [false, false],
  )
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [0, 0] })
})

test('going over the goal fills the bar and no further', () => {
  startApp(entry)
  for (let i = 0; i < 5; i++) tap(button('Meal: 600 kcal, 35 g'))
  assert.ok(texts().includes('3000 / 2000'))
  assert.equal(fills()[0].params.w, 342)
})

test('totals survive closing the app, and a new day starts from zero', async () => {
  startApp(entry)
  tap(button('Meal: 600 kcal, 35 g'))
  closeApp()

  startApp(entry)
  assert.ok(texts().includes('600 / 2000'))
  closeApp()

  world.now = new Date(2026, 10, 17, 8, 0, 0)
  startApp(entry)
  assert.ok(texts().includes('0 / 2000'))
  tap(button('Snack: 200 kcal, 5 g'))
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [600, 35], '2026-11-17': [200, 5] })
})

test('logging works with the phone away and syncs on the next open in range', async () => {
  world.phoneConnected = false
  startApp(entry)
  tap(button('Meal: 600 kcal, 35 g'))
  await flush()
  assert.ok(texts().includes('600 / 2000'))
  assert.deepEqual(history(), {})
  closeApp()

  world.phoneConnected = true
  startApp(entry)
  await flush()
  assert.deepEqual(history(), { '2026-11-16': [600, 35] })
})

test('the tracker still works if messaging fails outright', () => {
  world.messagingBroken = true
  assert.doesNotThrow(() => startApp(entry))
  tap(button('Meal: 600 kcal, 35 g'))
  assert.ok(texts().includes('600 / 2000'))
})

test('goals and presets set on the phone arrive when the tracker opens', async () => {
  world.settings.set('goalKcal', '2600')
  world.settings.set('goalProtein', '180')
  world.settings.set('presets', 'Egg = 70, 6')
  startApp(entry)
  await flush()
  assert.ok(texts().includes('0 / 2600'))
  assert.ok(texts().includes('0 / 180 g'))
  closeApp()

  // Remembered on the watch, and the new preset buttons are laid out.
  world.phoneConnected = false
  startApp(entry)
  assert.ok(texts().includes('0 / 2600'))
  tap(button('Egg: 70 kcal, 6 g'))
  assert.ok(texts().includes('70 / 2600'))
})

test('changing a goal on the phone updates an open tracker live', async () => {
  startApp(entry)
  tap(button('Meal: 600 kcal, 35 g'))
  await flush()

  const goalInputs = nodes(settingsPage(), 'TextInput').filter((n) => !n.props.multiline)
  assert.deepEqual(
    goalInputs.map((n) => n.props.value),
    ['2000', '120'],
  )
  goalInputs[0].props.onChange(' 1200 ')
  assert.ok(texts().includes('600 / 1200'))
  assert.equal(fills()[0].params.w, 171)
})

test('the settings page lists synced days newest first and flags bad preset lines', async () => {
  let shown = settingsText(settingsPage())
  assert.ok(shown.some((line) => line.startsWith('Nothing synced yet')))

  startApp(entry)
  tap(button('Meal: 600 kcal, 35 g'))
  closeApp()
  world.now = new Date(2026, 10, 17, 8, 0, 0)
  startApp(entry)
  tap(button('Snack: 200 kcal, 5 g'))
  await flush()

  settingsStorage.setItem('presets', 'Egg = 70, 6\nBroken line')
  shown = settingsText(settingsPage())
  const rows = shown.filter((line) => line.startsWith('2026-'))
  assert.deepEqual(rows, ['2026-11-17    200 kcal    5 g protein', '2026-11-16    600 kcal    35 g protein'])
  assert.ok(shown.includes('Line 2: expected "Label = kcal, protein"'))
})

test('every control sits within the screen width and buttons do not overlap', () => {
  startApp(entry)
  const check = () => {
    const all = world.widgets
    for (const w of all) {
      assert.ok(w.params.x >= 0 && w.params.x + w.params.w <= 390, `${w.type} "${w.params.text}" is off screen`)
    }
    const bs = buttons().map((b) => b.params)
    bs.forEach((a, i) =>
      bs.slice(i + 1).forEach((b) => {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
        assert.ok(apart, `"${a.text}" overlaps "${b.text}"`)
      }),
    )
    return all
  }
  check()
  tap(button('+ kcal'))
  const keypad = check()
  for (const w of keypad) assert.ok(w.params.y + w.params.h <= 450, 'the keypad fits on one screen')
  assert.equal(widgetsOf('BUTTON').length, 12)
})

test('the settings page is dark, down to every text and button', async () => {
  assertDark(settingsPage())
  settingsStorage.setItem('presets', 'Meal = 600, 35\nnonsense')
  startApp(entry)
  await flush()
  tap(button('Meal: 600 kcal, 35 g'))
  await flush()
  assertDark(settingsPage())
})
