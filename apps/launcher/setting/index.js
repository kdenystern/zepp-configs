import {
  parseConfig,
  describeTile,
  effectiveConfig,
  CONFIG_KEY,
  DEFAULT_CONFIG_TEXT,
  SYSTEM_APPS,
  ICONS,
} from '../../../shared/config'

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const text = effectiveConfig(storage.getItem(CONFIG_KEY))
    const { tiles, errors } = parseConfig(text)

    const preview = tiles.map((tile, i) =>
      Text(
        { paragraph: true },
        `${i + 1}. ${tile.label}  →  ${describeTile(tile)}  (${tile.icon ? 'icon ' + tile.icon : 'text label'})`,
      ),
    )
    const problems = errors.map((e) =>
      Text({ paragraph: true, style: { color: '#d9453a' } }, `Line ${e.line}: ${e.message}`),
    )

    return View({ style: { padding: '12px 16px' } }, [
      Section(
        {
          title: 'Tiles',
          description: `One per line, three to a row, left to right and top to bottom. More than nine scroll. Changes reach the watch the next time the Launcher opens with the phone nearby.`,
        },
        [
          TextInput({
            label: 'Edit tiles',
            multiline: true,
            rows: 10,
            value: text,
            onChange: (value) => storage.setItem(CONFIG_KEY, value),
          }),
        ],
      ),
      Section({ title: 'On the watch' }, [...preview, ...problems]),
      Section({ title: 'How to write a line' }, [
        Text({ paragraph: true }, 'Label = target'),
        Text({ paragraph: true }, 'Label = target @food   (pick an icon)'),
        Text({ paragraph: true }, 'Label = target #2f7fd6   (colour of a text tile)'),
        Text(
          { paragraph: true },
          'Built-in apps get their icon automatically. Other tiles show the label as text unless you add an @icon.',
        ),
        Text({ paragraph: true }, 'timer   (label can be left out for built-in apps)'),
        Text({ paragraph: true, bold: true }, 'Targets'),
        Text({ paragraph: true }, 'Built-in app: one of the names below.'),
        Text({ paragraph: true }, 'Mini app by id: app:68232:page/index'),
        Text({ paragraph: true }, 'Mini app by name: name:Calculator:page/index'),
        Text({ paragraph: true }, 'Built-in screen by name: screen:FlashLightScreen'),
        Text({ paragraph: true, bold: true }, 'Built-in app names'),
        Text({ paragraph: true }, SYSTEM_APPS.map((app) => app.name).join(', ')),
        Text({ paragraph: true, bold: true }, 'Icons'),
        Text({ paragraph: true }, ICONS.join(', ')),
      ]),
      Button({
        label: 'Reset to default tiles',
        style: { margin: '12px 0' },
        onClick: () => storage.setItem(CONFIG_KEY, DEFAULT_CONFIG_TEXT),
      }),
    ])
  },
})
