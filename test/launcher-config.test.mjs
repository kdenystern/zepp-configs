import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseConfig,
  effectiveConfig,
  describeTile,
  DEFAULT_CONFIG_TEXT,
  MAX_TILES,
  PALETTE,
  SYSTEM_APPS,
  ICONS,
} from '../shared/config.js'
import * as router from './support/zos/router.js'

test('the default config is nine tiles without errors', () => {
  const { tiles, errors } = parseConfig(DEFAULT_CONFIG_TEXT)
  assert.deepEqual(errors, [])
  assert.equal(tiles.length, 9)
  assert.deepEqual(tiles[0], { kind: 'system', id: 'SPORT', icon: 'workout', label: 'Workout', color: PALETTE[0] })
  assert.deepEqual(tiles[7], {
    kind: 'app',
    appId: 68232,
    url: 'page/index',
    label: 'Nutrition',
    icon: 'food',
    color: PALETTE[7],
  })
})

test('each target form parses', () => {
  const { tiles, errors } = parseConfig(
    [
      'Run = workout',
      'timer',
      'Torch = screen:FlashLightScreen',
      'Calc = app:1234',
      'Calc 2 = app:1234:page/home/index',
      'Notes = name:Quick Notes:page/index',
      'By name = name:Calculator',
    ].join('\n'),
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(
    tiles.map(({ color, ...tile }) => tile),
    [
      { kind: 'system', id: 'SPORT', icon: 'workout', label: 'Run' },
      { kind: 'system', id: 'COUNTDOWN', icon: 'timer', label: 'Timer' },
      { kind: 'screen', url: 'FlashLightScreen', label: 'Torch' },
      { kind: 'app', appId: 1234, label: 'Calc' },
      { kind: 'app', appId: 1234, url: 'page/home/index', label: 'Calc 2' },
      { kind: 'name', name: 'Quick Notes', url: 'page/index', label: 'Notes' },
      { kind: 'name', name: 'Calculator', label: 'By name' },
    ],
  )
})

test('built-in names ignore case, spaces and underscores, and accept the raw constant name', () => {
  const ids = (text) => parseConfig(text).tiles.map((t) => t.id)
  assert.deepEqual(ids('A = Find Phone\nB = WORLD_CLOCK\nC = countdown\nD = sport-history'), [
    'FINE_PHONE',
    'WORLD_CLOCK',
    'COUNTDOWN',
    'SPORT_HISTORY',
  ])
})

test('a trailing #rrggbb sets the tile colour, otherwise the palette is used in order', () => {
  const { tiles } = parseConfig('A = hr #00ff7f\nB = timer\nC = alarm')
  assert.equal(tiles[0].color, 0x00ff7f)
  assert.equal(tiles[1].color, PALETTE[1])
  assert.equal(tiles[2].color, PALETTE[2])
})

test('comments, blank lines and Windows line endings are skipped', () => {
  const { tiles, errors } = parseConfig('# my apps\r\n\r\nHeart = hr\r\n   \r\n# end\r\n')
  assert.deepEqual(errors, [])
  assert.deepEqual(
    tiles.map((t) => t.label),
    ['Heart'],
  )
})

test('a bad line is reported with its line number and the rest still load', () => {
  const { tiles, errors } = parseConfig(
    ['Heart = hr', 'Oops = notanapp', 'Empty =', 'Bad = app:abc', 'Odd = ftp:thing', 'Timer = timer'].join('\n'),
  )
  assert.deepEqual(
    tiles.map((t) => t.label),
    ['Heart', 'Timer'],
  )
  assert.deepEqual(errors, [
    { line: 2, message: 'unknown app "notanapp"' },
    { line: 3, message: 'missing target after "="' },
    { line: 4, message: '"abc" is not a numeric app id' },
    { line: 5, message: 'unknown target type "ftp:"' },
  ])
})

test('any number of tiles up to the cap is kept, and the overflow is reported', () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => `T${i} = timer`).join('\n')
  assert.equal(parseConfig(lines(2)).tiles.length, 2)
  assert.equal(parseConfig(lines(14)).tiles.length, 14)
  assert.deepEqual(parseConfig(lines(14)).errors, [])

  const { tiles, errors } = parseConfig(lines(MAX_TILES + 2))
  assert.equal(tiles.length, MAX_TILES)
  assert.deepEqual(
    errors.map((e) => e.line),
    [MAX_TILES + 1, MAX_TILES + 2],
  )
})

test('garbage input never throws', () => {
  for (const input of [undefined, null, '', 42, '=', '===', ':', 'app:', '#']) {
    assert.doesNotThrow(() => parseConfig(input))
  }
  assert.deepEqual(parseConfig(undefined).tiles, [])
})

test('a blank or missing stored config falls back to the defaults', () => {
  assert.equal(effectiveConfig(undefined), DEFAULT_CONFIG_TEXT)
  assert.equal(effectiveConfig('  \n '), DEFAULT_CONFIG_TEXT)
  assert.equal(effectiveConfig('A = hr'), 'A = hr')
})

test('every built-in app in the table maps to a constant the router exports', () => {
  for (const app of SYSTEM_APPS) {
    assert.equal(typeof router['SYSTEM_APP_' + app.id], 'number', `SYSTEM_APP_${app.id} (${app.name})`)
  }
  const names = SYSTEM_APPS.map((app) => app.name)
  assert.equal(new Set(names).size, names.length, 'names are unique')
})

test('describeTile explains each kind of target', () => {
  const describe = (line) => describeTile(parseConfig(line).tiles[0])
  assert.equal(describe('A = hr'), 'built-in hr')
  assert.equal(describe('A = screen:X'), 'screen X')
  assert.equal(describe('A = app:5:page/a'), 'app 5, page page/a')
  assert.equal(describe('A = name:Calc'), 'app named "Calc"')
})

test('every built-in app has an icon, and @icon overrides it along with a colour', () => {
  for (const app of SYSTEM_APPS) {
    const [tile] = parseConfig(app.name).tiles
    assert.ok(ICONS.includes(tile.icon), `${app.name} -> ${tile.icon}`)
  }
  const { tiles, errors } = parseConfig('Gym = workout @star #112233\nCalc = app:5 @APP')
  assert.deepEqual(errors, [])
  assert.equal(tiles[0].icon, 'star')
  assert.equal(tiles[0].color, 0x112233)
  assert.equal(tiles[1].icon, 'app')
})
