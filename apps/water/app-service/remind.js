// Woken by an alarm when the wait should have run out (see lib/watch.js
// plan()), and by the system when the watch goes on or off the wrist or you
// fall asleep or wake up (app.json "app-event"). Buzzes the motor if the wait
// has run out in time that counts, then sets the reminders again from now on,
// so they keep coming even if the app is not opened for days.
//
// Off the wrist: the moment is stored in `off`; when the watch is back on, the
// last tap is moved on by the time it was off, so that time does not count.
//
// It has no screen and only 600 ms. Every step is guarded: if nothing can be
// read, it still buzzes.
import {
  clockNow,
  readSleep,
  readWorn,
  buzz,
  loadLast,
  saveLast,
  loadOff,
  saveOff,
  loadSettings,
  plan,
} from '../lib/watch'
import { shouldBuzz, liftOff } from '../lib/water'

AppService({
  onInit() {
    let state = null
    try {
      const { now, offset } = clockNow()
      state = { now, last: loadLast(), settings: loadSettings(), ...readSleep(now, offset, true) }
    } catch (e) {
      state = null
    }

    let off = 0
    if (state) {
      try {
        off = loadOff()
        const worn = readWorn()
        if (worn === false && !off) {
          off = state.now
          saveOff(off)
        } else if (worn === true && off) {
          state.last = liftOff(state.last, off, state.now)
          saveLast(state.last)
          off = 0
          saveOff(0)
        }
      } catch (e) {
        console.log('water: wear: ' + e)
      }
      // While still off, the time since it came off does not count either.
      state.last = liftOff(state.last, off, state.now)
      state.paused = state.asleep || !!off
    }

    if (!state || shouldBuzz(state)) {
      try {
        buzz()
      } catch (e) {
        console.log('water: buzz failed: ' + e)
      }
    }

    if (!state) return
    try {
      // A minute on, so this very reminder is not set again.
      plan({ ...state, after: state.now + 60000 })
    } catch (e) {
      console.log('water: could not plan: ' + e)
    }
  },
  onDestroy() {},
})
