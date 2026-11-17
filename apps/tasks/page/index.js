// The Tasks app's one screen: what is left to do today. Tap a task to check
// it off; it goes away and the rest move up. Undo, under the list, brings
// back the last one checked off today.
//
// The list comes from the phone (see app-side/index.js), where tasks are
// added. The watch keeps a copy and its own unsent changes, so it works with
// the phone away and catches up the next time it opens within reach.
//
// Rows are made once and reused: after a tap they get new titles and the
// spare ones are hidden, which needs nothing beyond setProperty.
//
// The list scrolls in a layer of its own (a VIEW_CONTAINER) so that Undo can
// stay put at the bottom of the screen in a second layer on top of it.
import { createWidget, widget, align, prop, text_style, setStatusBarVisible } from '@zos/ui'
import { LocalStorage } from '@zos/storage'
import { Time } from '@zos/sensor'
import { BasePage } from '@zeppos/zml/base-page'

import { readState, current, dueTasks, watchCheck, watchUncheck, outgoing, received, listDay } from '../lib/tasks'
import { ROW } from '../lib/layout'

const WIDTH = 390
const HEIGHT = 450
// The strip at the bottom of the screen that holds Undo. Five rows end where
// it starts.
const FOOT = { y: 382, h: 68 }
const UNDO = { x: 105, y: 6, w: 180, h: 52 } // inside the strip
// With nothing left, a message takes the place of the rows.
const MESSAGE = { y: 150, h: 44, hintY: 198, hintH: 30 }

const COLOR = {
  text: 0xffffff,
  soft: 0xd0d0d0,
  dim: 0x9a9a9a,
  button: 0x1c1c1c,
  pressed: 0x3a3a3a,
}

const storage = new LocalStorage()

let time = null
// The watch's own clock, in local time; getMonth() is 1-12.
function today() {
  if (!time) time = new Time()
  return listDay(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours())
}

// The tasks as the phone last sent them, plus what was done here since.
let data = null

function load() {
  data = readState(storage.getItem('state', ''), today())
}

function save() {
  storage.setItem('state', JSON.stringify(data))
}

Page(
  BasePage({
    state: {
      built: false,
      list: null, // the layer that scrolls
      rows: [], // { text, button, title } per row made so far
      shown: [], // the tasks on screen, top to bottom
      message: null,
      hint: null,
      foot: null, // what hides the list behind Undo
      undo: null,
      end: 0, // the longest the list has been, for scrolling
      syncing: false,
      again: false,
    },

    onInit() {
      load()
      this.state.syncing = false
      this.state.again = false
      this.sync()
    },

    build() {
      setStatusBarVisible(false)
      const list = createWidget(widget.VIEW_CONTAINER, { x: 0, y: 0, w: WIDTH, h: HEIGHT })
      // Above the list, and not scrolling with it.
      const fixed = createWidget(widget.VIEW_CONTAINER, {
        x: 0,
        y: FOOT.y,
        w: WIDTH,
        h: FOOT.h,
        z_index: 1,
        scroll_enable: 0,
      })
      this.state.list = list

      const centred = (y, h, size, color) =>
        list.createWidget(widget.TEXT, {
          x: ROW.x,
          y,
          w: ROW.w,
          h,
          text: '',
          color,
          text_size: size,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
        })

      centred(20, 34, 24, COLOR.dim).setProperty(prop.TEXT, 'Today')
      this.state.message = centred(MESSAGE.y, MESSAGE.h, 30, COLOR.soft)
      this.state.hint = centred(MESSAGE.hintY, MESSAGE.hintH, 20, COLOR.dim)
      this.state.foot = fixed.createWidget(widget.FILL_RECT, { x: 0, y: 0, w: WIDTH, h: FOOT.h, color: 0x000000 })
      this.state.undo = fixed.createWidget(widget.BUTTON, {
        x: UNDO.x,
        y: UNDO.y,
        w: UNDO.w,
        h: UNDO.h,
        radius: UNDO.h / 2,
        normal_color: COLOR.button,
        press_color: COLOR.pressed,
        color: COLOR.dim,
        text_size: 22,
        text: 'Undo',
        click_func: () => this.undo(),
      })

      this.state.built = true
      this.render()
    },

    onDestroy() {
      this.state.built = false
      this.state.list = null
      this.state.rows = []
      this.state.shown = []
      this.state.end = 0
    },

    addRow() {
      const index = this.state.rows.length
      const y = ROW.y + index * ROW.h
      const { list } = this.state
      const text = list.createWidget(widget.TEXT, {
        x: ROW.x + ROW.text.x,
        y,
        w: ROW.w - ROW.text.x - 6,
        h: ROW.h - 2,
        text: '',
        color: COLOR.text,
        text_size: ROW.text.size,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
      // On top of the title, so the whole row takes the tap.
      const button = list.createWidget(widget.BUTTON, {
        x: ROW.x,
        y,
        w: -1, // take the size of the image
        h: -1,
        text: '',
        normal_src: 'row.png',
        press_src: 'row_p.png',
        click_func: () => this.check(index),
      })
      this.state.rows.push({ text, button, title: null })
    },

    render() {
      if (!this.state.built) return
      const { rows, message, hint, foot, undo } = this.state
      const all = current(data)
      const list = dueTasks(all, today())
      this.state.shown = list

      while (rows.length < list.length) this.addRow()
      rows.forEach((row, i) => {
        const title = i < list.length ? list[i].title : ''
        if (row.title === title) return
        row.title = title
        row.text.setProperty(prop.TEXT, title)
        row.text.setProperty(prop.VISIBLE, title !== '')
        row.button.setProperty(prop.VISIBLE, title !== '')
      })

      const none = list.length === 0
      const canUndo = data.undo.stack.length > 0
      // "No tasks yet" only until the phone has sent some.
      const fresh = none && all.length === 0 && !canUndo
      message.setProperty(prop.TEXT, none ? (fresh ? 'No tasks yet' : 'All done') : '')
      hint.setProperty(prop.TEXT, fresh ? 'Add them in the Zepp app' : '')

      foot.setProperty(prop.VISIBLE, canUndo)
      undo.setProperty(prop.VISIBLE, canUndo)
      this.reach(ROW.y + list.length * ROW.h)
    },

    // A list longer than five rows gets room after its end, so the last row
    // scrolls clear of Undo and the rounded corners. `end` is where the rows
    // stop.
    reach(end) {
      if (end <= FOOT.y || end <= this.state.end) return
      this.state.end = end
      this.state.list.createWidget(widget.FILL_RECT, { x: 0, y: end, w: WIDTH, h: FOOT.h, color: 0x000000 })
    },

    check(index) {
      const task = this.state.shown[index]
      if (!task || !watchCheck(data, task.id, today())) return
      this.changed()
    },

    undo() {
      if (!watchUncheck(data, today())) return
      this.changed()
    },

    changed() {
      save()
      this.render()
      this.sync()
    },

    // Pushed by the phone when the list is edited there while this is open.
    onCall(message) {
      if (message && message.method === 'TASKS' && message.params) this.receive(message.params.tasks, {})
    },

    // Tells the phone what was checked off here and takes its list. One
    // request at a time: changes made while it is out go with the next one.
    // With the phone out of reach this quietly does nothing.
    sync() {
      if (this.state.syncing) {
        this.state.again = true
        return
      }
      const sent = outgoing(data.changes)
      const finish = () => {
        this.state.syncing = false
        if (!this.state.again) return
        this.state.again = false
        this.sync()
      }
      this.state.syncing = true
      try {
        this.request({ method: 'SYNC', params: { changes: sent } })
          .then((result) => {
            if (result && Array.isArray(result.tasks)) this.receive(result.tasks, sent)
            finish()
          })
          .catch(() => {
            this.state.syncing = false
            this.state.again = false
          })
      } catch (e) {
        console.log('tasks: sync unavailable: ' + e)
        this.state.syncing = false
      }
    },

    receive(tasks, sent) {
      if (!Array.isArray(tasks)) return
      received(data, tasks, sent)
      save()
      this.render()
    },
  }),
)
