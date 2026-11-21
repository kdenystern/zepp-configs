// Woken by an alarm (lib/watch.js plan()) and by the system when the watch
// goes on or off the wrist (or moves on it), or you fall asleep or wake up
// (app.json "app-event"). Buzzes the motor if the wait has run out in time
// that counts and you are awake with the watch on; the page shows empty at
// exactly that point, since both go by lib/water.js isDue().
//
// It reads everything afresh each time and writes only the wear record, and
// only when the watch went on or off. Nothing it decides depends on that
// write succeeding: it may write files only while the screen is off, and a
// write that fails is made by the next look. It has no screen, no timers and
// 600 ms.
import { clockNow, readSleep, readWorn, loadRecord, loadOffs, saveOffs, buzz, plan } from '../lib/watch'
import { noteWear, isOff, counted, isDue, checkTimes } from '../lib/water'

// Alarms the service sets each time: it sets them again at every look, so a
// few are enough to carry on if one look is cut short.
const SERVICE_ALARMS = 4

function look(params) {
  const record = loadRecord()
  // Never opened, or the record unreadable: nothing to remind of. Quiet is
  // the safe side; the page writes the record as soon as it opens.
  if (!record.tap) return

  const { now, offset } = clockNow()
  const { asleep, night } = readSleep(now, offset, true)
  const before = loadOffs()
  const offs = noteWear(before, readWorn(), now, record.tap)
  const paused = asleep || isOff(offs)
  const spent = counted({ ...record, night, offs, now })

  if (!paused && isDue(spent, record.gap)) {
    try {
      buzz()
    } catch (e) {
      console.log('water: buzz failed: ' + e)
    }
  }

  const changed = offs !== before
  if (changed) saveOffs(offs)

  // The watch moving on the wrist wakes this often and changes nothing:
  // the alarms set before still stand.
  const event = params.indexOf('event') >= 0
  if (!event || changed || params.indexOf('sleep') >= 0) {
    plan(checkTimes({ spent, gap: record.gap, paused, now, max: SERVICE_ALARMS }))
  }
}

AppService({
  onInit(params) {
    try {
      look(typeof params === 'string' ? params : '')
    } catch (e) {
      console.log('water: ' + e)
    }
  },
  onDestroy() {},
})
