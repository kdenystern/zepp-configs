// Launcher config: plain text, one tile per line. Shared by the Launcher
// app's page, its phone side service and its settings page, so it must stay
// free of platform imports.
//
//   Label = target [@icon] [#rrggbb]
//
// Targets:
//   timer                      built-in app, by name (see SYSTEM_APPS)
//   screen:FlashLightScreen    built-in screen, by its native screen name
//   app:68232:page/index       mini app, by appId and entry page
//   name:Calculator:page/index mini app, looked up by its English name

import { ICONS } from './icons'

export { ICONS }
export const MAX_TILES = 60
export const CONFIG_KEY = 'config'

// The watch face's launcher button opens this app.
export const LAUNCHER_APP_ID = 68231

// [name used in the config, SYSTEM_APP_* constant suffix, default label]
const SYSTEM_APP_TABLE = [
  ['activity', 'STATUS', 'Activity'],
  ['hr', 'HR', 'Heart rate'],
  ['workout', 'SPORT', 'Workout'],
  ['history', 'SPORT_HISTORY', 'History'],
  ['status', 'SPORT_STATUS', 'Status'],
  ['weather', 'WEATHER', 'Weather'],
  ['alarm', 'ALARM', 'Alarm'],
  ['timer', 'COUNTDOWN', 'Timer'],
  ['stopwatch', 'STOPWATCH', 'Stopwatch'],
  ['pomodoro', 'POMODORO', 'Pomodoro'],
  ['worldclock', 'WORLD_CLOCK', 'World clock'],
  ['calendar', 'CALENDAR', 'Calendar'],
  ['todo', 'TODO_LIST', 'To do'],
  ['music', 'MUSIC', 'Music'],
  ['camera', 'CAMERA', 'Camera'],
  ['findphone', 'FINE_PHONE', 'Find phone'],
  ['phone', 'PHONE', 'Phone'],
  ['settings', 'SETTING', 'Settings'],
  ['sleep', 'SLEEP', 'Sleep'],
  ['spo2', 'SPO2', 'SpO2'],
  ['stress', 'PRESSURE', 'Stress'],
  ['breathe', 'BREATH', 'Breathe'],
  ['pai', 'PAI', 'PAI'],
  ['readiness', 'READINESS', 'Readiness'],
  ['measure', 'MEASUREMENT', 'Measure'],
  ['cycle', 'MENSTRUAL', 'Cycle'],
  ['body', 'BODY_COMPOSITION', 'Body'],
  ['thermometer', 'THERMOMETER', 'Temp'],
  ['compass', 'COMPASS', 'Compass'],
  ['barometer', 'ALTIMETER', 'Barometer'],
  ['sunmoon', 'SUN_AND_MOON', 'Sun & moon'],
  ['coach', 'ZEPP_COACH', 'Coach'],
  ['voicememo', 'VOICE_MEMO', 'Voice memo'],
  ['alexa', 'ALEAX', 'Alexa'],
  ['cards', 'CARD', 'Cards'],
  ['membership', 'CLUB_CARD', 'Membership'],
  ['alipay', 'ALIPAY', 'Alipay'],
  ['wepay', 'WEPAY', 'WeChat Pay'],
  ['netease', 'NETEASE_MUSIC', 'NetEase'],
]

// Built-in apps whose icon is not simply their own name.
const ICON_ALIAS = { pai: 'star', membership: 'cards', alipay: 'app', wepay: 'app', netease: 'app' }

export const SYSTEM_APPS = SYSTEM_APP_TABLE.map(([name, id, label]) => ({ name, id, label }))

const SYSTEM_BY_NAME = {}
SYSTEM_APPS.forEach((app) => {
  SYSTEM_BY_NAME[app.name] = app
  // Also accept the raw constant suffix, e.g. "countdown" or "SPORT_HISTORY".
  SYSTEM_BY_NAME[normalise(app.id)] = app
})

export const PALETTE = [
  0xd9453a, 0xe0742b, 0xb8890f, 0x3f9e4d, 0x1f9e96, 0x2f7fd6, 0x5b5bd6, 0x9b4fd0, 0xc9458f,
]

export const DEFAULT_CONFIG_TEXT = [
  'Workout = workout',
  'Heart rate = hr',
  'Timer = timer',
  'Stopwatch = stopwatch',
  'Alarm = alarm',
  'Weather = weather',
  'Music = music',
  'Nutrition = app:68232:page/index @food',
  'Settings = settings',
].join('\n')

// What the watch should show for a stored value: the phone is the source of
// truth, and a blank config means "use the defaults".
export function effectiveConfig(stored) {
  return typeof stored === 'string' && stored.trim() ? stored : DEFAULT_CONFIG_TEXT
}

function normalise(name) {
  return String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function parseTarget(target) {
  const colon = target.indexOf(':')
  if (colon < 0) {
    const app = SYSTEM_BY_NAME[normalise(target)]
    if (!app) return { error: `unknown app "${target}"` }
    return { kind: 'system', id: app.id, defaultLabel: app.label, icon: ICON_ALIAS[app.name] || app.name }
  }

  const scheme = target.slice(0, colon).trim().toLowerCase()
  const rest = target.slice(colon + 1).trim()
  if (!rest) return { error: `nothing after "${scheme}:"` }

  if (scheme === 'screen') return { kind: 'screen', url: rest, defaultLabel: rest }

  // app:<id>[:page] and name:<name>[:page] share the optional page part.
  const split = rest.indexOf(':')
  const head = (split < 0 ? rest : rest.slice(0, split)).trim()
  const url = split < 0 ? '' : rest.slice(split + 1).trim()

  if (scheme === 'app') {
    if (!/^\d+$/.test(head)) return { error: `"${head}" is not a numeric app id` }
    const tile = { kind: 'app', appId: Number(head), defaultLabel: head }
    if (url) tile.url = url
    return tile
  }
  if (scheme === 'name') {
    const tile = { kind: 'name', name: head, defaultLabel: head }
    if (url) tile.url = url
    return tile
  }
  return { error: `unknown target type "${scheme}:"` }
}

// Returns { tiles, errors }. Never throws: a bad line is reported and skipped
// so one typo on the phone cannot blank the launcher.
export function parseConfig(text) {
  const tiles = []
  const errors = []
  const lines = String(text || '').split(/\r?\n/)

  lines.forEach((raw, index) => {
    let line = raw.trim()
    if (!line || line[0] === '#') return
    const lineNo = index + 1

    let color = null
    const colorMatch = line.match(/\s#([0-9a-fA-F]{6})$/)
    if (colorMatch) {
      color = parseInt(colorMatch[1], 16)
      line = line.slice(0, colorMatch.index).trim()
    }

    let icon = null
    const iconMatch = line.match(/\s@([A-Za-z0-9]+)$/)
    if (iconMatch) {
      icon = iconMatch[1].toLowerCase()
      line = line.slice(0, iconMatch.index).trim()
      if (ICONS.indexOf(icon) < 0) {
        errors.push({ line: lineNo, message: `unknown icon "${icon}", showing the label instead` })
        icon = null
      }
    }

    const eq = line.indexOf('=')
    const label = eq < 0 ? '' : line.slice(0, eq).trim()
    const target = (eq < 0 ? line : line.slice(eq + 1)).trim()
    if (!target) {
      errors.push({ line: lineNo, message: 'missing target after "="' })
      return
    }

    const parsed = parseTarget(target)
    if (parsed.error) {
      errors.push({ line: lineNo, message: parsed.error })
      return
    }
    if (tiles.length >= MAX_TILES) {
      errors.push({ line: lineNo, message: `ignored, at most ${MAX_TILES} tiles` })
      return
    }

    const { defaultLabel, ...tile } = parsed
    tile.label = label || defaultLabel
    // Built-in apps come with an icon; anything else shows its label unless given one.
    if (icon) tile.icon = icon
    // Icon tiles come ready coloured; the colour is for text tiles.
    tile.color = color === null ? PALETTE[tiles.length % PALETTE.length] : color
    tiles.push(tile)
  })

  return { tiles, errors }
}

export function describeTile(tile) {
  if (tile.kind === 'system') return `built-in ${tile.id.toLowerCase()}`
  if (tile.kind === 'screen') return `screen ${tile.url}`
  const page = tile.url ? `, page ${tile.url}` : ''
  if (tile.kind === 'app') return `app ${tile.appId}${page}`
  return `app named "${tile.name}"${page}`
}
