// Watch-side state shared by both pages. Each page is compiled into its own
// bundle, so module variables are not shared between them; the app's
// globalData is. Keeping one LocalStorage instance and one in-memory copy
// there means a page never reads a stale log after another page wrote to it.
import { LocalStorage } from '@zos/storage'
import { Time } from '@zos/sensor'

import { normaliseDb, prune, dayKey } from './log'
import { normaliseSettings } from './settings'

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key, ''))
  } catch (e) {
    return null
  }
}

export function session() {
  const globalData = getApp()._options.globalData
  if (!globalData.session) {
    const storage = new LocalStorage()
    globalData.session = {
      storage,
      time: new Time(),
      db: normaliseDb(readJson(storage, 'db')),
      settings: normaliseSettings(readJson(storage, 'settings')),
    }
  }
  return globalData.session
}

// The watch's own clock, in local time; getMonth() is 1-12.
export function today() {
  const { time } = session()
  return dayKey(time.getFullYear(), time.getMonth(), time.getDate())
}

export function saveDb() {
  const s = session()
  s.storage.setItem('db', JSON.stringify(prune(s.db)))
}

export function saveSettings(raw) {
  const s = session()
  s.settings = normaliseSettings(raw)
  s.storage.setItem('settings', JSON.stringify(s.settings))
  return s.settings
}
