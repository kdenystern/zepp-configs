// The Water app's settings page in the Zepp app: how long to wait before the
// buzz, changed with − and + buttons (no text box and its white pop-up).
import { GAP_KEY, phoneSettings, stepGap, gapLabel } from '../lib/water'

import { page, card, text, note, button, row } from '../../../shared/settings-ui'

const STEP = { marginLeft: '8px', flexShrink: '0', minWidth: '44px' }

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const settings = phoneSettings((key) => storage.getItem(key))

    const step = (direction) => () => {
      const fresh = phoneSettings((key) => storage.getItem(key))
      storage.setItem(GAP_KEY, String(stepGap(fresh, direction)))
    }

    return page([
      card(
        'Reminder',
        'The watch buzzes when this long has passed without the drop tapped. Time asleep, or with the watch off your wrist, does not count.',
        [
          row(
            [text('Remind after', { margin: '0' }), note(gapLabel(settings.gap), { margin: '0' })],
            View({ style: { display: 'flex', flexDirection: 'row', flexShrink: '0' } }, [
              button('−', step(-1), { style: STEP }),
              button('+', step(1), { style: STEP }),
            ]),
          ),
        ],
      ),
      note('Changes reach the watch the next time the app opens there with the phone nearby.'),
    ])
  },
})
