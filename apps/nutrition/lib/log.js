// The intake log kept on the watch. Pure data logic, no platform imports.
//
//   db = { days: { 'YYYY-MM-DD': { kcal, protein, log: [[kcal, protein], ...] } } }
//
// `log` holds the individual additions of a day so the last one can be undone.

export const KEEP_DAYS = 30
export const MAX_AMOUNT = 9999
const MAX_LOG = 100

const pad = (n) => (n < 10 ? '0' + n : '' + n)

// month is 1-12.
export function dayKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function amount(value) {
  const n = Math.round(Number(value))
  if (!(n > 0)) return 0
  return Math.min(n, MAX_AMOUNT)
}

// Coerces whatever came out of storage into a valid db, so a corrupt or
// outdated file degrades to an empty log instead of crashing the page.
export function normaliseDb(raw) {
  const db = { days: {} }
  const days = raw && typeof raw === 'object' && raw.days
  if (!days || typeof days !== 'object') return db

  Object.keys(days).forEach((key) => {
    const day = days[key]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object') return
    const log = Array.isArray(day.log)
      ? day.log.filter((e) => Array.isArray(e)).map((e) => [amount(e[0]), amount(e[1])])
      : []
    db.days[key] = {
      kcal: Math.max(0, Math.round(Number(day.kcal)) || 0),
      protein: Math.max(0, Math.round(Number(day.protein)) || 0),
      log,
    }
  })
  return db
}

export function totals(db, day) {
  const d = db.days[day]
  return d ? { kcal: d.kcal, protein: d.protein } : { kcal: 0, protein: 0 }
}

// Adds to a day's totals. Returns the entry added, or null if both are zero.
export function addEntry(db, day, kcal, protein) {
  const entry = [amount(kcal), amount(protein)]
  if (entry[0] === 0 && entry[1] === 0) return null

  const d = db.days[day] || (db.days[day] = { kcal: 0, protein: 0, log: [] })
  d.kcal += entry[0]
  d.protein += entry[1]
  d.log.push(entry)
  if (d.log.length > MAX_LOG) d.log.shift()
  return entry
}

// Removes the most recent addition of a day. Returns it, or null if none.
export function undoLast(db, day) {
  const d = db.days[day]
  if (!d || d.log.length === 0) return null
  const entry = d.log.pop()
  d.kcal = Math.max(0, d.kcal - entry[0])
  d.protein = Math.max(0, d.protein - entry[1])
  return entry
}

// Drops all but the most recent `keep` days.
export function prune(db, keep = KEEP_DAYS) {
  const keys = Object.keys(db.days).sort()
  keys.slice(0, Math.max(0, keys.length - keep)).forEach((key) => delete db.days[key])
  return db
}

// Compact per-day totals sent to the phone: { 'YYYY-MM-DD': [kcal, protein] }
export function summary(db) {
  const out = {}
  Object.keys(db.days).forEach((key) => {
    out[key] = [db.days[key].kcal, db.days[key].protein]
  })
  return out
}

// Width in pixels of a progress bar; 0 hides it, otherwise never thinner than
// `min` so rounded ends still render.
export function barWidth(value, goal, full, min) {
  if (!(value > 0) || !(goal > 0)) return 0
  return Math.max(min, Math.round(full * Math.min(1, value / goal)))
}
