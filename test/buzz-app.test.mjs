// Runs the real Buzz page and its app service against the mock watch.
import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { loadApp, reset, world, startApp, closeApp, flush, button, buttons, tap, texts, fireAlarm } from './support/harness.mjs'
import { VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_STRONG_REMINDER } from './support/zos/sensor.js'

let entry
before(async () => {
  entry = await loadApp('buzz')
})
beforeEach(() => reset())
afterEach(() => closeApp())

async function open() {
  world.now = new Date(2026, 10, 19, 14, 5, 0)
  startApp(entry)
  await flush()
}
const status = () => texts()[0]

test('everything fits on one screen', async () => {
  await open()
  assert.equal(buttons().length, 14)
  for (const w of world.widgets) {
    assert.ok(w.params.y >= 0 && w.params.y + w.params.h <= 450, `${w.params.text} is off the screen`)
    assert.ok(w.params.x >= 0 && w.params.x + w.params.w <= 390, `${w.params.text} is off the screen`)
  }
  assert.equal(status(), 'Tap one to feel it')
})

test('the motor buttons start the motor in their pattern', async () => {
  await open()
  tap(button('Strong'))
  tap(button('4 times'))
  assert.deepEqual(world.vibrations, [VIBRATOR_SCENE_SHORT_STRONG, VIBRATOR_SCENE_STRONG_REMINDER])
  assert.equal(status(), 'Motor: 4 times')
})

test('the notification buttons send one with that vibration', async () => {
  await open()
  tap(button('Gentle'))
  tap(button('No. 6'))
  assert.deepEqual(
    world.notifications.map((n) => n.vibrate),
    [4, 6],
  )
  assert.equal(world.notifications[0].content, 'Gentle, sent right away.')
  assert.equal(status(), 'Sent: No. 6')
})

test('In 1 min buzzes 4 times from an alarm, with no notification', async () => {
  await open()
  tap(button('In 1 min'))
  assert.equal(status(), '4 times at about 14:06')
  closeApp()
  const alarm = fireAlarm()
  assert.equal(alarm.url, 'app-service/ping')
  assert.equal(alarm.store, true)
  assert.equal(alarm.time, alarm.date)
  assert.equal(alarm.time, Math.floor(new Date(2026, 10, 19, 14, 6, 0).getTime() / 1000))
  assert.deepEqual(world.vibrations, [VIBRATOR_SCENE_STRONG_REMINDER])
  assert.equal(world.notifications.length, 0)
})

test('a failure shows at the top', async () => {
  world.alarmsBroken = true
  await open()
  tap(button('In 1 min'))
  assert.equal(status(), 'The alarm was not set')
})
