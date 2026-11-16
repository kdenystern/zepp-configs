import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

import { CONFIG_KEY, effectiveConfig } from '../../../shared/config'

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    // The watch asks for the config each time the launcher opens.
    onRequest(req, res) {
      if (req.method === 'GET_CONFIG') {
        res(null, { text: effectiveConfig(settingsLib.getItem(CONFIG_KEY)) })
      } else {
        res('unknown method: ' + req.method)
      }
    },

    // Edited in the settings page: push it in case the launcher is open now.
    onSettingsChange({ key, newValue }) {
      if (key !== CONFIG_KEY) return
      this.call({ method: 'CONFIG', params: { text: effectiveConfig(newValue) } })
    },
  }),
)
