import { createWidget, widget, align, prop, setStatusBarVisible } from '@zos/ui'
import { back } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { showToast } from '@zos/interaction'

import { addEntry } from '../lib/log'
import { session, today, saveDb } from '../lib/session'

const FIELDS = {
  kcal: { title: 'Add calories', unit: 'kcal', color: 0xe0742b, pressed: 0x924b1c },
  protein: { title: 'Add protein', unit: 'g', color: 0x2f7fd6, pressed: 0x1f538b },
}
const MAX_DIGITS = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Del', '0', 'OK']

// push() delivers params as a JSON string.
function fieldFrom(params) {
  try {
    const field = JSON.parse(params).field
    return FIELDS[field] ? field : 'kcal'
  } catch (e) {
    return 'kcal'
  }
}

Page({
  state: {
    field: 'kcal',
    digits: '',
    display: null,
  },

  onInit(params) {
    this.state.field = fieldFrom(params)
    this.state.digits = ''
  },

  build() {
    setStatusBarVisible(false)
    const { width, height } = getDeviceInfo()
    const field = FIELDS[this.state.field]

    createWidget(widget.TEXT, {
      x: 60,
      y: 16,
      w: width - 120,
      h: 34,
      text: field.title,
      color: 0x9a9a9a,
      text_size: 24,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    this.state.display = createWidget(widget.TEXT, {
      x: 30,
      y: 52,
      w: width - 60,
      h: 64,
      text: '',
      color: 0xffffff,
      text_size: 48,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    this.show()

    // 3 x 4 keypad filling the rest of the screen.
    const margin = 16
    const gap = 6
    const top = 124
    const keyW = Math.floor((width - 2 * margin - 2 * gap) / 3)
    const keyH = Math.floor((height - top - margin - 3 * gap) / 4)
    const x0 = Math.floor((width - (3 * keyW + 2 * gap)) / 2)

    KEYS.forEach((key, i) => {
      const isOk = key === 'OK'
      createWidget(widget.BUTTON, {
        x: x0 + (i % 3) * (keyW + gap),
        y: top + Math.floor(i / 3) * (keyH + gap),
        w: keyW,
        h: keyH,
        radius: 30,
        normal_color: isOk ? field.color : 0x2a2a2a,
        press_color: isOk ? field.pressed : 0x555555,
        color: 0xffffff,
        text_size: key.length > 1 ? 28 : 36,
        text: key,
        click_func: () => this.press(key),
      })
    })
  },

  show() {
    const field = FIELDS[this.state.field]
    this.state.display.setProperty(prop.TEXT, `${this.state.digits || '0'} ${field.unit}`)
  },

  press(key) {
    if (key === 'OK') return this.confirm()

    const { digits } = this.state
    if (key === 'Del') {
      this.state.digits = digits.slice(0, -1)
    } else if (digits.length < MAX_DIGITS && !(digits === '' && key === '0')) {
      this.state.digits = digits + key
    }
    this.show()
  },

  confirm() {
    const amount = Number(this.state.digits)
    if (!(amount > 0)) {
      showToast({ content: 'Enter an amount first' })
      return
    }
    const { db } = session()
    if (this.state.field === 'kcal') addEntry(db, today(), amount, 0)
    else addEntry(db, today(), 0, amount)
    saveDb()
    // The summary page is rebuilt on return and syncs the new total.
    back()
  },
})
