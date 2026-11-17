import {
  parseConfig,
  describeTile,
  effectiveConfig,
  CONFIG_KEY,
  DEFAULT_CONFIG_TEXT,
  SYSTEM_APPS,
  ICONS,
} from '../../../shared/config'
import { page, card, text, note, problem, heading, field, button } from '../../../shared/settings-ui'

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const config = effectiveConfig(storage.getItem(CONFIG_KEY))
    const { tiles, errors } = parseConfig(config)

    const preview = tiles.map((tile, i) =>
      text(`${i + 1}. ${tile.label}  →  ${describeTile(tile)}  (${tile.icon ? 'icon ' + tile.icon : 'text label'})`),
    )
    const problems = errors.map((e) => problem(`Line ${e.line}: ${e.message}`))

    return page([
      card(
        'Tiles',
        'One per line, three to a row, left to right and top to bottom. More than nine scroll. Changes reach the watch the next time the Launcher opens with the phone nearby.',
        [
          field({
            label: 'Edit tiles',
            multiline: true,
            rows: 10,
            value: config,
            onChange: (value) => storage.setItem(CONFIG_KEY, value),
          }),
        ],
      ),
      card('On the watch', '', [...preview, ...problems]),
      card('How to write a line', '', [
        text('Label = target'),
        text('Label = target @food   (pick an icon)'),
        text('Label = target #2f7fd6   (colour of a text tile)'),
        note(
          'Built-in apps get their icon automatically. Other tiles show the label as text unless you add an @icon.',
        ),
        text('timer   (label can be left out for built-in apps)'),
        heading('Targets'),
        text('Built-in app: one of the names below.'),
        text('Mini app by id: app:68232:page/index'),
        text('Mini app by name: name:Calculator:page/index'),
        text('Built-in screen by name: screen:FlashLightScreen'),
        heading('Built-in app names'),
        note(SYSTEM_APPS.map((app) => app.name).join(', ')),
        heading('Icons'),
        note(ICONS.join(', ')),
      ]),
      button('Reset to default tiles', () => storage.setItem(CONFIG_KEY, DEFAULT_CONFIG_TEXT)),
    ])
  },
})
