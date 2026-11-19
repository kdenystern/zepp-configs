// The Buzz app: a test bench for the watch's vibrations, to find one that is
// felt. Three kinds:
// - the motor directly (Vibrator), six patterns;
// - a notification sent now, with each `vibrate` value notify() takes;
// - "In 1 min": the motor's "4 times" from an alarm and an app service a
//   minute later, with no notification: exactly the Water app's reminder.
// The line at the top says what happened, so a silent failure shows.
import { createWidget, widget, align, prop, text_style, setStatusBarVisible } from '@zos/ui'
import {
  Time,
  Vibrator,
  VIBRATOR_SCENE_SHORT_LIGHT,
  VIBRATOR_SCENE_SHORT_MIDDLE,
  VIBRATOR_SCENE_SHORT_STRONG,
  VIBRATOR_SCENE_DURATION_LONG,
  VIBRATOR_SCENE_STRONG_REMINDER,
  VIBRATOR_SCENE_NOTIFICATION,
} from '@zos/sensor'
import { notify } from '@zos/notification'
import { set, REPEAT_ONCE } from '@zos/alarm'

import { NOTIFICATION_BUZZES, nameOf, clockLabel } from '../lib/buzz'

const WIDTH = 390
const MARGIN = 16
const GAP = 8
const COL = (WIDTH - 2 * MARGIN - 2 * GAP) / 3
const ROW = 46
const COLOR = { button: 0x333333, pressed: 0x555555, text: 0xffffff, dim: 0x999999, bad: 0xff6b6b }

const MOTOR = [
  { name: 'Light', mode: VIBRATOR_SCENE_SHORT_LIGHT },
  { name: 'Medium', mode: VIBRATOR_SCENE_SHORT_MIDDLE },
  { name: 'Strong', mode: VIBRATOR_SCENE_SHORT_STRONG },
  { name: 'Long', mode: VIBRATOR_SCENE_DURATION_LONG },
  { name: '4 times', mode: VIBRATOR_SCENE_STRONG_REMINDER },
  { name: 'Message', mode: VIBRATOR_SCENE_NOTIFICATION },
]

let vibrator = null

Page({
  state: { status: null },

  build() {
    setStatusBarVisible(false)
    this.state.status = createWidget(widget.TEXT, {
      x: 40,
      y: 22,
      w: WIDTH - 80,
      h: 42,
      text: 'Tap one to feel it',
      text_size: 22,
      color: COLOR.text,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.ELLIPSIS,
    })

    this.label(66, 'Motor')
    MOTOR.forEach((m, i) => this.button(i % 3, 92 + Math.floor(i / 3) * (ROW + 6), 1, m.name, () => this.motor(m)))

    this.label(196, 'Notification')
    NOTIFICATION_BUZZES.forEach((b, i) =>
      this.button(i % 3, 222 + Math.floor(i / 3) * (ROW + 6), 1, b.name, () => this.notification(b.value)),
    )
    // The seventh notification sits first in the third row, then "In 1 min".
    this.button(1, 222 + 2 * (ROW + 6), 2, 'In 1 min', () => this.later())

    createWidget(widget.TEXT, {
      x: 50,
      y: 380,
      w: WIDTH - 100,
      h: 52,
      text: 'In 1 min buzzes 4 times from an alarm, as Water does. Lock the screen and wait.',
      text_size: 18,
      color: COLOR.dim,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.WRAP,
    })
  },

  label(y, text) {
    createWidget(widget.TEXT, { x: MARGIN, y, w: WIDTH - 2 * MARGIN, h: 24, text, text_size: 18, color: COLOR.dim })
  },

  button(col, y, span, text, click) {
    return createWidget(widget.BUTTON, {
      x: MARGIN + col * (COL + GAP),
      y,
      w: COL * span + GAP * (span - 1),
      h: ROW,
      radius: ROW / 2,
      normal_color: COLOR.button,
      press_color: COLOR.pressed,
      color: COLOR.text,
      text_size: 20,
      text,
      click_func: click,
    })
  },

  say(text, bad = false) {
    this.state.status.setProperty(prop.TEXT, text)
    this.state.status.setProperty(prop.COLOR, bad ? COLOR.bad : COLOR.text)
  },

  motor(m) {
    if (m.mode === undefined) return this.say(`${m.name}: not on this watch`, true)
    try {
      if (!vibrator) vibrator = new Vibrator()
      vibrator.stop()
      vibrator.setMode(m.mode)
      vibrator.start()
      this.say(`Motor: ${m.name}`)
    } catch (e) {
      this.say(`${m.name} failed: ${e}`, true)
    }
  },

  notification(value) {
    try {
      const id = notify({
        title: 'Buzz test',
        content: `${nameOf(value)}, sent right away.`,
        vibrate: value,
        actions: [{ text: 'OK', file: 'app-service/ping', param: 'ok' }],
      })
      if (id) this.say(`Sent: ${nameOf(value)}`)
      else this.say(`${nameOf(value)}: not sent`, true)
    } catch (e) {
      this.say(`${nameOf(value)} failed: ${e}`, true)
    }
  },

  later() {
    try {
      const time = new Time()
      const h = time.getHours()
      const m = time.getMinutes()
      const at = Math.floor(time.getTime() / 1000) + 60
      const id = set({
        url: 'app-service/ping',
        time: at,
        // The official notification sample names it `date`.
        date: at,
        repeat_type: REPEAT_ONCE,
        store: true,
      })
      if (id) this.say(`4 times at about ${clockLabel(h, m + 1)}`)
      else this.say('The alarm was not set', true)
    } catch (e) {
      this.say(`Alarm failed: ${e}`, true)
    }
  },
})
