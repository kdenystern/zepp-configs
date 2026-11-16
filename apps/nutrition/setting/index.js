import {
  GOAL_KCAL_KEY,
  GOAL_PROTEIN_KEY,
  PRESETS_KEY,
  HISTORY_KEY,
  MAX_PRESETS,
  phoneSettings,
  parsePresets,
  presetsText,
  historyRows,
} from '../lib/settings'

const SHOWN_DAYS = 30

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const getItem = (key) => storage.getItem(key)
    const { goals } = phoneSettings(getItem)
    const presets = presetsText(getItem(PRESETS_KEY))
    const { errors } = parsePresets(presets)
    const rows = historyRows(getItem(HISTORY_KEY)).slice(0, SHOWN_DAYS)

    const history = rows.length
      ? rows.map((row) =>
          Text({ paragraph: true }, `${row.day}    ${row.kcal} kcal    ${row.protein} g protein`),
        )
      : [Text({ paragraph: true }, 'Nothing synced yet. Open the tracker on the watch with the phone nearby.')]

    return View({ style: { padding: '12px 16px' } }, [
      Section(
        {
          title: 'History',
          description: `Daily totals logged on the watch (goal ${goals.kcal} kcal, ${goals.protein} g protein). Updated whenever the tracker is opened with the phone in range.`,
        },
        history,
      ),
      Section({ title: 'Daily goals' }, [
        TextInput({
          label: 'Calories (kcal)',
          value: String(goals.kcal),
          onChange: (value) => storage.setItem(GOAL_KCAL_KEY, value.trim()),
        }),
        TextInput({
          label: 'Protein (g)',
          value: String(goals.protein),
          onChange: (value) => storage.setItem(GOAL_PROTEIN_KEY, value.trim()),
        }),
      ]),
      Section(
        {
          title: 'Quick-add buttons',
          description: `One per line: Label = kcal, protein. Up to ${MAX_PRESETS}. They appear the next time the tracker opens.`,
        },
        [
          TextInput({
            label: 'Edit buttons',
            multiline: true,
            rows: 7,
            value: presets,
            onChange: (value) => storage.setItem(PRESETS_KEY, value),
          }),
          ...errors.map((e) =>
            Text({ paragraph: true, style: { color: '#d9453a' } }, `Line ${e.line}: ${e.message}`),
          ),
        ],
      ),
      Section({ title: 'About the data' }, [
        Text(
          { paragraph: true },
          "Zepp does not let mini apps write to its own Food Log or health records, so these totals stay in this app.",
        ),
      ]),
    ])
  },
})
