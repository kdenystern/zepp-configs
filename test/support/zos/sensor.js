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
}
