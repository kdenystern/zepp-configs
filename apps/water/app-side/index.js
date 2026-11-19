// Phone side of the Water app: hands the watch the settings made in the
// settings page. The drinks themselves stay on the watch.
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

import { PHONE_KEYS, phoneSettings } from '../lib/water'

const current = () => phoneSettings((key) => settingsLib.getItem(key))

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      if (req.method === 'SETTINGS') res(null, { settings: current() })
      else res('unknown method: ' + req.method)
    },

    // A setting changed on the phone: push it in case the app is open on the
    // watch. If it is not, it asks when it next opens.
    onSettingsChange({ key }) {
      if (PHONE_KEYS.indexOf(key) < 0) return
      try {
        const sent = this.call({ method: 'SETTINGS', params: current() })
        if (sent && sent.catch) sent.catch(() => {})
      } catch (e) {
        // The watch app is not running.
      }
    },
  }),
)
