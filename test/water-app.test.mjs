// Runs the real Water page, reminder service, side service and settings page
// against the mock watch and phone in test/support.
import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  loadApp,
  reset,
  world,
  startApp,
  closeApp,
  flush,
  buttons,
  widgetsOf,
  tap,
  texts,
  fireAlarm,
  settingsPage,
  settingsText,
  assertDark,
  nodes,
  runService,
} from './support/harness.mjs'

import { VIBRATOR_SCENE_STRONG_REMINDER as STRONG } from './support/zos/sensor.js'

let entry
before(async () => {
  entry = await loadApp('water')
})
beforeEach(() => reset())
// The page keeps a timer running; closing it stops the timer.
afterEach(() => closeApp())

const setTime = (h, m = 0, day = 18) => {
  world.now = new Date(2026, 10, day, h, m, 0)
}
const hhmm = (alarm) => {
  const d = new Date(alarm.time * 1000)
  return `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const firstAlarm = () => hhmm(world.alarms.reduce((a, b) => (b.time < a.time ? b : a)))

const drop = () => buttons()[0]
const water = () => widgetsOf('FILL_RECT')[0]
const level = () => (water() ? water().params.h : 0)

async function open() {
  startApp(entry)
  await flush()
}

// Slept 22:30 to 07:00 by the watch's sleep data.
const SLEPT = { startTime: 22 * 60 + 30, endTime: 7 * 60, totalTime: 510 }
const asleep = () => {
  world.sleep = { ...SLEPT, asleep: true }
}
const awake = () => {
  world.sleep = { ...SLEPT, asleep: false }
}

test('the screen has no words, just the drop, full the first time', async () => {
  awake()
  setTime(8, 0)
  await open()
  assert.equal(world.statusBarVisible, false)
  assert.deepEqual(texts(), [])
  assert.equal(buttons().length, 1)
  assert.equal(drop().params.normal_src, 'drop.png')
  assert.equal(drop().params.text, '')
  assert.equal(level(), 450)
  assert.equal(firstAlarm(), '18 11:00')
  assert.ok(world.alarms.every((a) => a.url === 'app-service/remind' && a.store === true))
})

test('the level drains, the drop turns red when it runs dry, and a tap fills it', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(level(), 450)
  assert.equal(firstAlarm(), '18 12:00')

  setTime(10, 30)
  world.page.render()
  assert.equal(level(), 225)
  assert.equal(water().params.y, 225)
  assert.equal(drop().params.normal_src, 'drop.png')

  setTime(12, 0)
  world.page.render()
  assert.equal(level(), 0)
  assert.equal(drop().params.normal_src, 'drop_red.png')

  tap(drop())
  assert.equal(level(), 450)
  assert.equal(drop().params.normal_src, 'drop.png')
  assert.equal(firstAlarm(), '18 15:00')
  // Old alarms are cancelled, not piled up.
  assert.equal(world.alarms.filter((a) => hhmm(a) === '18 12:00').length, 0)
})

test('the drop does not move', async () => {
  setTime(9, 0)
  await open()
  const where = () => `${drop().params.x},${drop().params.y}`
  const before = where()
  setTime(13, 0)
  world.page.render()
  assert.equal(where(), before)
})

test('the level stands still while you sleep', async () => {
  setTime(21, 0, 17)
  await open()
  tap(drop())
  closeApp()
  awake()
  setTime(7, 30, 18)
  await open()
  // 1 h 30 before bed and 30 min since waking: 2 of 3 hours gone.
  assert.equal(level(), 150)
  assert.equal(firstAlarm(), '18 08:30')
})

test('reminders keep quiet in the night and come the wait after, counted awake', async () => {
  setTime(21, 0, 17)
  await open()
  tap(drop())
  closeApp()

  asleep()
  assert.equal(hhmm(fireAlarm()), '18 00:00')
  // Every half hour it looks whether you are awake, and stays quiet.
  let fired = '18 00:00'
  while (fired !== '18 06:30') fired = hhmm(fireAlarm())
  assert.equal(world.vibrations.length, 0)

  awake()
  assert.equal(hhmm(fireAlarm()), '18 07:00')
  assert.equal(world.vibrations.length, 0)
  assert.equal(firstAlarm(), '18 08:30')
  fireAlarm()
  assert.equal(world.vibrations.length, 1)
  assert.equal(firstAlarm(), '18 11:30')
})

test('the buzz is the motor, four strong pulses, with no notification', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  closeApp()
  assert.equal(hhmm(fireAlarm()), '18 12:00')
  assert.deepEqual(world.vibrations, [STRONG])
  assert.equal(world.notifications.length, 0)
  assert.equal(firstAlarm(), '18 15:00')
})

test('time with the watch off the wrist does not count', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  closeApp()
  // Taken off at 10:00: the system wakes the service.
  setTime(10, 0)
  world.worn = false
  runService('app-service/remind', 'event:os.health.wear_status')
  assert.equal(firstAlarm(), '18 10:30')
  // The checks while it is off stay quiet.
  while (hhmm(fireAlarm()) !== '18 13:00');
  assert.equal(world.vibrations.length, 0)
  // Put back on at 13:00: the 3 hours off do not count, the buzz is at 15:00.
  world.worn = true
  runService('app-service/remind', 'event:os.health.wear_status')
  assert.equal(firstAlarm(), '18 15:00')
  await open()
  assert.equal(level(), 300)
})

test('opening the app counts as the watch being back on', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  closeApp()
  setTime(10, 0)
  world.worn = false
  runService('app-service/remind', 'event:os.health.wear_status')
  // The service missed it going back on; at 12:00 the app is opened.
  world.worn = true
  setTime(12, 0)
  await open()
  assert.equal(level(), 300)
  assert.equal(firstAlarm(), '18 14:00')
})

test('without sleep data the wait counts from the last tap', async () => {
  world.sleepBroken = true
  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(firstAlarm(), '18 12:00')
  closeApp()
  fireAlarm()
  assert.equal(world.vibrations.length, 1)
})

test('reminders go on for days without the app being opened', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  const days = new Set()
  for (let i = 0; i < 25; i++) days.add(hhmm(fireAlarm()).split(' ')[0])
  assert.deepEqual([...days], ['18', '19', '20', '21'])
  assert.equal(world.vibrations.length, 25)
})

test('a leftover reminder stays quiet if the drop was tapped since', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  // A tap stored without the alarms being moved (as if cancelling failed).
  world.alarms.push({ id: 999, url: 'app-service/remind', time: Math.floor(new Date(2026, 10, 18, 11, 0).getTime() / 1000) })
  world.files.last = JSON.stringify(new Date(2026, 10, 18, 10, 30).getTime())
  fireAlarm()
  assert.equal(world.vibrations.length, 0)
})

test('the page still works when reminders cannot be set', async () => {
  world.alarmsBroken = true
  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(level(), 450)
})

// --- the phone ---

const press = (sign) => nodes(settingsPage(), 'Button').find((b) => b.props.label === sign).props.onClick()

test('the settings page is dark, uses no text boxes and has only the wait', () => {
  const tree = settingsPage()
  assertDark(tree)
  assert.equal(nodes(tree, 'TextInput').length, 0)
  assert.equal(nodes(tree, 'Button').length, 2)
  assert.ok(settingsText(tree).includes('3 h'))
})

test('the wait set on the phone reaches the watch', async () => {
  press('−') // 2 h 45 min
  assert.ok(settingsText(settingsPage()).includes('2 h 45 min'))

  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(firstAlarm(), '18 11:45')

  // Changed while the app is open: pushed and applied at once.
  press('−') // 2 h 30 min
  assert.equal(firstAlarm(), '18 11:30')

  closeApp()
  world.phoneConnected = false
  await open()
  assert.equal(firstAlarm(), '18 11:30')
})
