import { world } from '../world.mjs'

export class Calorie {
  getCurrent() {
    if (world.burned === null) throw new Error('permission denied')
    return world.burned
  }
}

export class Time {
  // UTC, in milliseconds
  getTime() {
    return world.now.getTime()
  }
  getFullYear() {
    return world.now.getFullYear()
  }
  // 1-12, unlike Date
  getMonth() {
    return world.now.getMonth() + 1
  }
  getDate() {
    return world.now.getDate()
  }
  getHours() {
    return world.now.getHours()
  }
  getMinutes() {
    return world.now.getMinutes()
  }
  getSeconds() {
    return world.now.getSeconds()
  }
}

// world.sleep: { asleep, endTime (minutes after midnight), totalTime }, or
// null for a watch with no sleep on record. world.sleepBroken makes it throw,
// as a missing permission would.
export class Sleep {
  updateInfo() {}
  getInfo() {
    if (world.sleepBroken) throw new Error('permission denied')
    const s = world.sleep
    return s ? { score: 80, deepTime: 60, startTime: s.startTime || 0, endTime: s.endTime, totalTime: s.totalTime } : { score: 0, deepTime: 0, startTime: 0, endTime: 0, totalTime: 0 }
  }
  getSleepingStatus() {
    if (world.sleepBroken) throw new Error('permission denied')
    return world.sleep && world.sleep.asleep ? 1 : 0
  }
}

// The motor. world.vibrations lists the modes started, in order. The scene
// numbers are made up, except 27, which an official sample uses for
// VIBRATOR_SCENE_DURATION.
export const VIBRATOR_SCENE_SHORT_LIGHT = 23
export const VIBRATOR_SCENE_SHORT_MIDDLE = 24
export const VIBRATOR_SCENE_SHORT_STRONG = 25
export const VIBRATOR_SCENE_DURATION = 27
export const VIBRATOR_SCENE_DURATION_LONG = 28
export const VIBRATOR_SCENE_STRONG_REMINDER = 9
export const VIBRATOR_SCENE_NOTIFICATION = 0
export class Vibrator {
  constructor() {
    this.mode = VIBRATOR_SCENE_SHORT_MIDDLE
  }
  setMode(mode) {
    this.mode = mode
  }
  start() {
    world.vibrations.push(this.mode)
  }
  stop() {}
}

// world.worn: true on the wrist, false off it, null when the watch is not sure.
export class Wear {
  getStatus() {
    if (world.worn === null) return 3
    return world.worn ? 1 : 0
  }
  onChange() {}
  offChange() {}
}
