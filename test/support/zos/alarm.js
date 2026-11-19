import { world } from '../world.mjs'

// Alarms wake a page or an app service at a UTC time in seconds. The mock
// only records them; tests fire them with fireAlarm() in the harness.
export const REPEAT_ONCE = 'ONCE'

export function set(option) {
  if (world.alarmsBroken) return 0
  if (!option || !option.url) throw new Error('alarm.set: url is required')
  if (!option.time && !option.delay) throw new Error('alarm.set: time or delay is required')
  const id = world.nextAlarmId++
  world.alarms.push({ id, ...option })
  return id
}

export function cancel(option) {
  const id = typeof option === 'object' ? option.id : option
  world.alarms = world.alarms.filter((a) => a.id !== id)
  return 0
}

export const getAllAlarms = () => world.alarms.map((a) => a.id)
