// Goals, quick-add presets and synced history: what the phone stores and
// sends to the watch. Pure data logic, no platform imports.

export const GOAL_KCAL_KEY = 'goalKcal'
export const GOAL_PROTEIN_KEY = 'goalProtein'
export const PRESETS_KEY = 'presets'
export const HISTORY_KEY = 'history'

// Settings keys whose change must be pushed to the watch.
export const WATCH_KEYS = [GOAL_KCAL_KEY, GOAL_PROTEIN_KEY, PRESETS_KEY]

export const DEFAULT_GOALS = { kcal: 2000, protein: 120 }
export const MAX_PRESETS = 6
export const HISTORY_DAYS = 180

export const DEFAULT_PRESETS_TEXT = ['Protein shake = 150, 30', 'Snack = 200, 5', 'Meal = 600, 35'].join(
  '\n',
)

function wholeNumber(value, max) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return n <= max ? n : null
}

// Presets are one per line: "Label = kcal, protein" (protein may be left out).
export function parsePresets(text) {
  const presets = []
  const errors = []

  String(text || '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim()
      if (!line || line[0] === '#') return
      const lineNo = index + 1

      const eq = line.lastIndexOf('=')
      const label = eq < 0 ? '' : line.slice(0, eq).trim()
      const numbers = eq < 0 ? [] : line.slice(eq + 1).trim().split(/[\s,;/]+/).filter(Boolean)
      if (!label || numbers.length < 1 || numbers.length > 2) {
        errors.push({ line: lineNo, message: 'expected "Label = kcal, protein"' })
        return
      }

      const kcal = wholeNumber(numbers[0], 9999)
      const protein = numbers.length > 1 ? wholeNumber(numbers[1], 9999) : 0
      if (kcal === null || protein === null) {
        errors.push({ line: lineNo, message: 'amounts must be whole numbers up to 9999' })
        return
      }
      if (kcal === 0 && protein === 0) {
        errors.push({ line: lineNo, message: 'adds nothing' })
        return
      }
      if (presets.length >= MAX_PRESETS) {
        errors.push({ line: lineNo, message: `ignored, only ${MAX_PRESETS} buttons fit` })
        return
      }
      presets.push({ label, kcal, protein })
    })

  return { presets, errors }
}

export function presetsText(stored) {
  return typeof stored === 'string' && stored.trim() ? stored : DEFAULT_PRESETS_TEXT
}

function goal(stored, fallback) {
  const n = wholeNumber(stored, 99999)
  return n ? n : fallback
}

// The settings the watch works from, built from the phone's stored strings.
// `getItem` reads one settings-storage key.
export function phoneSettings(getItem) {
  return {
    goals: {
      kcal: goal(getItem(GOAL_KCAL_KEY), DEFAULT_GOALS.kcal),
      protein: goal(getItem(GOAL_PROTEIN_KEY), DEFAULT_GOALS.protein),
    },
    presets: parsePresets(presetsText(getItem(PRESETS_KEY))).presets,
  }
}

export const DEFAULT_SETTINGS = phoneSettings(() => undefined)

// Validates settings read from watch storage or received from the phone.
export function normaliseSettings(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
  const goals = raw.goals || {}
  const presets = Array.isArray(raw.presets) ? raw.presets : DEFAULT_SETTINGS.presets
  return {
    goals: {
      kcal: goal(goals.kcal, DEFAULT_GOALS.kcal),
      protein: goal(goals.protein, DEFAULT_GOALS.protein),
    },
    presets: presets
      .filter((p) => p && typeof p.label === 'string' && p.label)
      .slice(0, MAX_PRESETS)
      .map((p) => ({
        label: p.label,
        kcal: wholeNumber(p.kcal, 9999) || 0,
        protein: wholeNumber(p.protein, 9999) || 0,
      })),
  }
}

function parseHistory(stored) {
  try {
    const value = JSON.parse(stored)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch (e) {
    return {}
  }
}

// Folds the watch's per-day totals into the history stored on the phone and
// returns the new JSON. The watch wins for any day it reports; older days the
// watch has already dropped are kept, up to HISTORY_DAYS.
export function mergeHistory(stored, days) {
  const history = parseHistory(stored)
  Object.keys(days || {}).forEach((key) => {
    const pair = days[key]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(pair)) return
    history[key] = [Number(pair[0]) || 0, Number(pair[1]) || 0]
  })
  const keys = Object.keys(history).sort()
  keys.slice(0, Math.max(0, keys.length - HISTORY_DAYS)).forEach((key) => delete history[key])
  return JSON.stringify(history)
}

// History as rows, newest first, for the settings page.
export function historyRows(stored) {
  const history = parseHistory(stored)
  return Object.keys(history)
    .sort()
    .reverse()
    .map((day) => ({ day, kcal: history[day][0], protein: history[day][1] }))
}
