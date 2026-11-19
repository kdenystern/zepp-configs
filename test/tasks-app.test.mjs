// Runs the real Tasks page, side service and settings page against the mock
// watch and phone in test/support.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  loadApp,
  reset,
  world,
  startApp,
  closeApp,
  flush,
  buttons,
  tap,
  texts,
  widgetsOf,
  settingsPage,
  settingsText,
  settingsCards,
  cardTitle,
  assertDark,
  nodes,
} from './support/harness.mjs'

let entry
before(async () => {
  entry = await loadApp('tasks')
})
beforeEach(() => reset())

// --- the watch ---

const rowButtons = () => buttons().filter((b) => b.params.normal_src === 'row.png')
const rowTexts = () => widgetsOf('TEXT').filter((t) => t.params.text_style === 'WRAP')
const shown = () => rowTexts().map((t) => t.params.text)
function tapRow(title) {
  const text = rowTexts().find((t) => t.params.text === title)
  assert.ok(text, `no row "${title}"; have: ${shown().join(', ')}`)
  tap(rowButtons().find((b) => b.params.y === text.params.y))
}
const undoButton = () => buttons().find((b) => b.params.text === 'Undo')
// The two layers: the list, which scrolls, and the strip that holds Undo.
const layers = () => world.widgets.filter((w) => w.type === 'VIEW_CONTAINER')
const bottomOf = (layer, widgets = world.widgets) =>
  Math.max(...widgets.filter((w) => w.parent === layer).map((w) => w.params.y + Math.max(w.params.h, 0)))
// Where Undo is on the screen.
const undoAt = () => undoButton().parent.params.y + undoButton().params.y
const watchState = () => JSON.parse(JSON.parse(world.files.state))

async function open() {
  startApp(entry)
  await flush()
}

// --- the phone ---

const section = (title) => settingsCards(settingsPage()).find((card) => cardTitle(card).split(' (')[0] === title)
const add = (text) => nodes(settingsPage(), 'TextInput')[0].props.onChange(text)
const db = () => JSON.parse(world.settings.get('tasks'))
const task = (title) => db().tasks.find((t) => t.title === title)
const press = (sectionTitle, label, nth = 0) =>
  nodes(section(sectionTitle), 'Button').filter((b) => b.props.label === label)[nth].props.onClick()
const setTime = (day, hour = 12) => {
  world.now = new Date(2026, 10, day, hour, 0, 0)
}

const ROUTINE = ['Take pills every day', 'Workout every 3 days', 'Buy milk and star anise']
const TITLES = ['Take pills', 'Workout', 'Buy milk and star anise']

test('a new watch says where tasks come from', async () => {
  await open()
  assert.deepEqual(shown(), [])
  assert.ok(texts().includes('Today'))
  assert.ok(texts().includes('No tasks yet'))
  assert.ok(texts().includes('Add them in the Zepp app'))
  assert.equal(undoButton(), undefined)
  assert.equal(world.statusBarVisible, false)
})

test('tasks added on the phone are on the watch the next time it opens', async () => {
  ROUTINE.forEach(add)
  await open()
  assert.deepEqual(shown(), TITLES)
  assert.ok(!texts().includes('No tasks yet'))
  assert.equal(undoButton(), undefined)
  // Rows sit one under the other, each button exactly over its title.
  assert.deepEqual(rowButtons().map((b) => b.params.y), [62, 126, 190])
  assert.deepEqual(rowTexts().map((t) => t.params.y), [62, 126, 190])
})

test('a task added while the watch app is open appears straight away', async () => {
  await open()
  add('Take pills every day')
  assert.deepEqual(shown(), ['Take pills'])
  add('Buy milk')
  assert.deepEqual(shown(), ['Take pills', 'Buy milk'])
  assert.ok(!texts().includes('No tasks yet'))
})

test('tapping a task checks it off: it goes, the rest move up, the phone hears', async () => {
  ROUTINE.forEach(add)
  await open()
  let pushes = 0
  const onCall = world.page.onCall
  world.page.onCall = (data) => {
    pushes++
    onCall.call(world.page, data)
  }

  tapRow('Workout')
  assert.deepEqual(shown(), ['Take pills', 'Buy milk and star anise'])
  assert.deepEqual(rowButtons().map((b) => b.params.y), [62, 126])
  assert.equal(undoAt(), 388)

  await flush()
  assert.deepEqual([task('Workout').due, task('Workout').done], ['2026-11-19', '2026-11-16'])
  assert.deepEqual(watchState().changes, {})
  assert.equal(pushes, 0, 'the answer to the sync is enough')

  tapRow('Buy milk and star anise')
  await flush()
  assert.equal(task('Buy milk and star anise').done, '2026-11-16')
  assert.deepEqual(shown(), ['Take pills'])
  assert.ok(settingsText(section('Done')).includes('Mon 16 Nov    Buy milk and star anise'))
})

test('undo brings back the last task checked off, one at a time', async () => {
  ROUTINE.forEach(add)
  await open()
  tapRow('Take pills')
  tapRow('Buy milk and star anise')
  await flush()
  assert.deepEqual(shown(), ['Workout'])

  tap(undoButton())
  assert.deepEqual(shown(), ['Workout', 'Buy milk and star anise'])
  tap(undoButton())
  assert.deepEqual(shown(), TITLES)
  assert.equal(undoButton(), undefined)

  await flush()
  assert.deepEqual(db().tasks.map((t) => [t.due, t.done]), Array(3).fill(['2026-11-16', '']))
})

test('everything checked off says so, with undo still at hand', async () => {
  ROUTINE.forEach(add)
  await open()
  TITLES.forEach(tapRow)
  assert.deepEqual(shown(), [])
  assert.deepEqual(rowButtons(), [])
  assert.ok(texts().includes('All done'))
  assert.ok(!texts().includes('Add them in the Zepp app'))
  assert.equal(undoAt(), 388)

  tap(undoButton())
  assert.deepEqual(shown(), ['Buy milk and star anise'])
  assert.ok(!texts().includes('All done'))
})

test('undo stays at the bottom of the screen, on a layer above the list', async () => {
  for (let i = 1; i <= 8; i++) add('Task ' + i)
  await open()
  const [list, fixed] = layers()
  assert.equal(layers().length, 2)
  assert.deepEqual([list.params.y, list.params.h], [0, 450], 'the list has the whole screen')
  assert.ok(!list.params.z_index && list.params.scroll_enable !== 0, 'and scrolls')
  assert.deepEqual([fixed.params.z_index, fixed.params.scroll_enable], [1, 0])
  assert.equal(fixed.params.y + fixed.params.h, 450)
  assert.ok(rowButtons().every((b) => b.parent === list))
  assert.ok(rowTexts().every((t) => t.parent === list))

  // Nothing on the fixed layer shows until there is something to undo.
  const onFixed = () => world.widgets.filter((w) => w.parent === fixed && w.visible)
  assert.deepEqual(onFixed(), [])
  tapRow('Task 3')
  assert.deepEqual(onFixed().map((w) => w.type), ['FILL_RECT', 'BUTTON'])
  assert.equal(undoButton().parent, fixed)
  const place = { ...undoButton().params }
  for (const title of ['Task 1', 'Task 2', 'Task 4', 'Task 5', 'Task 6', 'Task 7', 'Task 8']) {
    tapRow(title)
    assert.deepEqual({ ...undoButton().params }, place, 'undo did not move')
  }
  tap(undoButton())
  assert.deepEqual({ ...undoButton().params }, place)
})

test('repeating tasks come back when they are due; one-offs stay done', async () => {
  ROUTINE.forEach(add)
  await open()
  TITLES.forEach(tapRow)
  await flush()
  closeApp()

  setTime(17)
  await open()
  assert.deepEqual(shown(), ['Take pills'])
  assert.equal(undoButton(), undefined, 'yesterday cannot be undone')
  closeApp()

  setTime(19)
  await open()
  assert.deepEqual(shown(), ['Take pills', 'Workout'])
})

test('a task not done stays on the list, and repeats count from when it was done', async () => {
  ROUTINE.forEach(add)
  setTime(18)
  await open()
  assert.deepEqual(shown(), TITLES)
  tapRow('Workout')
  tapRow('Take pills')
  await flush()
  assert.equal(task('Workout').due, '2026-11-21')
  assert.equal(task('Take pills').due, '2026-11-19')
})

test('after midnight it is still the same day until four', async () => {
  add('Take pills every day')
  world.now = new Date(2026, 10, 17, 0, 30, 0)
  await open()
  tapRow('Take pills')
  await flush()
  assert.deepEqual([task('Take pills').due, task('Take pills').done], ['2026-11-17', '2026-11-16'])
  closeApp()

  world.now = new Date(2026, 10, 17, 3, 59, 0)
  await open()
  assert.deepEqual(shown(), [])
  closeApp()

  world.now = new Date(2026, 10, 17, 4, 0, 0)
  await open()
  assert.deepEqual(shown(), ['Take pills'])
})

test('without the phone the watch works from its copy and catches up later', async () => {
  ROUTINE.forEach(add)
  await open()
  closeApp()

  world.phoneConnected = false
  await open()
  assert.deepEqual(shown(), TITLES)
  tapRow('Take pills')
  tapRow('Buy milk and star anise')
  await flush()
  assert.equal(task('Take pills').done, '')
  closeApp()

  // Still away the next day: the list moves on by itself.
  setTime(17)
  await open()
  assert.deepEqual(shown(), ['Take pills', 'Workout'])
  tapRow('Take pills')
  await flush()
  closeApp()

  world.phoneConnected = true
  await open()
  assert.deepEqual(shown(), ['Workout'])
  assert.deepEqual([task('Take pills').due, task('Take pills').done], ['2026-11-18', '2026-11-17'])
  assert.equal(task('Buy milk and star anise').done, '2026-11-16')
  assert.deepEqual(watchState().changes, {})
})

test('the watch still works when messaging is broken', async () => {
  ROUTINE.forEach(add)
  await open()
  closeApp()
  world.messagingBroken = true
  await open()
  tapRow('Workout')
  assert.deepEqual(shown(), ['Take pills', 'Buy milk and star anise'])
  tap(undoButton())
  assert.deepEqual(shown(), TITLES)
})

test('quick taps go out together instead of one request each', async () => {
  ROUTINE.forEach(add)
  await open()
  const requests = []
  const onRequest = world.side.onRequest
  world.side.onRequest = (req, res) => {
    requests.push(Object.keys(req.params.changes))
    onRequest.call(world.side, req, res)
  }
  TITLES.forEach(tapRow)
  await flush()
  assert.deepEqual(requests, [['1'], ['2', '3']])
  assert.deepEqual(db().tasks.map((t) => t.done), Array(3).fill('2026-11-16'))
  assert.deepEqual(watchState().changes, {})
})

test('a long list scrolls, with room under the last row', async () => {
  for (let i = 1; i <= 8; i++) add('Task ' + i)
  await open()
  assert.equal(shown().length, 8)
  const [list, fixed] = layers()
  // Scrolled to the end, the last row stops where the strip with Undo starts.
  const rowsEnd = 62 + 8 * 64
  assert.equal(bottomOf(list), rowsEnd + fixed.params.h)
  assert.equal(rowsEnd - (bottomOf(list) - 450), fixed.params.y)

  // The list growing while open gets more rows and more room.
  add('Task 9')
  assert.equal(shown().length, 9)
  assert.equal(shown()[8], 'Task 9')
  assert.equal(bottomOf(list), rowsEnd + 64 + fixed.params.h)
})

test('the list fits one screen without scrolling up to five tasks', async () => {
  for (let i = 1; i <= 5; i++) add('Task ' + i)
  await open()
  const [list, fixed] = layers()
  assert.ok(bottomOf(list) <= fixed.params.y, `the list ends at ${bottomOf(list)}, clear of undo`)
  tapRow('Task 1')
  assert.ok(undoButton())
  tap(undoButton())
  assert.equal(shown().length, 5)
  assert.ok(bottomOf(list) <= fixed.params.y, 'nothing was added to scroll to')
})

test('the side service turns down requests it does not know', async () => {
  await open()
  await assert.rejects(world.page.request({ method: 'NOPE' }))
})

// --- the settings page ---

test('the settings page starts empty and explains itself', () => {
  const text = settingsText(settingsPage())
  assert.ok(text.includes('No tasks yet.'))
  assert.ok(text.includes('Nothing here yet.'))
  assert.ok(text.includes('Nothing finished yet.'))
  assert.equal(cardTitle(section('Today')), 'Today')
  assert.ok(text.some((line) => /every 3 days/.test(line)), 'it says how to make a task repeat')
})

test('adding a task is a button of its own at the top of the settings page', () => {
  const [first] = settingsPage().children
  assert.equal(first.type, 'View')
  assert.deepEqual([first.props.style.background, first.props.style.color], ['#ffffff', '#000000'])
  const [input] = first.children
  assert.equal(input.type, 'TextInput')
  assert.equal(input.props.label, '+  Add a task')
  assert.equal(input.props.value, undefined, 'it starts empty every time')
  input.props.onChange('Buy stamps')
  assert.equal(task('Buy stamps').due, '2026-11-16')
})

test('the settings page lists today and every task with when it is next due', () => {
  ROUTINE.forEach(add)
  add('Bins every thu')
  add('Sheets every 2 weeks\nPost the letter\n\n')
  assert.equal(db().tasks.length, 6)

  assert.deepEqual(settingsText(section('Today')), [
    'Today (5)',
    'Take pills',
    'every day',
    'Workout',
    'every 3 days',
    'Buy milk and star anise',
    'Sheets',
    'every 2 weeks',
    'Post the letter',
  ])
  const inputs = nodes(section('All tasks'), 'TextInput')
  assert.deepEqual(inputs.map((i) => i.props.value), [
    'Take pills every day',
    'Workout every 3 days',
    'Buy milk and star anise',
    'Bins every Thu',
    'Sheets every 2 weeks',
    'Post the letter',
  ])
  assert.deepEqual(inputs.map((i) => i.props.label), ['Today', 'Today', 'Today', 'Thu 19 Nov', 'Today', 'Today'])
})

test('tasks can be checked off and undone on the phone too', async () => {
  ROUTINE.forEach(add)
  await open()
  press('Today', 'Done', 1)
  assert.equal(task('Workout').due, '2026-11-19')
  assert.deepEqual(shown(), ['Take pills', 'Buy milk and star anise'], 'the open watch app follows')
  assert.equal(nodes(section('All tasks'), 'TextInput')[1].props.label, 'Thu 19 Nov')

  press('Today', 'Done', 1)
  assert.equal(cardTitle(section('Today')), 'Today (1)')
  assert.ok(settingsText(section('Done')).includes('Mon 16 Nov    Buy milk and star anise'))
  assert.equal(nodes(section('All tasks'), 'TextInput').length, 2)

  press('Today', 'Undo: Buy milk and star anise')
  press('Today', 'Undo: Workout')
  assert.equal(cardTitle(section('Today')), 'Today (3)')
  assert.deepEqual(shown(), TITLES)
  assert.equal(nodes(section('Today'), 'Button').filter((b) => b.props.label.startsWith('Undo')).length, 0)

  press('Today', 'Done', 0)
  press('Today', 'Done', 0)
  press('Today', 'Done', 0)
  assert.ok(settingsText(section('Today')).includes('Nothing left for today.'))
  setTime(17)
  assert.equal(nodes(section('Today'), 'Button').filter((b) => b.props.label.startsWith('Undo')).length, 0)
  assert.equal(nodes(section('All tasks'), 'TextInput')[1].props.label, 'Thu 19 Nov')
  assert.equal(nodes(section('All tasks'), 'TextInput')[0].props.label, 'Today')
})

test('tasks can be changed and deleted on the phone', async () => {
  ROUTINE.forEach(add)
  await open()
  const edit = (nth, text) => nodes(section('All tasks'), 'TextInput')[nth].props.onChange(text)

  edit(2, 'Buy oat milk')
  assert.deepEqual(shown(), ['Take pills', 'Workout', 'Buy oat milk'])
  edit(1, 'Workout every thu')
  assert.deepEqual(task('Workout').repeat, { on: [4] })
  assert.deepEqual(shown(), ['Take pills', 'Buy oat milk'])
  edit(0, '')
  assert.equal(task('Take pills').title, 'Take pills', 'blank text changes nothing')

  press('All tasks', 'Delete', 0)
  assert.deepEqual(db().tasks.map((t) => t.title), ['Workout', 'Buy oat milk'])
  assert.deepEqual(shown(), ['Buy oat milk'])
  add('Stretch')
  assert.equal(task('Stretch').id, 4, 'ids are not reused')
})

test('the arrows on the phone reorder the tasks, and the watch follows', async () => {
  ROUTINE.forEach(add)
  await open()
  press('All tasks', '▼', 0)
  assert.deepEqual(db().tasks.map((t) => t.title), ['Workout', 'Take pills', 'Buy milk and star anise'])
  press('All tasks', '▲', 2)
  assert.deepEqual(db().tasks.map((t) => t.title), ['Workout', 'Buy milk and star anise', 'Take pills'])
  press('All tasks', '▲', 0)
  press('All tasks', '▼', 2)
  assert.deepEqual(db().tasks.map((t) => t.title), ['Workout', 'Buy milk and star anise', 'Take pills'], 'ends stay put')
  await open()
  assert.deepEqual(shown(), ['Workout', 'Buy milk and star anise', 'Take pills'])
})

test('a change on the phone starts from what is stored, not from what the page showed', async () => {
  ROUTINE.forEach(add)
  const stale = settingsPage()
  await open()
  tapRow('Take pills')
  await flush()
  // A button from before the watch synced.
  nodes(stale, 'Button').filter((b) => b.props.label === 'Delete')[2].props.onClick()
  assert.equal(task('Take pills').done, '2026-11-16')
  assert.equal(db().tasks.length, 2)
})

test('the settings page is dark, down to every text and button', () => {
  assertDark(settingsPage())
  ROUTINE.forEach(add)
  press('Today', 'Done', 2)
  assert.equal(nodes(section('Today'), 'Button').filter((b) => b.props.label.startsWith('Undo')).length, 1)
  assert.equal(settingsText(section('Done')).length, 3)
  assertDark(settingsPage())
})
