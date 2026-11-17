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

import { page, card, text, note, problem, field } from '../../../shared/settings-ui'

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
      ? rows.map((row) => text(`${row.day}    ${row.kcal} kcal    ${row.protein} g protein`))
      : [text('Nothing synced yet. Open the tracker on the watch with the phone nearby.')]

    return page([
      card(
        'History',
        `Daily totals logged on the watch (goal ${goals.kcal} kcal, ${goals.protein} g protein). Updated whenever the tracker is opened with the phone in range.`,
        history,
      ),
      card('Daily goals', '', [
        field({
          label: 'Calories (kcal)',
          value: String(goals.kcal),
          onChange: (value) => storage.setItem(GOAL_KCAL_KEY, value.trim()),
        }),
        field({
          label: 'Protein (g)',
          value: String(goals.protein),
          onChange: (value) => storage.setItem(GOAL_PROTEIN_KEY, value.trim()),
        }),
      ]),
      card(
        'Quick-add buttons',
        `One per line: Label = kcal, protein. Up to ${MAX_PRESETS}. They appear the next time the tracker opens.`,
        [
          field({
            label: 'Edit buttons',
            multiline: true,
            rows: 7,
            value: presets,
            onChange: (value) => storage.setItem(PRESETS_KEY, value),
          }),
          ...errors.map((e) => problem(`Line ${e.line}: ${e.message}`)),
        ],
      ),
      card('About the data', '', [
        note(
          'Zepp does not let mini apps write to its own Food Log or health records, so these totals stay in this app.',
        ),
      ]),
    ])
  },
})
