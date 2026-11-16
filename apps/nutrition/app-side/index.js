import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

import { HISTORY_KEY, WATCH_KEYS, phoneSettings, mergeHistory } from '../lib/settings'

const getItem = (key) => settingsLib.getItem(key)

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    // The watch reports its day totals and gets the goals and presets back.
    onRequest(req, res) {
      if (req.method === 'SYNC') {
        const days = req.params && req.params.days
        if (days) settingsLib.setItem(HISTORY_KEY, mergeHistory(getItem(HISTORY_KEY), days))
        res(null, { settings: phoneSettings(getItem) })
      } else {
        res('unknown method: ' + req.method)
      }
    },

    // Goals or presets edited in the settings page: push them in case the
    // tracker is open. Our own history writes land here too and are skipped.
    onSettingsChange({ key }) {
      if (WATCH_KEYS.indexOf(key) < 0) return
      this.call({ method: 'SETTINGS', params: phoneSettings(getItem) })
    },
  }),
)
