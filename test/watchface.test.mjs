// Runs the real watch face against the mock watch in test/support.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { loadApp, reset, world, startWatchface, buttons, tap, widgetsOf } from './support/harness.mjs'
import { FACE } from '../apps/watchface/watchface/layout.js'

before(async () => {
  await loadApp('watchface')
})
beforeEach(() => reset())

test('shows the time as hours over minutes, with weekday, day, battery, steps and heart rate', () => {
  startWatchface()
  const [time] = widgetsOf('IMG_TIME')
  assert.equal(time.params.hour_array.length, 10)
  assert.equal(time.params.minute_array.length, 10)
  assert.notDeepEqual(time.params.hour_array, time.params.minute_array, 'minutes use the accent digits')
  assert.equal(time.params.hour_startX, time.params.minute_startX)
  assert.ok(time.params.minute_startY >= time.params.hour_startY + FACE.big.h)

  assert.equal(widgetsOf('IMG_WEEK')[0].params.week_en.length, 7)
  assert.equal(widgetsOf('IMG_DATE')[0].params.day_en_array.length, 10)
  assert.equal(widgetsOf('ARC_PROGRESS')[0].params.type, 'BATTERY')
  assert.deepEqual(
    widgetsOf('TEXT_IMG').map((w) => w.params.type),
    ['BATTERY', 'STEP', 'HEART'],
  )
  assert.equal(world.widgets[0].type, 'IMG', 'the background is drawn first, under everything')
})

test('the one button sits in the bottom right corner and opens the Launcher app', () => {
  startWatchface()
  assert.equal(buttons().length, 1)
  const [launcher] = buttons()
  assert.equal(launcher.params.x, FACE.launch.x)
  assert.equal(launcher.params.y, FACE.launch.y)
  assert.equal(launcher.params.normal_src, 'face/launch.png')
  assert.equal(launcher.params.press_src, 'face/launch_p.png')
  tap(launcher)
  assert.deepEqual(world.launched, [{ appId: 68231, url: 'page/index' }])
})

test('the always-on display shows only the time', () => {
  world.scene = 'AOD'
  startWatchface()
  assert.deepEqual(
    world.widgets.map((w) => w.type),
    ['IMG_TIME'],
  )
})

test('every image the watch face refers to exists', async () => {
  const { existsSync } = await import('node:fs')
  startWatchface()
  const sources = world.widgets.flatMap((w) =>
    Object.values(w.params).flatMap((v) => (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x.endsWith('.png'))),
  )
  assert.ok(sources.length > 40)
  for (const src of sources) {
    assert.ok(existsSync(new URL('../apps/watchface/assets/default.s/' + src, import.meta.url)), src)
  }
})
