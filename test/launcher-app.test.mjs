// Runs the real Launcher app (page, side service and settings page) against
// the mock watch and phone in test/support.
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
  tap,
  texts,
  settingsPage,
  settingsStorage,
  settingsText,
  nodes,
  assertDark,
  systemAppId,
} from './support/harness.mjs'
import { DEFAULT_CONFIG_TEXT } from '../shared/config.js'

let entry
before(async () => {
  entry = await loadApp('launcher')
})
beforeEach(() => reset())

// Each tile by what it shows: its icon name, or its label for text tiles.
const shown = (b) => (b.params.normal_src ? b.params.normal_src.replace(/^icons\/|\.png$/g, '') : b.params.text)
const tiles = () => buttons().map(shown)
const tile = (name) => {
  const found = buttons().find((b) => shown(b) === name)
  if (!found) throw new Error(`no tile "${name}"; have: ${tiles().join(', ')}`)
  return found
}

test('opens straight to nine icon tiles from the built-in defaults, full screen', async () => {
  world.phoneConnected = false
  startApp(entry)
  assert.deepEqual(tiles(), ['workout', 'hr', 'timer', 'stopwatch', 'alarm', 'weather', 'music', 'food', 'settings'])
  assert.equal(world.statusBarVisible, false)
  for (const b of buttons()) {
    assert.equal(b.params.text, '', 'icon tiles carry no text')
    assert.equal(b.params.press_src, b.params.normal_src.replace('.png', '_p.png'))
    assert.ok(b.params.x >= 0 && b.params.x + 114 <= 390 && b.params.y + 114 <= 450)
  }
  await flush()
  assert.equal(tiles().length, 9, 'a failed sync leaves the tiles alone')
  assert.deepEqual(texts(), ['Phone not reachable'])
})

test('tapping a built-in app tile launches it natively', () => {
  startApp(entry)
  tap(tile('timer'))
  assert.deepEqual(world.launched, [{ appId: systemAppId('COUNTDOWN'), native: true }])
  assert.deepEqual(world.toasts, [])
})

test('tapping a mini app tile launches it by id and page', () => {
  startApp(entry)
  tap(tile('food'))
  assert.deepEqual(world.launched, [{ appId: 68232, url: 'page/index' }])
})

test('screen: and name: targets launch the right thing', async () => {
  world.settings.set('config', 'Torch = screen:FlashLightScreen\nCalc = name:Calculator\nNotes = name:Notes:page/home')
  world.installedApps = { Calculator: 1051234, Notes: 1057777 }
  startApp(entry)
  await flush()
  tap(tile('Torch'))
  tap(tile('Calc'))
  tap(tile('Notes'))
  assert.deepEqual(world.launched, [
    { url: 'FlashLightScreen', native: true },
    { appId: 1051234 },
    { appId: 1057777, url: 'page/home' },
  ])
})

test('a tile whose app is missing shows a message instead of launching', async () => {
  reset({ missingSystemApps: ['ALEAX'] })
  world.settings.set('config', 'Alexa = alexa\nGone = name:Uninstalled')
  startApp(entry)
  await flush()
  tap(tile('alexa'))
  tap(tile('Gone'))
  assert.deepEqual(world.launched, [])
  assert.deepEqual(world.toasts, ["Can't open Alexa", "Can't open Gone"])
})

test('the config written on the phone replaces the tiles when the launcher opens', async () => {
  world.settings.set('config', 'Sleep = sleep\nCalc = app:99:page/index #112233')
  startApp(entry)
  assert.equal(tiles().length, 9, 'defaults until the phone answers')
  assert.deepEqual(texts(), ['Checking phone...'])
  await flush()
  assert.deepEqual(tiles(), ['sleep', 'Calc'])
  assert.equal(tile('Calc').params.normal_color, 0x112233)
  assert.deepEqual(texts(), ['Tiles synced'])
  tap(tile('sleep'))
  assert.deepEqual(world.launched, [{ appId: systemAppId('SLEEP'), native: true }])
})

test('more than nine tiles are all drawn, with a tail so the page scrolls clear of the corners', async () => {
  const names = ['workout', 'hr', 'timer', 'stopwatch', 'alarm', 'weather', 'music', 'settings', 'sleep', 'compass', 'calendar']
  world.settings.set('config', names.join('\n'))
  startApp(entry)
  await flush()
  assert.deepEqual(tiles(), names)
  const last = buttons()[10]
  assert.ok(last.params.y > 450 - 114, 'the fourth row starts below the first screen')
  const pageBottom = Math.max(...world.widgets.map((w) => w.params.y + Math.max(w.params.h, 0)))
  assert.ok(pageBottom >= last.params.y + 114 + 60)

  // Back to a short list: the tail goes away with the extra tiles.
  settingsStorage.setItem('config', 'timer\nalarm')
  assert.deepEqual(tiles(), ['timer', 'alarm'])
  assert.equal(world.widgets.length, 3)
  assert.equal(buttons()[0].params.y, 76, 'fewer tiles keep their place under the header')
})

test('the synced config is remembered on the watch when the phone is away', async () => {
  world.settings.set('config', 'Sleep = sleep')
  startApp(entry)
  await flush()
  closeApp()

  world.phoneConnected = false
  startApp(entry)
  assert.deepEqual(tiles(), ['sleep'], 'shown immediately, before any sync')
  await flush()
  assert.deepEqual(tiles(), ['sleep'])
})

test('editing the config on the phone updates an open launcher live', async () => {
  startApp(entry)
  await flush()
  const [input] = nodes(settingsPage(), 'TextInput')
  assert.equal(input.props.value, DEFAULT_CONFIG_TEXT)
  assert.equal(input.props.multiline, true)

  input.props.onChange('PAI = pai\nCompass = compass')
  assert.deepEqual(tiles(), ['star', 'compass'])
  assert.equal(world.widgets.length, 3, 'old tiles were removed, not painted over')
})

test('clearing the config on the phone brings the defaults back', async () => {
  world.settings.set('config', 'Sleep = sleep')
  startApp(entry)
  await flush()
  settingsStorage.setItem('config', '   ')
  assert.equal(tiles().length, 9)
  assert.equal(tiles()[0], 'workout')
})

test('a config with no usable lines shows a hint rather than a blank screen', async () => {
  world.settings.set('config', 'Nope = notanapp')
  startApp(entry)
  await flush()
  assert.deepEqual(tiles(), [])
  assert.deepEqual(texts(), ['No apps configured'])
})

test('the launcher still works if messaging fails outright', () => {
  world.messagingBroken = true
  assert.doesNotThrow(() => startApp(entry))
  assert.equal(tiles().length, 9)
  assert.deepEqual(texts(), ['Sync unavailable'])
  tap(tile('alarm'))
  assert.equal(world.launched.length, 1)
})

test('mini apps show their label unless given an @icon, and a wrong icon name falls back to the label', async () => {
  world.settings.set('config', 'Calc = app:99:page/index\nNotes = app:98:page/index @note\nOops = app:97 @nosuchicon')
  startApp(entry)
  await flush()
  assert.deepEqual(tiles(), ['Calc', 'note', 'Oops'])
  assert.ok(settingsText(settingsPage()).includes('Line 3: unknown icon "nosuchicon", showing the label instead'))
})

test('the settings page previews the tiles and flags bad lines', () => {
  world.settings.set('config', 'Sleep = sleep\nOops = notanapp\nCalc = app:99:page/index')
  const lines = settingsText(settingsPage())
  assert.ok(lines.includes('1. Sleep  →  built-in sleep  (icon sleep)'))
  assert.ok(lines.includes('2. Calc  →  app 99, page page/index  (text label)'))
  assert.ok(lines.includes('Line 2: unknown app "notanapp"'))
  assert.ok(lines.some((line) => line.includes('stopwatch') && line.includes('findphone')), 'lists the built-in names')
  assert.ok(lines.some((line) => line.includes('calculator') && line.includes('torch')), 'lists the icons')
})

test('the reset button restores the default tiles', async () => {
  world.settings.set('config', 'Sleep = sleep')
  startApp(entry)
  await flush()
  const [resetButton] = nodes(settingsPage(), 'Button')
  resetButton.props.onClick()
  assert.equal(world.settings.get('config'), DEFAULT_CONFIG_TEXT)
  assert.equal(tiles().length, 9)
})

test('the settings page is dark, down to every text and button', () => {
  assertDark(settingsPage())
  settingsStorage.setItem('config', 'timer\nnot a line at all =\nCalc = app:1:page/index @nosuchicon')
  assertDark(settingsPage())
})
