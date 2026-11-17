// Phone side of the Tasks app. The task list lives here, in settings storage:
// the settings page edits it, the watch reports what was checked off and gets
// the list back.
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

import { TASKS_KEY, readDb, applyChanges, activeTasks } from '../lib/tasks'

const readTasks = () => readDb(settingsLib.getItem(TASKS_KEY))

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      if (req.method !== 'SYNC') {
        res('unknown method: ' + req.method)
        return
      }
      const db = readTasks()
      const changed = applyChanges(db, req.params && req.params.changes)
      const tasks = activeTasks(db)
      // The watch is about to have this list: no need to push it as well.
      this.sent = JSON.stringify(tasks)
      if (changed) settingsLib.setItem(TASKS_KEY, JSON.stringify(db))
      res(null, { tasks })
    },

    // The list was edited in the settings page: push it in case the watch app
    // is open. Our own writes land here too and are skipped.
    onSettingsChange({ key }) {
      if (key !== TASKS_KEY) return
      const tasks = activeTasks(readTasks())
      const text = JSON.stringify(tasks)
      if (text === this.sent) return
      this.sent = text
      try {
        const sent = this.call({ method: 'TASKS', params: { tasks } })
        if (sent && sent.catch) sent.catch(() => {})
      } catch (e) {
        // The watch app is not running; it asks when it next opens.
      }
    },
  }),
)
