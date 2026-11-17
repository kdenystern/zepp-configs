// Tasks, their repeats and the day arithmetic. Shared by the watch page, the
// phone's side service and the settings page, so it must stay free of
// platform imports.
//
//   task = { id, title, repeat, due: 'YYYY-MM-DD', done: 'YYYY-MM-DD' | '' }
//   repeat = null | { days: n } | { months: n } | { on: [weekdays, 0 = Sunday] }
//
// A task shows from its `due` day until it is checked off, however long that
// takes. Checking off a one-off finishes it; a repeating task moves its `due`
// on, counted from the day it was done. `done` is the last day it was checked.

export const TASKS_KEY = 'tasks' // settings storage: { next, tasks }, kept for good
export const UNDO_KEY = 'undo' // settings storage: what the phone can undo today

// The list's day changes at 04:00, so something ticked off after midnight
// still counts for the day that is ending.
export const DAY_STARTS_AT = 4
export const MAX_TITLE = 80
export const MAX_UNDO = 30

// --- days ---

const DAY_MS = 86400000
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n) => (n < 10 ? '0' + n : '' + n)
const parts = (key) => key.split('-').map(Number)

// month is 1-12.
export const dayKey = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`
export const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function dayNumber(key) {
  const [year, month, day] = parts(key)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

export function addDays(key, count) {
  const date = new Date((dayNumber(key) + count) * DAY_MS)
  return dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

// The same day of a later month, or that month's last day if it is shorter.
export function addMonths(key, count) {
  const [year, month, day] = parts(key)
  const index = year * 12 + (month - 1) + count
  const toYear = Math.floor(index / 12)
  const toMonth = (index % 12) + 1
  const last = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate()
  return dayKey(toYear, toMonth, Math.min(day, last))
}

// 0 = Sunday. 1970-01-01 was a Thursday.
export const weekday = (key) => (dayNumber(key) + 4) % 7

// The list's day for a wall-clock time; month is 1-12.
export function listDay(year, month, day, hours) {
  const key = dayKey(year, month, day)
  return hours < DAY_STARTS_AT ? addDays(key, -1) : key
}

export const dateDay = (date) => listDay(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours())

// "Thu 19 Nov"
export function prettyDay(key) {
  const [, month, day] = parts(key)
  return `${DAY_NAMES[weekday(key)]} ${day} ${MONTH_NAMES[month - 1]}`
}

// --- repeats ---

const whole = (value, max) => Number.isInteger(value) && value >= 1 && value <= max

export function normaliseRepeat(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.on)) {
    const on = [0, 1, 2, 3, 4, 5, 6].filter((d) => raw.on.indexOf(d) >= 0)
    if (on.length === 7) return { days: 1 }
    return on.length ? { on } : null
  }
  if (whole(raw.days, 3660)) return { days: raw.days }
  if (whole(raw.months, 120)) return { months: raw.months }
  return null
}

const UNITS = { day: { days: 1 }, week: { days: 7 }, month: { months: 1 }, year: { months: 12 } }
const ADVERBS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

function weekdayIndex(word) {
  const name = word.replace(/\.$/, '')
  if (name === 'weds') return 3
  return FULL_DAY_NAMES.findIndex(
    (full) => name === full || name === full + 's' || (name.length >= 3 && full.indexOf(name) === 0),
  )
}

// What follows "every": "day", "3 days", "other week", "month", "mon, thu",
// "weekday". Returns a repeat, or null if it is something else.
function parseRepeat(text) {
  const rest = text.trim().toLowerCase()
  const unit = /^(?:(\d{1,3}|other|second)\s+)?(day|week|month|year)s?$/.exec(rest)
  if (unit) {
    const count = unit[1] === undefined ? 1 : /^\d/.test(unit[1]) ? Number(unit[1]) : 2
    const size = UNITS[unit[2]]
    return normaliseRepeat(size.days ? { days: count * size.days } : { months: count * size.months })
  }
  if (/^weekdays?$/.test(rest)) return { on: [1, 2, 3, 4, 5] }
  if (/^weekends?$/.test(rest)) return { on: [0, 6] }
  const words = rest.split(/(?:[\s,&+/]|\band\b)+/).filter(Boolean)
  const on = words.map(weekdayIndex)
  if (!on.length || on.some((d) => d < 0)) return null
  return normaliseRepeat({ on })
}

// "Workout every 3 days" -> { title: 'Workout', repeat: { days: 3 } }. Text
// without a repeat it can read is a one-off with the whole text as its title.
// Returns null for blank text.
export function parseTask(text) {
  const clean = String(text === undefined || text === null ? '' : text)
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null

  let title = clean
  let repeat = null
  const every = /^(.*)\b(?:every|each)\s+(.+)$/i.exec(clean)
  const adverb = /^(.*\S)[\s,;:(-]+(daily|weekly|monthly|yearly)\)?$/i.exec(clean)
  if (every) {
    const head = every[1].replace(/[\s,;:(-]+$/, '')
    const found = head ? parseRepeat(every[2].replace(/[).]+$/, '')) : null
    if (found) {
      title = head
      repeat = found
    }
  } else if (adverb) {
    title = adverb[1].replace(/[\s,;:(-]+$/, '') || clean
    if (title !== clean) repeat = { ...UNITS[ADVERBS[adverb[2].toLowerCase()]] }
  }
  return { title: title.slice(0, MAX_TITLE).trim(), repeat }
}

const count = (n, unit) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`)

// "every 3 days", "every Mon, Thu", or '' for a one-off.
export function repeatLabel(repeat) {
  if (!repeat) return ''
  if (repeat.days) return repeat.days % 7 === 0 ? count(repeat.days / 7, 'week') : count(repeat.days, 'day')
  if (repeat.months) return repeat.months % 12 === 0 ? count(repeat.months / 12, 'year') : count(repeat.months, 'month')
  if (repeat.on.join() === '1,2,3,4,5') return 'every weekday'
  // Monday first, Sunday last.
  const days = repeat.on.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  return 'every ' + days.map((d) => DAY_NAMES[d]).join(', ')
}

// The text that parses back into this task: what the phone shows for editing.
export const taskText = (task) => (task.repeat ? `${task.title} ${repeatLabel(task.repeat)}` : task.title)

const sameRepeat = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// --- one task ---

const copy = (task) => JSON.parse(JSON.stringify(task))

export const isFinished = (task) => !task.repeat && !!task.done
export const isDue = (task, day) => !isFinished(task) && task.due <= day

function nextOn(on, after) {
  for (let i = 1; i <= 7; i++) {
    const day = addDays(after, i)
    if (on.indexOf(weekday(day)) >= 0) return day
  }
  return after
}

// When a task added (or given a new repeat) on `day` first shows.
function firstDue(repeat, day) {
  if (repeat && repeat.on && repeat.on.indexOf(weekday(day)) < 0) return nextOn(repeat.on, day)
  return day
}

// The task after being checked off on `day`.
export function checked(task, day) {
  const { repeat } = task
  let due = task.due
  if (repeat && repeat.days) due = addDays(day, repeat.days)
  else if (repeat && repeat.months) due = addMonths(day, repeat.months)
  else if (repeat) due = nextOn(repeat.on, day)
  return { ...copy(task), due, done: day }
}

function normaliseTask(raw) {
  if (!raw || typeof raw !== 'object' || !whole(raw.id, 1e9)) return null
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE) : ''
  if (!title || !isDay(raw.due)) return null
  return {
    id: raw.id,
    title,
    repeat: normaliseRepeat(raw.repeat),
    due: raw.due,
    done: isDay(raw.done) ? raw.done : '',
  }
}

// Coerces whatever came out of storage or over the air into valid tasks in
// id order, which is the order they were added in.
export function normaliseTasks(raw) {
  const seen = {}
  return (Array.isArray(raw) ? raw : [])
    .map(normaliseTask)
    .filter((task) => task && !seen[task.id] && (seen[task.id] = true))
    .sort((a, b) => a.id - b.id)
}

export const dueTasks = (tasks, day) => tasks.filter((task) => isDue(task, day))

// "Today", "Tomorrow" or "Thu 19 Nov": when the task next shows.
export function whenLabel(task, day) {
  if (task.due <= day) return 'Today'
  return task.due === addDays(day, 1) ? 'Tomorrow' : prettyDay(task.due)
}

// --- undo: the tasks checked off today, as they were before ---

function readJson(stored) {
  if (typeof stored !== 'string') return stored
  try {
    return JSON.parse(stored)
  } catch (e) {
    return null
  }
}

// An undo list is only good for the day it was made on.
export function readUndo(stored, day) {
  const raw = readJson(stored)
  if (!raw || typeof raw !== 'object' || raw.day !== day || !Array.isArray(raw.stack)) return { day, stack: [] }
  return { day, stack: raw.stack.map(normaliseTask).filter(Boolean).slice(-MAX_UNDO) }
}

function pushUndo(undo, task) {
  undo.stack.push(copy(task))
  if (undo.stack.length > MAX_UNDO) undo.stack.shift()
}

// --- the phone's database ---

export function readDb(stored) {
  const raw = readJson(stored)
  const tasks = normaliseTasks(raw && raw.tasks)
  const top = tasks.reduce((max, task) => Math.max(max, task.id), 0)
  return { next: Math.max(raw && whole(raw.next, 1e9) ? raw.next : 1, top + 1), tasks }
}

const find = (db, id) => db.tasks.find((task) => task.id === Number(id))

export function addTask(db, text, day) {
  const parsed = parseTask(text)
  if (!parsed || !parsed.title) return null
  const task = { id: db.next++, title: parsed.title, repeat: parsed.repeat, due: firstDue(parsed.repeat, day), done: '' }
  db.tasks.push(task)
  return task
}

// A new repeat starts the task afresh from `day`; a new title changes nothing else.
export function editTask(db, id, text, day) {
  const task = find(db, id)
  const parsed = parseTask(text)
  if (!task || !parsed || !parsed.title) return null
  task.title = parsed.title
  if (!sameRepeat(task.repeat, parsed.repeat)) {
    task.repeat = parsed.repeat
    task.due = firstDue(parsed.repeat, day)
  }
  return task
}

export function deleteTask(db, id) {
  const before = db.tasks.length
  db.tasks = db.tasks.filter((task) => task.id !== Number(id))
  return db.tasks.length < before
}

export function checkTask(db, undo, id, day) {
  const task = find(db, id)
  if (!task || !isDue(task, day)) return null
  pushUndo(undo, task)
  return Object.assign(task, checked(task, day))
}

// Puts the task checked off last back as it was. Returns it, or null.
export function uncheckTask(db, undo) {
  while (undo.stack.length) {
    const before = undo.stack.pop()
    const task = find(db, before.id)
    // Deleted since: try the one before.
    if (task) return Object.assign(task, { due: before.due, done: before.done })
  }
  return null
}

// What the watch needs: everything except finished one-offs.
export const activeTasks = (db) => db.tasks.filter((task) => !isFinished(task))

// Finished one-offs, newest first.
export const finishedTasks = (db) =>
  db.tasks.filter(isFinished).sort((a, b) => (a.done < b.done ? 1 : a.done > b.done ? -1 : b.id - a.id))

// --- the watch's copy ---
//
//   state = { base, changes, undo }
//
// `base` is the phone's list as last received. `changes` are the tasks
// checked or unchecked on the watch that the phone has not confirmed yet,
// keyed by id. What the watch shows is always `current(state)`, so it keeps
// working, and keeps its changes, for as long as the phone is away.

export function normaliseChanges(raw) {
  const changes = {}
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((id) => {
      const task = normaliseTask(raw[id])
      if (task) changes[task.id] = task
    })
  }
  return changes
}

export function readState(stored, day) {
  const raw = readJson(stored) || {}
  return {
    base: normaliseTasks(raw.base),
    changes: normaliseChanges(raw.changes),
    undo: readUndo(raw.undo, day),
  }
}

export function current(state) {
  const tasks = state.base.map(copy)
  Object.keys(state.changes).forEach((id) => {
    const change = state.changes[id]
    const task = tasks.find((t) => t.id === change.id)
    if (task) Object.assign(task, { due: change.due, done: change.done })
    // Not in the phone's list: a finished one-off brought back by undo.
    else tasks.push(copy(change))
  })
  return tasks.sort((a, b) => a.id - b.id)
}

export function watchCheck(state, id, day) {
  state.undo = readUndo(state.undo, day)
  const task = current(state).find((t) => t.id === id)
  if (!task || !isDue(task, day)) return null
  pushUndo(state.undo, task)
  state.changes[id] = checked(task, day)
  return state.changes[id]
}

export function watchUncheck(state, day) {
  state.undo = readUndo(state.undo, day)
  const before = state.undo.stack.pop()
  if (!before) return null
  state.changes[before.id] = before
  return before
}

// The part of the changes the phone needs: { id: { due, done } }
export function outgoing(changes) {
  const out = {}
  Object.keys(changes).forEach((id) => {
    out[id] = { due: changes[id].due, done: changes[id].done }
  })
  return out
}

// The phone answered a sync that carried `sent`: take its list, and keep only
// the changes made since.
export function received(state, tasks, sent) {
  Object.keys(sent || {}).forEach((id) => {
    const change = state.changes[id]
    if (change && change.due === sent[id].due && change.done === sent[id].done) delete state.changes[id]
  })
  state.base = normaliseTasks(tasks)
}

// Phone side: writes the watch's changes into the database. A change to a
// task deleted meanwhile is dropped. Returns whether anything changed.
export function applyChanges(db, changes) {
  let changed = false
  if (!changes || typeof changes !== 'object') return changed
  Object.keys(changes).forEach((id) => {
    const task = find(db, id)
    const change = changes[id]
    if (!task || !change || !isDay(change.due)) return
    const done = isDay(change.done) ? change.done : ''
    if (task.due === change.due && task.done === done) return
    task.due = change.due
    task.done = done
    changed = true
  })
  return changed
}
