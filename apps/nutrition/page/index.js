import { createWidget, widget, align, prop, setStatusBarVisible } from '@zos/ui'
import { push } from '@zos/router'
import { getDeviceInfo } from '@zos/device'
import { showToast } from '@zos/interaction'
import { BasePage } from '@zeppos/zml/base-page'

import { addEntry, undoLast, totals, summary, barWidth } from '../lib/log'
import { session, today, saveDb, saveSettings } from '../lib/session'

const INSET = 24
const BAR_H = 12
const COLOR = {
  text: 0xffffff,
  dim: 0x9a9a9a,
  track: 0x2a2a2a,
  button: 0x2a2a2a,
  pressed: 0x555555,
  kcal: 0xe0742b,
  kcalPressed: 0x924b1c,
  protein: 0x2f7fd6,
  proteinPressed: 0x1f538b,
}

function describe(kcal, protein) {
  const parts = []
  if (kcal) parts.push(`${kcal} kcal`)
  if (protein) parts.push(`${protein} g`)
  return parts.join(', ')
}

Page(
  BasePage({
    state: {
      built: false,
      meters: null,
    },

    onInit() {
      this.sync()
    },

    build() {
      setStatusBarVisible(false)
      const { width } = getDeviceInfo()
      const w = width - 2 * INSET
      const { settings } = session()
      let y = 20

      createWidget(widget.TEXT, {
        x: INSET,
        y,
        w,
        h: 34,
        text: 'Today',
        color: COLOR.dim,
        text_size: 24,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
      y += 42

      this.state.meters = {
        kcal: this.meter(y, w, 'Calories', COLOR.kcal),
        protein: this.meter(y + 66, w, 'Protein', COLOR.protein),
      }
      y += 132

      y += 6

      const half = Math.floor((w - 8) / 2)
      createWidget(widget.BUTTON, {
        x: INSET,
        y,
        w: half,
        h: 72,
        radius: 24,
        normal_color: COLOR.kcal,
        press_color: COLOR.kcalPressed,
        color: COLOR.text,
        text_size: 26,
        text: '+ kcal',
        click_func: () => push({ url: 'page/add', params: { field: 'kcal' } }),
      })
      createWidget(widget.BUTTON, {
        x: INSET + half + 8,
        y,
        w: half,
        h: 72,
        radius: 24,
        normal_color: COLOR.protein,
        press_color: COLOR.proteinPressed,
        color: COLOR.text,
        text_size: 26,
        text: '+ protein',
        click_func: () => push({ url: 'page/add', params: { field: 'protein' } }),
      })
      y += 84

      settings.presets.forEach((preset) => {
        createWidget(widget.BUTTON, {
          x: INSET,
          y,
          w,
          h: 60,
          radius: 20,
          normal_color: COLOR.button,
          press_color: COLOR.pressed,
          color: COLOR.text,
          text_size: 20,
          text: `${preset.label}: ${describe(preset.kcal, preset.protein)}`,
          click_func: () => this.add(preset.kcal, preset.protein, preset.label),
        })
        y += 68
      })

      createWidget(widget.BUTTON, {
        x: INSET,
        y,
        w,
        h: 56,
        radius: 20,
        normal_color: COLOR.button,
        press_color: COLOR.pressed,
        color: COLOR.dim,
        text_size: 20,
        text: 'Undo last',
        click_func: () => this.undo(),
      })
      y += 56

      // Empty tail so the last button can scroll clear of the rounded corners.
      createWidget(widget.TEXT, { x: 0, y, w: width, h: 70, text: '' })

      this.state.built = true
      this.refresh()
    },

    onDestroy() {
      this.state.built = false
    },

    // One row: label on the left, "value / goal" on the right, bar underneath.
    meter(y, w, label, color) {
      createWidget(widget.TEXT, {
        x: INSET,
        y,
        w: 120,
        h: 36,
        text: label,
        color: COLOR.dim,
        text_size: 22,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
      const value = createWidget(widget.TEXT, {
        x: INSET + 120,
        y,
        w: w - 120,
        h: 36,
        text: '',
        color: COLOR.text,
        text_size: 28,
        align_h: align.RIGHT,
        align_v: align.CENTER_V,
      })
      const bar = { x: INSET, y: y + 42, w, h: BAR_H }
      createWidget(widget.FILL_RECT, { ...bar, radius: BAR_H / 2, color: COLOR.track })
      const fill = createWidget(widget.FILL_RECT, { ...bar, radius: BAR_H / 2, color })
      return { value, fill, bar }
    },

    setMeter(meter, value, goal, unit) {
      meter.value.setProperty(prop.TEXT, `${value} / ${goal}${unit}`)
      const width = barWidth(value, goal, meter.bar.w, BAR_H)
      meter.fill.setProperty(prop.VISIBLE, width > 0)
      if (width > 0) meter.fill.setProperty(prop.MORE, { ...meter.bar, w: width })
    },

    refresh() {
      if (!this.state.built) return
      const { db, settings } = session()
      const eaten = totals(db, today())
      this.setMeter(this.state.meters.kcal, eaten.kcal, settings.goals.kcal, '')
      this.setMeter(this.state.meters.protein, eaten.protein, settings.goals.protein, ' g')
    },

    add(kcal, protein, label) {
      const { db } = session()
      if (!addEntry(db, today(), kcal, protein)) return
      saveDb()
      this.refresh()
      showToast({ content: `Added ${label}` })
      this.sync()
    },

    undo() {
      const { db } = session()
      const entry = undoLast(db, today())
      if (!entry) {
        showToast({ content: 'Nothing to undo today' })
        return
      }
      saveDb()
      this.refresh()
      showToast({ content: `Removed ${describe(entry[0], entry[1])}` })
      this.sync()
    },

    // Pushed by the phone when goals or presets are edited while this is open.
    onCall(data) {
      if (data && data.method === 'SETTINGS') this.applySettings(data.params)
    },

    // Sends the day totals to the phone and picks up goals and presets. The
    // log lives on the watch, so with the phone out of reach this quietly
    // does nothing and the next sync catches up.
    sync() {
      try {
        this.request({ method: 'SYNC', params: { days: summary(session().db) } })
          .then((result) => this.applySettings(result && result.settings))
          .catch(() => {})
      } catch (e) {
        console.log('nutrition: sync unavailable: ' + e)
      }
    },

    applySettings(raw) {
      if (!raw) return
      const before = JSON.stringify(session().settings)
      const settings = saveSettings(raw)
      if (JSON.stringify(settings) === before || !this.state.built) return
      // Goals update in place; a changed preset list shows on the next open,
      // since the buttons are laid out once in build().
      this.refresh()
    },
  }),
)
