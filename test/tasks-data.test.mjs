// The Tasks app's data logic: reading tasks from text, repeats, days, the
// phone's database and the watch's copy of it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addDays,
  addMonths,
  weekday,
  listDay,
  dateDay,
  prettyDay,
  parseTask,
  repeatLabel,
  taskText,
  normaliseRepeat,
  normaliseTasks,
  isDue,
  isFinished,
  checked,
  whenLabel,
  readUndo,
  readDb,
  addTask,
  editTask,
  deleteTask,
  checkTask,
  uncheckTask,
  activeTasks,
  finishedTasks,
  readState,
  current,
  watchCheck,
  watchUncheck,
  outgoing,
  received,
  applyChanges,
  MAX_TITLE,
  MAX_UNDO,
} from '../apps/tasks/lib/tasks.js'

const MON = '2026-11-16' // a Monday

test('day arithmetic crosses months, years and leap days', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays(MON, 3), '2026-11-19')
  assert.equal(weekday(MON), 1)
  assert.equal(weekday('2026-11-22'), 0)
  assert.equal(weekday('1970-01-01'), 4)
})

test('a month later is the same day, or the last day of a shorter month', () => {
  assert.equal(addMonths('2026-11-16', 1), '2026-12-16')
  assert.equal(addMonths('2026-12-16', 1), '2027-01-16')
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28')
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonths('2026-11-16', 12), '2027-11-16')
})

test('the list keeps showing yesterday until four in the morning', () => {
  assert.equal(listDay(2026, 11, 16, 12), '2026-11-16')
  assert.equal(listDay(2026, 11, 17, 0), '2026-11-16')
  assert.equal(listDay(2026, 11, 17, 3), '2026-11-16')
  assert.equal(listDay(2026, 11, 17, 4), '2026-11-17')
  assert.equal(listDay(2027, 1, 1, 1), '2026-12-31')
  assert.equal(dateDay(new Date(2026, 10, 17, 2, 30)), '2026-11-16')
  assert.equal(prettyDay('2026-11-19'), 'Thu 19 Nov')
})

test('plain text is a one-off', () => {
  assert.deepEqual(parseTask('Buy milk and star anise'), { title: 'Buy milk and star anise', repeat: null })
  assert.deepEqual(parseTask('  Call   the dentist '), { title: 'Call the dentist', repeat: null })
  assert.equal(parseTask(''), null)
  assert.equal(parseTask('   '), null)
  assert.equal(parseTask(undefined), null)
})

test('a repeat is read off the end of the text', () => {
  const repeat = (text) => parseTask(text).repeat
  assert.deepEqual(parseTask('Take pills every day'), { title: 'Take pills', repeat: { days: 1 } })
  assert.deepEqual(parseTask('Workout every 3 days'), { title: 'Workout', repeat: { days: 3 } })
  assert.deepEqual(parseTask('Take pills, daily'), { title: 'Take pills', repeat: { days: 1 } })
  assert.deepEqual(parseTask('Workout (every 3 days)'), { title: 'Workout', repeat: { days: 3 } })
  assert.deepEqual(parseTask('Workout - Every Other Day'), { title: 'Workout', repeat: { days: 2 } })
  assert.deepEqual(repeat('Clean every week'), { days: 7 })
  assert.deepEqual(repeat('Clean weekly'), { days: 7 })
  assert.deepEqual(repeat('Sheets every 2 weeks'), { days: 14 })
  assert.deepEqual(repeat('Rent every month'), { months: 1 })
  assert.deepEqual(repeat('Filter every 3 months'), { months: 3 })
  assert.deepEqual(repeat('Check-up yearly'), { months: 12 })
  assert.deepEqual(repeat('Bins every tue'), { on: [2] })
  assert.deepEqual(repeat('Bins every Thursday and Monday'), { on: [1, 4] })
  assert.deepEqual(repeat('Run every mon, wed, fri'), { on: [1, 3, 5] })
  assert.deepEqual(repeat('Stand-up every weekday'), { on: [1, 2, 3, 4, 5] })
  assert.deepEqual(repeat('Long run every weekend'), { on: [0, 6] })
  assert.deepEqual(repeat('Each one each day'), { days: 1 })
})

test('text that only looks like a repeat stays a one-off, whole', () => {
  for (const text of ['Thank everyone', 'Try every flavour', 'every day', 'Stretch every 0 days', 'Daily']) {
    assert.deepEqual(parseTask(text), { title: text, repeat: null }, text)
  }
})

test('a task is shown as text that reads back the same', () => {
  const labels = {
    'Take pills every day': 'every day',
    'Workout every 3 days': 'every 3 days',
    'Clean every week': 'every week',
    'Sheets every 2 weeks': 'every 2 weeks',
    'Rent every month': 'every month',
    'Filter every 3 months': 'every 3 months',
    'Check-up every year': 'every year',
    'Bins every Mon, Thu': 'every Mon, Thu',
    'Rest every Sat, Sun': 'every Sat, Sun',
    'Stand-up every weekday': 'every weekday',
  }
  for (const [text, label] of Object.entries(labels)) {
    const task = parseTask(text)
    assert.equal(repeatLabel(task.repeat), label)
    assert.equal(taskText(task), text)
    assert.deepEqual(parseTask(taskText(task)), task)
  }
  assert.equal(repeatLabel(null), '')
  assert.equal(taskText({ title: 'Buy milk', repeat: null }), 'Buy milk')
})

test('repeats from storage are validated', () => {
  assert.deepEqual(normaliseRepeat({ days: 3 }), { days: 3 })
  assert.deepEqual(normaliseRepeat({ on: [4, 1, 1, 9] }), { on: [1, 4] })
  assert.deepEqual(normaliseRepeat({ on: [0, 1, 2, 3, 4, 5, 6] }), { days: 1 })
  for (const bad of [null, 'daily', {}, { days: 0 }, { days: 1.5 }, { days: 99999 }, { months: -1 }, { on: [] }, { on: [7] }]) {
    assert.equal(normaliseRepeat(bad), null)
  }
})

test('titles are cut to a sensible length', () => {
  assert.equal(parseTask('x'.repeat(200)).title.length, MAX_TITLE)
})

const task = (over) => ({ id: 1, title: 'T', repeat: null, due: MON, done: '', ...over })

test('a task is due from its day until it is checked off', () => {
  assert.equal(isDue(task(), MON), true)
  assert.equal(isDue(task(), '2026-11-20'), true)
  assert.equal(isDue(task({ due: '2026-11-17' }), MON), false)
  assert.equal(isDue(task({ done: MON }), '2026-11-17'), false)
  assert.equal(isFinished(task({ done: MON })), true)
  assert.equal(isFinished(task({ repeat: { days: 1 }, done: MON })), false)
})

test('checking off moves a repeating task on from the day it was done', () => {
  assert.deepEqual(checked(task(), MON), task({ done: MON }))
  assert.equal(checked(task({ repeat: { days: 1 } }), MON).due, '2026-11-17')
  assert.equal(checked(task({ repeat: { days: 3 } }), MON).due, '2026-11-19')
  // Done two days late: the next one is three days after that.
  assert.equal(checked(task({ repeat: { days: 3 } }), '2026-11-18').due, '2026-11-21')
  assert.equal(checked(task({ repeat: { months: 1 } }), MON).due, '2026-12-16')
  assert.equal(checked(task({ repeat: { on: [1, 4] } }), MON).due, '2026-11-19')
  assert.equal(checked(task({ repeat: { on: [1] } }), MON).due, '2026-11-23')
  // Monday's task done on Tuesday: Thursday is still next.
  assert.equal(checked(task({ repeat: { on: [1, 4] } }), '2026-11-17').due, '2026-11-19')
  const original = task({ repeat: { days: 3 } })
  checked(original, MON)
  assert.equal(original.due, MON)
})

test('when a task is next on the list', () => {
  assert.equal(whenLabel(task(), MON), 'Today')
  assert.equal(whenLabel(task({ due: '2026-11-10' }), MON), 'Today')
  assert.equal(whenLabel(task({ due: '2026-11-17' }), MON), 'Tomorrow')
  assert.equal(whenLabel(task({ due: '2026-11-19' }), MON), 'Thu 19 Nov')
})

test('tasks from storage are validated, deduplicated and put in order', () => {
  const tasks = normaliseTasks([
    { id: 2, title: 'B', due: MON, done: 'yesterday' },
    { id: 1, title: ' A ', repeat: { days: 2 }, due: MON, done: MON, extra: 1 },
    { id: 2, title: 'again', due: MON },
    { id: 3, title: '', due: MON },
    { id: 4, title: 'no day' },
    { id: 0, title: 'bad id', due: MON },
    null,
    'junk',
  ])
  assert.deepEqual(tasks, [
    { id: 1, title: 'A', repeat: { days: 2 }, due: MON, done: MON },
    { id: 2, title: 'B', repeat: null, due: MON, done: '' },
  ])
  assert.deepEqual(normaliseTasks('nope'), [])
})

test('the database starts empty and survives junk', () => {
  assert.deepEqual(readDb(undefined), { next: 1, tasks: [] })
  assert.deepEqual(readDb('{not json'), { next: 1, tasks: [] })
  assert.deepEqual(readDb('[]'), { next: 1, tasks: [] })
  // Ids are never reused, even if the counter was lost.
  assert.equal(readDb(JSON.stringify({ tasks: [task({ id: 7 })] })).next, 8)
  assert.equal(readDb(JSON.stringify({ next: 20, tasks: [task({ id: 7 })] })).next, 20)
})

test('adding, editing and deleting tasks', () => {
  const db = readDb('')
  assert.deepEqual(addTask(db, 'Take pills every day', MON), { id: 1, title: 'Take pills', repeat: { days: 1 }, due: MON, done: '' })
  assert.equal(addTask(db, '  ', MON), null)
  // A weekday task first shows on its next weekday, or today if that is one.
  assert.equal(addTask(db, 'Bins every thu', MON).due, '2026-11-19')
  assert.equal(addTask(db, 'Plan the week every mon', MON).due, MON)
  assert.deepEqual(db.tasks.map((t) => t.id), [1, 2, 3])

  // A new title leaves the schedule alone.
  db.tasks[0].due = '2026-11-17'
  db.tasks[0].done = MON
  assert.equal(editTask(db, 1, 'Take the pills every day', MON).title, 'Take the pills')
  assert.equal(db.tasks[0].due, '2026-11-17')
  // A new repeat starts afresh.
  editTask(db, 1, 'Take the pills every 2 days', MON)
  assert.deepEqual(db.tasks[0], { id: 1, title: 'Take the pills', repeat: { days: 2 }, due: MON, done: MON })
  assert.equal(editTask(db, 1, '', MON), null)
  assert.equal(editTask(db, 99, 'x', MON), null)
  assert.equal(db.tasks[0].title, 'Take the pills')

  assert.equal(deleteTask(db, 2), true)
  assert.equal(deleteTask(db, 2), false)
  assert.equal(addTask(db, 'New', MON).id, 4)
})

test('checking off and undoing on the phone', () => {
  const db = readDb('')
  const undo = readUndo(undefined, MON)
  addTask(db, 'Take pills every day', MON)
  addTask(db, 'Buy milk', MON)

  assert.equal(checkTask(db, undo, 2, MON).done, MON)
  assert.equal(checkTask(db, undo, 2, MON), null)
  assert.equal(checkTask(db, undo, 1, MON).due, '2026-11-17')
  assert.equal(checkTask(db, undo, 1, MON), null)
  assert.deepEqual(activeTasks(db).map((t) => t.title), ['Take pills'])
  assert.deepEqual(finishedTasks(db).map((t) => t.title), ['Buy milk'])

  // Latest first.
  assert.equal(uncheckTask(db, undo).title, 'Take pills')
  assert.deepEqual(db.tasks[0], { id: 1, title: 'Take pills', repeat: { days: 1 }, due: MON, done: '' })
  assert.equal(uncheckTask(db, undo).title, 'Buy milk')
  assert.equal(db.tasks[1].done, '')
  assert.equal(uncheckTask(db, undo), null)
})

test('undo skips a task deleted since, and is only good for its own day', () => {
  const db = readDb('')
  const undo = readUndo(undefined, MON)
  addTask(db, 'A', MON)
  addTask(db, 'B', MON)
  checkTask(db, undo, 1, MON)
  checkTask(db, undo, 2, MON)
  deleteTask(db, 2)
  assert.equal(uncheckTask(db, undo).title, 'A')

  checkTask(db, undo, 1, MON)
  const stored = JSON.stringify(undo)
  assert.equal(readUndo(stored, MON).stack.length, 1)
  assert.deepEqual(readUndo(stored, '2026-11-17'), { day: '2026-11-17', stack: [] })
  assert.deepEqual(readUndo('junk', MON), { day: MON, stack: [] })
})

test('the undo list is capped', () => {
  const db = readDb('')
  const undo = readUndo(undefined, MON)
  for (let i = 1; i <= MAX_UNDO + 5; i++) {
    addTask(db, 'Task ' + i, MON)
    checkTask(db, undo, i, MON)
  }
  assert.equal(undo.stack.length, MAX_UNDO)
  assert.equal(undo.stack[0].id, 6)
})

test('finished one-offs are listed newest first', () => {
  const db = readDb('')
  const undo = readUndo(undefined, MON)
  ;['A', 'B', 'C'].forEach((title) => addTask(db, title, MON))
  checkTask(db, undo, 2, MON)
  checkTask(db, undo, 1, '2026-11-17')
  checkTask(db, undo, 3, MON)
  assert.deepEqual(finishedTasks(db).map((t) => t.title), ['A', 'C', 'B'])
})

// --- the watch's copy ---

function phoneAndWatch() {
  const db = readDb('')
  addTask(db, 'Take pills every day', MON)
  addTask(db, 'Workout every 3 days', MON)
  addTask(db, 'Buy milk', MON)
  const state = readState(undefined, MON)
  received(state, activeTasks(db), {})
  return { db, state }
}

// One round trip, as the page and the side service do it.
function sync(db, state) {
  const sent = outgoing(state.changes)
  applyChanges(db, JSON.parse(JSON.stringify(sent)))
  received(state, JSON.parse(JSON.stringify(activeTasks(db))), sent)
}

const titles = (state, day) => current(state).filter((t) => isDue(t, day)).map((t) => t.title)

test('the watch state starts empty and survives junk', () => {
  assert.deepEqual(readState(undefined, MON), { base: [], changes: {}, undo: { day: MON, stack: [] } })
  assert.deepEqual(readState('{nope', MON), { base: [], changes: {}, undo: { day: MON, stack: [] } })
  const { state } = phoneAndWatch()
  watchCheck(state, 3, MON)
  assert.deepEqual(readState(JSON.stringify(state), MON), state)
  // The next day the changes are still there to send, but undo is gone.
  const tomorrow = readState(JSON.stringify(state), '2026-11-17')
  assert.deepEqual(tomorrow.changes, state.changes)
  assert.deepEqual(tomorrow.undo.stack, [])
})

test('checking off on the watch shows at once and reaches the phone on sync', () => {
  const { db, state } = phoneAndWatch()
  assert.equal(watchCheck(state, 1, MON).due, '2026-11-17')
  assert.equal(watchCheck(state, 1, MON), null)
  assert.equal(watchCheck(state, 99, MON), null)
  watchCheck(state, 3, MON)
  assert.deepEqual(titles(state, MON), ['Workout'])
  assert.deepEqual(outgoing(state.changes), { 1: { due: '2026-11-17', done: MON }, 3: { due: MON, done: MON } })

  sync(db, state)
  assert.deepEqual(state.changes, {})
  assert.deepEqual(titles(state, MON), ['Workout'])
  assert.deepEqual(finishedTasks(db).map((t) => t.title), ['Buy milk'])
  assert.deepEqual(titles(state, '2026-11-17'), ['Take pills', 'Workout'])
})

test('undo on the watch brings tasks back, even a one-off the phone already filed as done', () => {
  const { db, state } = phoneAndWatch()
  watchCheck(state, 1, MON)
  watchCheck(state, 3, MON)
  sync(db, state)
  assert.deepEqual(state.base.map((t) => t.id), [1, 2])

  assert.equal(watchUncheck(state, MON).title, 'Buy milk')
  assert.deepEqual(titles(state, MON), ['Workout', 'Buy milk'])
  assert.equal(watchUncheck(state, MON).title, 'Take pills')
  assert.deepEqual(titles(state, MON), ['Take pills', 'Workout', 'Buy milk'])
  assert.equal(watchUncheck(state, MON), null)

  sync(db, state)
  assert.deepEqual(state.changes, {})
  assert.deepEqual(finishedTasks(db), [])
  assert.deepEqual(db.tasks.map((t) => [t.due, t.done]), [[MON, ''], [MON, ''], [MON, '']])
  // Yesterday's ticks cannot be undone today.
  watchCheck(state, 1, MON)
  assert.equal(watchUncheck(state, '2026-11-17'), null)
})

test('changes made while a sync is out are kept for the next one', () => {
  const { db, state } = phoneAndWatch()
  watchCheck(state, 1, MON)
  const sent = outgoing(state.changes)
  applyChanges(db, sent)
  const answer = JSON.parse(JSON.stringify(activeTasks(db)))
  // Before the answer arrives: one more tick, and the first one undone again.
  watchCheck(state, 3, MON)
  watchUncheck(state, MON)
  watchUncheck(state, MON)
  watchCheck(state, 2, MON)
  received(state, answer, sent)

  assert.deepEqual(Object.keys(state.changes), ['1', '2', '3'])
  assert.deepEqual(titles(state, MON), ['Take pills', 'Buy milk'])
  sync(db, state)
  assert.deepEqual(state.changes, {})
  assert.deepEqual(db.tasks.map((t) => t.done), ['', MON, ''])
})

test('the phone list wins for titles and deletions, the watch for what it ticked', () => {
  const { db, state } = phoneAndWatch()
  watchCheck(state, 2, MON)
  editTask(db, 1, 'Take the pills every day', MON)
  deleteTask(db, 3)
  addTask(db, 'Post the letter', MON)
  sync(db, state)
  assert.deepEqual(titles(state, MON), ['Take the pills', 'Post the letter'])
  assert.equal(db.tasks[1].due, '2026-11-19')

  // A tick for a task the phone has deleted goes nowhere.
  watchCheck(state, 4, MON)
  deleteTask(db, 4)
  sync(db, state)
  assert.deepEqual(state.changes, {})
  assert.deepEqual(titles(state, MON), ['Take the pills'])
})

test('changes from the watch are checked before they are stored', () => {
  const { db } = phoneAndWatch()
  assert.equal(applyChanges(db, null), false)
  assert.equal(applyChanges(db, { 1: null, 2: { due: 'soon', done: MON }, 99: { due: MON, done: MON } }), false)
  assert.equal(applyChanges(db, { 1: { due: MON, done: '' } }), false)
  assert.equal(applyChanges(db, { 1: { due: '2026-11-17', done: 'x' } }), true)
  assert.deepEqual([db.tasks[0].due, db.tasks[0].done], ['2026-11-17', ''])
})
