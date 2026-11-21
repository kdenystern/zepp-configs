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
const buzzes = () => world.vibrations.length

async function open() {
  startApp(entry)
  await flush()
}
async function reopen() {
  closeApp()
  await open()
}
// The system wakes the service: the watch moved, came off or went back on.
const wearEvent = () => runService('app-service/remind', 'event:os.health.wear_status')
const sleepEvent = () => runService('app-service/remind', 'event:os.health.sleep_status')

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
  assert.ok(world.alarms.every((a) => hhmm(a) >= '18 15:00'))
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
  assert.equal(buzzes(), 0)

  awake()
  assert.equal(hhmm(fireAlarm()), '18 07:00')
  assert.equal(buzzes(), 0)
  assert.equal(firstAlarm(), '18 08:30')
  fireAlarm()
  assert.equal(buzzes(), 1)
})

test('the buzz is the motor, four strong pulses, with no notification', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  closeApp()
  assert.equal(hhmm(fireAlarm()), '18 12:00')
  assert.deepEqual(world.vibrations, [STRONG])
  assert.equal(world.notifications.length, 0)
})

test('once run dry it buzzes every 5 minutes until the drop is tapped, and the tap stops it', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  assert.deepEqual([fireAlarm(), fireAlarm(), fireAlarm()].map(hhmm), ['18 12:00', '18 12:05', '18 12:10'])
  assert.equal(buzzes(), 3)
  assert.equal(world.buzzing, true)

  setTime(12, 12)
  await open()
  assert.equal(level(), 0)
  tap(drop())
  assert.equal(world.buzzing, false, 'the tap stops the motor')
  assert.equal(level(), 450)
  assert.equal(firstAlarm(), '18 15:12')
  closeApp()
  // Nothing that wakes the service buzzes until the wait has run out again.
  setTime(12, 20)
  wearEvent()
  sleepEvent()
  assert.equal(buzzes(), 3)
  assert.equal(hhmm(fireAlarm()), '18 15:12')
  assert.equal(buzzes(), 4)
})

test('left alone it keeps reminding every 5 minutes', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  for (let i = 0; i < 100; i++) fireAlarm()
  assert.equal(buzzes(), 100)
  assert.equal(firstAlarm(), '18 20:20')
})

test('time with the watch off the wrist does not count', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  closeApp()
  // Taken off at 10:00: the system wakes the service.
  setTime(10, 0)
  world.worn = false
  wearEvent()
  assert.equal(firstAlarm(), '18 10:30')
  // The checks while it is off stay quiet.
  while (hhmm(fireAlarm()) !== '18 13:00');
  assert.equal(buzzes(), 0)
  // Put back on at 13:00: the 3 hours off do not count, the buzz is at 15:00.
  world.worn = true
  wearEvent()
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
  wearEvent()
  // The service missed it going back on; at 12:00 the app is opened.
  world.worn = true
  setTime(12, 0)
  await open()
  assert.equal(level(), 300)
  assert.equal(firstAlarm(), '18 14:00')
})

// What the user saw on 2026-11-20: off the wrist to charge, then an hour
// after putting it back on it buzzed while the app showed full, and tapping
// did not stop it.
test('charging, then back on with the screen on: the page and the reminders agree', async () => {
  setTime(8, 0)
  await open()
  tap(drop())
  closeApp()
  setTime(9, 0)
  world.worn = false
  wearEvent()
  // On the charger until 11:30, put on while looking at it: the service
  // cannot write with the screen on, and the page is opened.
  setTime(11, 30)
  world.worn = true
  world.screenOn = true
  wearEvent()
  assert.equal(firstAlarm(), '18 13:30', 'due 13:30 whether or not the record could be written')
  await open()
  assert.equal(level(), 300, 'two of the three hours left')
  assert.equal(firstAlarm(), '18 13:30')
  closeApp()
  // The watch moves on the wrist, screen on and off: still due 13:30.
  setTime(12, 0)
  world.worn = 'moving'
  wearEvent()
  world.screenOn = false
  setTime(12, 10)
  world.worn = true
  wearEvent()
  assert.equal(buzzes(), 0)
  assert.equal(firstAlarm(), '18 13:30')
  assert.equal(hhmm(fireAlarm()), '18 13:30')
  assert.equal(buzzes(), 1)
  // The buzz comes with an empty glass, and a tap ends it for good.
  setTime(13, 32)
  world.screenOn = true
  await open()
  assert.equal(level(), 0)
  tap(drop())
  closeApp()
  for (const m of [35, 40, 50]) {
    setTime(13, m)
    world.worn = m === 40 ? 'moving' : true
    wearEvent()
  }
  assert.equal(buzzes(), 1)
  assert.equal(firstAlarm(), '18 16:32')
})

test('the watch moving on the wrist leaves the reminders alone', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  const ids = world.alarms.map((a) => a.id).join()
  setTime(10, 0)
  world.worn = 'moving'
  wearEvent()
  world.worn = true
  wearEvent()
  assert.equal(world.alarms.map((a) => a.id).join(), ids)
})

test('before the app is first opened nothing buzzes', () => {
  setTime(9, 0)
  world.worn = false
  wearEvent()
  world.worn = true
  wearEvent()
  sleepEvent()
  assert.equal(buzzes(), 0)
  assert.equal(world.alarms.length, 0)
})

test('a damaged record keeps it quiet and the reminders where they were', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  world.dataFiles['water.json'] = '{"tap": 17'
  const left = world.alarms.length
  fireAlarm()
  assert.equal(buzzes(), 0)
  assert.equal(world.alarms.length, left - 1)
  // Opening the app starts it afresh, full.
  await open()
  assert.equal(level(), 450)
})

test('a leftover reminder stays quiet if the drop was tapped since', async () => {
  setTime(9, 0)
  await open()
  closeApp()
  // A tap stored without the alarms being moved (as if cancelling failed).
  world.alarms.push({ id: 999, url: 'app-service/remind', time: Math.floor(new Date(2026, 10, 18, 11, 0).getTime() / 1000) })
  const record = JSON.parse(world.dataFiles['water.json'])
  world.dataFiles['water.json'] = JSON.stringify({ ...record, tap: new Date(2026, 10, 18, 10, 30).getTime() })
  fireAlarm()
  assert.equal(buzzes(), 0)
})

test('without sleep data the wait counts from the last tap', async () => {
  world.sleepBroken = true
  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(firstAlarm(), '18 12:00')
  closeApp()
  fireAlarm()
  assert.equal(buzzes(), 1)
})

test('the page still works when reminders cannot be set', async () => {
  world.alarmsBroken = true
  setTime(9, 0)
  await open()
  tap(drop())
  assert.equal(level(), 450)
})

test('only a tap fills it: a change in the sleep data never raises the level', async () => {
  awake()
  setTime(12, 0)
  await open()
  tap(drop())
  setTime(13, 30)
  await reopen()
  assert.equal(level(), 225)
  // The watch now claims you have been asleep since 22:30 yesterday.
  asleep()
  await reopen()
  assert.equal(level(), 225, 'held where it was, not filled')
  tap(drop())
  assert.equal(level(), 450)
})

test('the level stands still while the open app is off the wrist', async () => {
  setTime(9, 0)
  await open()
  tap(drop())
  setTime(10, 0)
  world.worn = false
  world.page.render()
  const before = level()
  setTime(11, 0)
  world.page.render()
  assert.equal(level(), before)
  world.worn = true
  setTime(11, 30)
  world.page.render()
  assert.equal(level(), 300, 'only 9:00 to 10:00 counted')
})

// A long random day-to-day life: the watch on and off, moving, asleep and
// awake, the screen on and off, alarms firing, the app opened and the drop
// tapped. Whenever the service buzzes, the app opened at that moment shows an
// empty glass; whenever it shows one with you awake and the watch on, the
// service buzzes. The level never rises without a tap.
test('the page and the reminders never disagree', async () => {
  let seed = 20261120
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const pick = (list) => list[Math.floor(random() * list.length)]

  setTime(8, 0)
  await open()
  closeApp()
  let t = world.now.getTime()
  let shown = 450
  for (let step = 0; step < 1500; step++) {
    t += Math.floor(1 + random() * 25) * 60000
    // Alarms due by then fire first.
    while (world.alarms.length && Math.min(...world.alarms.map((a) => a.time * 1000)) <= t) {
      const before = buzzes()
      fireAlarm()
      if (buzzes() > before) {
        await open()
        assert.equal(level(), 0, `buzzed at ${world.now.toISOString()} with water left`)
        shown = 0
        closeApp()
      }
    }
    world.now = new Date(t)
    const what = random()
    if (what < 0.3) {
      world.worn = pick([true, true, 'moving', false, null])
      world.screenOn = random() < 0.4
      const before = buzzes()
      wearEvent()
      if (buzzes() > before) {
        await open()
        assert.equal(level(), 0, `buzzed at ${world.now.toISOString()} with water left`)
        shown = 0
        closeApp()
      }
    } else if (what < 0.4) {
      world.sleep = random() < 0.5 ? { ...SLEPT, asleep: true } : { ...SLEPT, asleep: false }
      sleepEvent()
    } else if (what < 0.6) {
      await open()
      // The floor is stored a minute at a time: up to 3 px is rounding.
      assert.ok(level() <= shown + 3, `rose from ${shown} to ${level()} at ${world.now.toISOString()}`)
      shown = level()
      if (shown === 0 && world.worn !== false && world.worn !== null && !(world.sleep && world.sleep.asleep)) {
        const before = buzzes()
        closeApp()
        wearEvent()
        assert.equal(buzzes(), before + 1, `empty at ${world.now.toISOString()} and no buzz`)
        await open()
      }
      if (random() < 0.5) {
        tap(drop())
        shown = 450
      }
      closeApp()
    }
  }
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
  // The service goes by it too.
  closeApp()
  assert.equal(hhmm(fireAlarm()), '18 11:30')
  assert.equal(buzzes(), 1)
})
